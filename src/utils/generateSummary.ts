import type {
  GPXActivity, GPXSplit, GPXInterval, ClimbSegment,
  TRIMPResult, CardiacDrift,
} from "./gpxParser";
import type { FitSummary } from "./gpxCore";
import type { HillRepeatSeries } from "./hillRepeats";
import { CLIMB_CATEGORIES } from "./gpxParser";
import { formatDuration, formatPace } from "../components/SplitsTable";
import { describeWeatherCode, windDirectionLabel, describeTimeOfDay, type WeatherInfo } from "./weather";

/** Options d'entrée pour la génération du résumé IA. */
interface SummaryOptions {
  activity: GPXActivity;
  splits: GPXSplit[];
  climbs: ClimbSegment[];
  intervals: { efforts: GPXInterval[]; recoveries: GPXInterval[] } | null;
  hillRepeats?: HillRepeatSeries[];
  fcMax: number;
  fcRest: number;
  trimp: TRIMPResult | null;
  drift: CardiacDrift | null;
  fitSummary?: FitSummary | null;
  tsbResult?: { atl: number; ctl: number; tsb: number } | null;
  activityName?: string; // nom personnalisé (override du nom original)
  location?: string | null; // lieu géocodé (voir App.tsx locationName)
  weather?: WeatherInfo | null;
}

// ── Zones cardiaques Karvonen ────────────────────────────────────────────────

/**
 * Calcule les bornes absolues (bpm) des 5 zones cardiaques Karvonen.
 * Formule : FC_zone = FC_repos + %HRR × (FC_max − FC_repos).
 * Seuils : Z1 < 60%, Z2 60–70%, Z3 70–80%, Z4 80–90%, Z5 ≥ 90% HRR.
 */
function hrZoneBounds(fcMax: number, fcRest: number) {
  const hRR = fcMax - fcRest;
  return [
    { label: "Z1 — Récupération active", lo: 0,    hi: Math.round(fcRest + hRR * 0.60) },
    { label: "Z2 — Endurance aérobie",   lo: Math.round(fcRest + hRR * 0.60), hi: Math.round(fcRest + hRR * 0.70) },
    { label: "Z3 — Aérobie / Tempo",     lo: Math.round(fcRest + hRR * 0.70), hi: Math.round(fcRest + hRR * 0.80) },
    { label: "Z4 — Seuil",               lo: Math.round(fcRest + hRR * 0.80), hi: Math.round(fcRest + hRR * 0.90) },
    { label: "Z5 — VO2max",              lo: Math.round(fcRest + hRR * 0.90), hi: fcMax + 999 },
  ];
}

/** Calcule la répartition du temps (% et secondes) par zone cardiaque Karvonen pour les points de l'activité. */
function zoneStats(points: GPXActivity["points"], fcMax: number, fcRest: number) {
  const zones = hrZoneBounds(fcMax, fcRest);
  const counts = zones.map(() => 0);
  let total = 0;
  for (const p of points) {
    if (p.hr === null) continue;
    total++;
    for (let z = zones.length - 1; z >= 0; z--) {
      if (p.hr >= zones[z].lo) { counts[z]++; break; }
    }
  }
  if (total === 0) return null;
  const duration = points.length > 1
    ? ((points[points.length - 1].time?.getTime() ?? 0) - (points[0].time?.getTime() ?? 0)) / 1000
    : 0;
  return zones.map((z, i) => ({
    label: z.label,
    lo: z.lo,
    hi: z.hi === fcMax + 999 ? fcMax : z.hi,
    pct: Math.round((counts[i] / total) * 100),
    seconds: Math.round((counts[i] / total) * duration),
  }));
}

/** Vitesse ascensionnelle moyenne (m/h) d'un intervalle — utilisée dans le détail par répétition VMA. */
function intervalVAM(iv: GPXInterval): number | null {
  if (!iv.totalAscent || iv.duration <= 0) return null;
  return Math.round(iv.totalAscent / (iv.duration / 3600));
}

// Une vraie répétition structurée (VMA/côtes/seuil) dure rarement plus de 30 min — au-delà, un
// "effort" issu des laps .fit est presque toujours un lap accidentel/pause sur une sortie longue
// (ex. SL 21 km : 2 laps dont un de 2h01, classé "effort" faute de mieux par la comparaison de FC
// médiane entre seulement 2 laps) plutôt qu'un vrai intervalle.
const MAX_STRUCTURED_INTERVAL_DURATION_S = 30 * 60;

/** Vrai uniquement si les laps .fit représentent de vrais intervalles structurés (pas un lap pause/étape sur une sortie longue). */
function hasStructuredIntervals(activity: GPXActivity, intervals: { efforts: GPXInterval[] } | null): boolean {
  if (!activity.fitLaps?.length || !intervals || intervals.efforts.length < 2) return false;
  return intervals.efforts.every(iv => iv.duration <= MAX_STRUCTURED_INTERVAL_DURATION_S);
}

/**
 * Génère un prompt texte pour analyse IA d'une séance, adapté au type d'activité :
 * - Vélo : vitesse/cadence/puissance de base, pas de fractionnés ni splits (données déjà denses)
 * - Course (footing/trail) : allure, splits par km
 * - Course avec fractionnés détectés (VMA/intervalles) : détail par répétition à la place des splits
 * Dans les trois cas : charge (CTL/ATL/TSB, TRIMP Banister), dérive cardiaque, météo, ressenti —
 * pas de profil athlète (redondant avec le contexte de conversation), pas de métriques dérivées
 * peu fiables (TRIMP Edwards, TSS/EPOC/Training Effect montre), pas de liste de questions finale.
 */
export function generateSummary(opts: SummaryOptions): string {
  const { activity, splits, climbs, intervals, hillRepeats,
          fcMax, fcRest, trimp, drift, fitSummary,
          tsbResult, activityName, location, weather } = opts;

  const isCycling = activity.activityType === "cycling";
  // Séance VMA/côtes/seuil au sens du template Greg = laps structurés issus du .fit (pas la
  // détection heuristique par vitesse, qui peut aussi se déclencher sur un trail vallonné), ET
  // chaque répétition doit avoir une durée plausible pour un vrai intervalle — sinon un lap
  // pause/étape sur un footing ou une sortie longue serait affiché comme une "répétition".
  const isVmaSession = !isCycling && hasStructuredIntervals(activity, intervals);
  const lines: string[] = [];
  const push = (s: string) => lines.push(s);
  const sep = () => lines.push("");

  const displayName = activityName || activity.name;
  push(`Voici les données de ma séance de ${isCycling ? "vélo" : "course à pied"}${displayName ? ` "${displayName}"` : ""}${location ? ` à ${location}` : ""}. Peux-tu analyser ma performance et me donner des recommandations personnalisées ?`);
  sep();

  // ── Données générales ────────────────────────────────────────────────────────
  push("📊 DONNÉES GÉNÉRALES");
  if (activity.startTime) {
    const dateLong = activity.startTime.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const tod = describeTimeOfDay(activity.startTime);
    const hh = String(activity.startTime.getHours()).padStart(2, '0');
    const mm = String(activity.startTime.getMinutes()).padStart(2, '0');
    push(`• Date : ${dateLong} — ${tod.label} (${hh}:${mm})`);
  }
  push(`• Distance : ${(activity.totalDistance / 1000).toFixed(2)} km`);
  push(`• Durée totale : ${formatDuration(activity.totalDuration)}  |  Temps en mouvement : ${formatDuration(activity.movingTime)}`);
  if (isCycling) {
    push(`• Vitesse moyenne : ${(activity.avgSpeed * 3.6).toFixed(1)} km/h  |  Max : ${(activity.maxSpeed * 3.6).toFixed(1)} km/h`);
  } else if (activity.avgPace > 0) {
    push(`• Allure moyenne : ${formatPace(activity.avgPace)} /km`);
  }
  push(`• Dénivelé : +${activity.elevationGain} m / -${activity.elevationLoss} m`);
  if (activity.avgHeartRate) push(`• FC moyenne : ${activity.avgHeartRate} bpm  |  FC max séance : ${activity.maxHeartRate ?? "–"} bpm`);
  if (isCycling && activity.avgCadence !== null) push(`• Cadence moyenne : ${activity.avgCadence} rpm`);
  sep();

  // ── Météo ───────────────────────────────────────────────────────────────────
  if (weather && weather.temperature != null) {
    const { label } = describeWeatherCode(weather.weatherCode);
    push("🌤️ MÉTÉO AU DÉPART");
    push(`• ${label}, ${Math.round(weather.temperature)}°C`);
    if (weather.windSpeed != null) push(`• Vent : ${Math.round(weather.windSpeed)} km/h ${windDirectionLabel(weather.windDirection)}`);
    sep();
  }

  // ── Zones cardiaques ────────────────────────────────────────────────────────
  const zones = zoneStats(activity.points, fcMax, fcRest);
  if (zones) {
    push("❤️ ZONES CARDIAQUES (Karvonen)");
    for (const z of zones) {
      if (z.pct === 0) continue;
      push(`• ${z.label} (${z.lo}–${z.hi} bpm) : ${z.pct}% — ${formatDuration(z.seconds)}`);
    }
    sep();
  }

  // ── Charge d'entraînement ───────────────────────────────────────────────────
  if (trimp || drift || tsbResult || fitSummary?.feeling != null) {
    push("📈 CHARGE & MÉTRIQUES PHYSIOLOGIQUES");
    if (tsbResult) {
      const { ctl, atl, tsb } = tsbResult;
      const tsbState = tsb >= 10 ? "Frais (pic de forme)" : tsb >= 0 ? "En forme" : tsb >= -10 ? "Légèrement fatigué" : "Fatigué / surcharge";
      push(`• CTL (forme chronique) : ${ctl}  |  ATL (fatigue aiguë) : ${atl}  |  TSB (fraîcheur) : ${tsb > 0 ? "+" : ""}${tsb} → ${tsbState}`);
    }
    if (trimp) push(`• TRIMP Banister : ${trimp.banister}`);
    if (drift) {
      // Dérive < 5% = bonne endurance aérobie ; 5–9% = modérée ; > 9% = élevée
      const severity = drift.decoupling < 5 ? "faible" : drift.decoupling < 9 ? "modérée" : "élevée";
      push(`• Dérive cardiaque : ${drift.decoupling.toFixed(1)}% (${severity}) — EF1 ${drift.ef1.toFixed(2)} → EF2 ${drift.ef2.toFixed(2)}`);
    }
    if (fitSummary?.feeling != null) {
      const feelLabels: Record<number, string> = { 1: "Très difficile", 2: "Difficile", 3: "Normal", 4: "Bon", 5: "Excellent" };
      push(`• Ressenti athlète : ${fitSummary.feeling}/5 — ${feelLabels[Math.round(fitSummary.feeling)] ?? ""}`);
    }
    sep();
  }

  // ── Montées ─────────────────────────────────────────────────────────────────
  if (climbs.length > 0) {
    push(`⛰️ MONTÉES DÉTECTÉES (${climbs.length})`);
    for (let i = 0; i < climbs.length; i++) {
      const c = climbs[i];
      const def = CLIMB_CATEGORIES[c.category];
      const dist = c.distance >= 1000 ? `${(c.distance / 1000).toFixed(2)} km` : `${c.distance} m`;
      let line = `• Montée ${i + 1} [${def.label}] : ${dist}, D+ ${c.elevGain} m, pente moy. ${c.avgGrade.toFixed(1)}% (max ${c.maxGrade.toFixed(1)}%)`;
      if (c.vam > 0) line += `, VAM ${c.vam} m/h`;
      if (!isCycling && c.avgPace > 0) line += `, allure ${formatPace(c.avgPace)} /km`;
      if (isCycling && c.duration > 0) line += `, vitesse ${((c.distance / c.duration) * 3.6).toFixed(1)} km/h`;
      push(line);
    }
    sep();
  }

  // ── Répétitions de côtes ─────────────────────────────────────────────────────
  if (hillRepeats && hillRepeats.length > 0) {
    push(`🔁 RÉPÉTITIONS DE CÔTES (${hillRepeats.length} série${hillRepeats.length > 1 ? "s" : ""})`);
    for (const s of hillRepeats) {
      let line = `• ${s.repCount} rép. — dist. moy. ${s.avgDistance >= 1000 ? (s.avgDistance/1000).toFixed(2)+"km" : Math.round(s.avgDistance)+"m"}, D+ moy. ${Math.round(s.avgElevGain)} m, allure moy. ${formatPace(s.avgPace)} /km, VAM ${s.avgVAM} m/h`;
      if (s.fatiguePct !== null) line += ` — fatigue : ${s.fatiguePct > 0 ? "+" : ""}${s.fatiguePct.toFixed(1)}%`;
      push(line);
    }
    sep();
  }

  if (isVmaSession) {
    // ── Détail par répétition (VMA / intervalles, laps .fit prioritaires) ────────
    const eff = intervals!.efforts;
    push(`⚡ DÉTAIL PAR RÉPÉTITION (${eff.length}, issu du .fit)`);
    for (let i = 0; i < eff.length; i++) {
      const iv = eff[i];
      const distLabel = iv.distance >= 1000 ? `${(iv.distance / 1000).toFixed(2)} km` : `${Math.round(iv.distance)} m`;
      const vam = intervalVAM(iv);
      let line = `• Rép. ${i + 1} : ${formatDuration(Math.round(iv.duration))}, ${distLabel}`;
      if (vam !== null) line += `, VAM ${vam} m/h`;
      if (iv.avgHeartRate) line += `, FC ${iv.avgHeartRate}${iv.maxHeartRate ? `/${iv.maxHeartRate}` : ""} bpm (moy/max)`;
      line += `, allure ${formatPace(iv.avgPace)} /km`;
      push(line);
    }
    sep();
  } else if (!isCycling) {
    // ── Splits par km (course, hors séances VMA/intervalles) ────────────────────
    if (splits.length >= 2) {
      const distLabel = splits[0].distance >= 900
        ? `${(splits[0].distance / 1000).toFixed(1)} KM`
        : `${splits[0].distance} M`;
      push(`📏 SPLITS PAR ${distLabel}`);
      for (const s of splits) {
        const at = s.cumulativeDistance >= 900
          ? `@${(s.cumulativeDistance / 1000).toFixed(1)} km`
          : `@${s.cumulativeDistance} m`;
        let line = `• ${at} — allure ${formatPace(s.avgPace)} /km`;
        if (s.avgHeartRate) line += `, FC ${s.avgHeartRate} bpm`;
        push(line);
      }
      sep();
    }
  }

  return lines.join("\n");
}
