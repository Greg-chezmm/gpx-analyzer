import type {
  GPXActivity, GPXSplit, GPXInterval, ClimbSegment,
  TRIMPResult, VO2maxEstimate, CardiacDrift,
} from "./gpxParser";
import type { FitSummary } from "./gpxCore";
import type { HillRepeatSeries } from "./hillRepeats";
import type { TrainingEntry } from "../hooks/useTrainingHistory";
import { CLIMB_CATEGORIES } from "./gpxParser";
import { formatDuration, formatPace } from "../components/SplitsTable";
import { computeVDOT } from "./vdot";
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
  vma: number;
  ftp: number;
  weight: number;
  birthYear: number;
  sessionType: string | null;
  trimp: TRIMPResult | null;
  vo2max: VO2maxEstimate | null;
  drift: CardiacDrift | null;
  fitSummary?: FitSummary | null;
  normalizedPower?: number | null;
  intensityFactor?: number | null;
  tsbResult?: { atl: number; ctl: number; tsb: number } | null;
  history?: TrainingEntry[];
  activityDate?: string; // YYYY-MM-DD — pour exclure la séance courante de l'historique
  activityName?: string; // nom personnalisé (override du nom original)
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

// ── Zones d'allure % VMA ────────────────────────────────────────────────────

/** Définition des zones d'allure en % VMA (course à pied). */
const PACE_ZONES = [
  { label: "Z1 — Récupération",          pctMin: 0,    pctMax: 0.50 },
  { label: "Z2 — Endurance fondamentale",pctMin: 0.50, pctMax: 0.65 },
  { label: "Z3 — Aérobie",               pctMin: 0.65, pctMax: 0.80 },
  { label: "Z4 — Seuil",                 pctMin: 0.80, pctMax: 0.90 },
  { label: "Z5 — VO2max / Fractionné",   pctMin: 0.90, pctMax: Infinity },
];

/** Calcule la répartition du temps par zone d'allure % VMA (interpolation temporelle point-à-point). */
function paceZoneStats(points: GPXActivity["points"], vmaKmh: number) {
  const vmaMs = vmaKmh / 3.6;
  const secs = new Array<number>(PACE_ZONES.length).fill(0);
  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    if (!curr.speed || curr.speed < 0.3) continue;
    if (!curr.time || !prev.time) continue;
    const dt = (curr.time.getTime() - prev.time.getTime()) / 1000;
    if (dt <= 0 || dt > 60) continue;
    const pct = ((curr.speed + (prev.speed ?? curr.speed)) / 2) / vmaMs;
    let z = 0;
    for (let j = PACE_ZONES.length - 1; j >= 0; j--) {
      if (pct >= PACE_ZONES[j].pctMin) { z = j; break; }
    }
    secs[z] += dt;
  }
  const total = secs.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return PACE_ZONES.map((z, i) => ({
    label: z.label,
    pct: Math.round((secs[i] / total) * 100),
    seconds: secs[i],
    speedMin: z.pctMin * vmaMs,
    speedMax: z.pctMax === Infinity ? null : z.pctMax * vmaMs,
  }));
}

// ── Zones de puissance Coggan ────────────────────────────────────────────────

/**
 * Définition des 7 zones de puissance Coggan (vélo) en % FTP.
 * Z1 < 55%, Z2 55–75%, Z3 75–90%, Z4 90–105% (seuil), Z5 105–120% (VO2max),
 * Z6 120–150% (anaérobie), Z7 > 150% (neuromusculaire).
 */
const POWER_ZONES = [
  { label: "Z1 — Récupération active",  pctMin: 0,    pctMax: 0.55 },
  { label: "Z2 — Endurance",            pctMin: 0.55, pctMax: 0.75 },
  { label: "Z3 — Tempo",                pctMin: 0.75, pctMax: 0.90 },
  { label: "Z4 — Seuil lactique",       pctMin: 0.90, pctMax: 1.05 },
  { label: "Z5 — VO2max",               pctMin: 1.05, pctMax: 1.20 },
  { label: "Z6 — Capacité anaérobie",   pctMin: 1.20, pctMax: 1.50 },
  { label: "Z7 — Neuromusculaire",      pctMin: 1.50, pctMax: Infinity },
];

/** Calcule la répartition du temps par zone de puissance Coggan (% FTP) pour les points de l'activité. */
function powerZoneStats(points: GPXActivity["points"], ftp: number) {
  if (ftp <= 0) return null;
  const secs = new Array<number>(POWER_ZONES.length).fill(0);
  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    if (curr.power === null || prev.power === null) continue;
    if (!curr.time || !prev.time) continue;
    const dt = (curr.time.getTime() - prev.time.getTime()) / 1000;
    if (dt <= 0 || dt > 60) continue;
    const avgW = (curr.power + prev.power) / 2;
    const pct = avgW / ftp;
    let z = 0;
    for (let j = POWER_ZONES.length - 1; j >= 0; j--) {
      if (pct >= POWER_ZONES[j].pctMin) { z = j; break; }
    }
    secs[z] += dt;
  }
  const total = secs.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return POWER_ZONES.map((z, i) => ({
    label: z.label,
    pct: Math.round((secs[i] / total) * 100),
    seconds: secs[i],
  }));
}

/**
 * Génère un prompt texte complet pour analyse IA d'une séance : profil, données générales,
 * zones cardiaques/allure/puissance, métriques physiologiques (TRIMP, VO2max, dérive),
 * données montre FIT, montées, répétitions de côte, fractionnés et splits.
 */
export function generateSummary(opts: SummaryOptions): string {
  const { activity, splits, climbs, intervals, hillRepeats,
          fcMax, fcRest, vma, ftp, weight, birthYear,
          sessionType, trimp, vo2max, drift, fitSummary,
          normalizedPower, intensityFactor,
          tsbResult, history, activityDate, activityName, weather } = opts;

  const isCycling = activity.activityType === "cycling";
  const lines: string[] = [];
  const push = (s: string) => lines.push(s);
  const sep = () => lines.push("");

  const displayName = activityName || activity.name;
  push(`Voici les données de ma séance de ${isCycling ? "vélo" : "course à pied"}${displayName ? ` "${displayName}"` : ""}. Peux-tu analyser ma performance et me donner des recommandations personnalisées ?`);
  sep();

  // ── Profil ──────────────────────────────────────────────────────────────────
  const age = new Date().getFullYear() - birthYear;
  push("👤 MON PROFIL");
  push(`• Âge : ${age} ans (né en ${birthYear})`);
  push(`• FCmax : ${fcMax} bpm  |  FC repos : ${fcRest} bpm`);
  if (!isCycling) push(`• VMA : ${vma} km/h`);
  if (isCycling && ftp > 0) push(`• FTP : ${ftp} W${weight > 0 ? `  (${(ftp / weight).toFixed(2)} W/kg)` : ""}`);
  if (weight > 0) push(`• Poids : ${weight} kg`);
  sep();

  // ── Données générales ────────────────────────────────────────────────────────
  push("📊 DONNÉES GÉNÉRALES");
  if (activity.startTime) {
    const tod = describeTimeOfDay(activity.startTime);
    const hh = String(activity.startTime.getHours()).padStart(2, '0');
    const mm = String(activity.startTime.getMinutes()).padStart(2, '0');
    push(`• Moment de la journée : ${tod.label} (${hh}:${mm})`);
  }
  push(`• Distance : ${(activity.totalDistance / 1000).toFixed(2)} km`);
  push(`• Durée totale : ${formatDuration(activity.totalDuration)}  |  Temps en mouvement : ${formatDuration(activity.movingTime)}`);
  if (!isCycling && activity.avgPace > 0) {
    push(`• Allure moyenne : ${formatPace(activity.avgPace)} /km`);
  }
  push(`• Vitesse moyenne : ${(activity.avgSpeed * 3.6).toFixed(1)} km/h  |  Max : ${(activity.maxSpeed * 3.6).toFixed(1)} km/h`);
  push(`• Dénivelé : +${activity.elevationGain} m / -${activity.elevationLoss} m`);
  if (activity.avgHeartRate) push(`• FC moyenne : ${activity.avgHeartRate} bpm  |  FC max séance : ${activity.maxHeartRate ?? "–"} bpm`);
  if (activity.avgCadence !== null) {
    const cadDisplay = isCycling ? activity.avgCadence : (activity.avgCadence * 2);
    const cadUnit = isCycling ? "rpm" : "ppm";
    push(`• Cadence moyenne : ${cadDisplay} ${cadUnit}`);
  }
  if (isCycling && normalizedPower) {
    push(`• Puissance normalisée (NP) : ${normalizedPower} W`);
    if (intensityFactor) {
      push(`• Intensity Factor (IF) : ${intensityFactor.toFixed(2)}`);
      if (ftp > 0 && activity.movingTime > 0) {
        // TSS = (durée_s × NP × IF) / (FTP × 3600) × 100  (formule Coggan)
        const tss = Math.round((activity.movingTime * normalizedPower * intensityFactor) / (ftp * 3600) * 100);
        push(`• TSS : ${tss}`);
      }
    }
  }
  if (sessionType) push(`• Type de séance détecté : ${sessionType}`);
  sep();

  // ── Météo ───────────────────────────────────────────────────────────────────
  if (weather && weather.temperature != null) {
    const { label } = describeWeatherCode(weather.weatherCode);
    push("🌤️ MÉTÉO AU DÉPART");
    push(`• ${label}, ${Math.round(weather.temperature)}°C`);
    if (weather.windSpeed != null) push(`• Vent : ${Math.round(weather.windSpeed)} km/h ${windDirectionLabel(weather.windDirection)}`);
    if (weather.cloudCover != null) push(`• Nébulosité : ${Math.round(weather.cloudCover)}%`);
    if (weather.precipitation != null && weather.precipitation > 0) push(`• Précipitations : ${weather.precipitation.toFixed(1)} mm`);
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

  // ── Zones d'allure % VMA (running) ──────────────────────────────────────────
  if (!isCycling) {
    const pzStats = paceZoneStats(activity.points, vma);
    if (pzStats) {
      push(`🏃 ZONES D'ALLURE (% VMA — VMA ${vma} km/h)`);
      for (const z of pzStats) {
        if (z.pct === 0) continue;
        const range = z.speedMax === null
          ? `> ${formatPace(1000 / z.speedMin)} /km`
          : `${formatPace(1000 / z.speedMax)} – ${formatPace(1000 / z.speedMin)} /km`;
        push(`• ${z.label} (${range}) : ${z.pct}% — ${formatDuration(z.seconds)}`);
      }
      sep();
    }
  }

  // ── Zones de puissance Coggan (vélo) ────────────────────────────────────────
  if (isCycling && ftp > 0) {
    const pwStats = powerZoneStats(activity.points, ftp);
    if (pwStats) {
      push(`⚡ ZONES DE PUISSANCE (Coggan — FTP ${ftp} W)`);
      for (const z of pwStats) {
        if (z.pct === 0) continue;
        push(`• ${z.label} : ${z.pct}% — ${formatDuration(z.seconds)}`);
      }
      sep();
    }
  }

  // ── Charge d'entraînement ───────────────────────────────────────────────────
  if (trimp || vo2max || drift || tsbResult) {
    push("📈 CHARGE & MÉTRIQUES PHYSIOLOGIQUES");
    if (tsbResult) {
      const { ctl, atl, tsb } = tsbResult;
      const tsbState = tsb >= 10 ? "Frais (pic de forme)" : tsb >= 0 ? "En forme" : tsb >= -10 ? "Légèrement fatigué" : "Fatigué / surcharge";
      push(`• CTL (forme chronique) : ${ctl}  |  ATL (fatigue aiguë) : ${atl}  |  TSB (fraîcheur) : ${tsb > 0 ? "+" : ""}${tsb} → ${tsbState}`);
    }
    if (trimp) {
      push(`• TRIMP Edwards : ${trimp.edwards}  |  Banister : ${trimp.banister}`);
      // Règle empirique : ~6h de récupération par 10 points TRIMP Edwards
      const recovH = Math.round(trimp.edwards / 10) * 6;
      push(`• Récupération estimée : ~${recovH}h (règle empirique TRIMP/10 × 6h)`);
    }
    if (vo2max && vo2max.confidence !== 'low') {
      const confLabel = vo2max.confidence === 'high' ? 'élevée' : 'moyenne';
      push(`• VO2max estimé : ${vo2max.value} mL/kg/min (fiabilité ${confLabel})`);
      const { vdot, races, paces } = computeVDOT(vo2max.value);
      push(`• VDOT : ${Math.round(vdot)}`);
      const key5k = races.find(r => r.label === "5 km");
      const keyHM = races.find(r => r.label === "Semi");
      const keyMA = races.find(r => r.label === "Marathon");
      const fmtTime = (s: number) => { const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); const sc = Math.round(s%60); return h > 0 ? `${h}h${String(m).padStart(2,'0')}'${String(sc).padStart(2,'0')}` : `${m}'${String(sc).padStart(2,'0')}`; };
      if (key5k) push(`• Prédiction 5K : ${fmtTime(key5k.timeS)}`);
      if (keyHM)  push(`• Prédiction semi : ${fmtTime(keyHM.timeS)}`);
      if (keyMA)  push(`• Prédiction marathon : ${fmtTime(keyMA.timeS)}`);
      const easyPace = paces.find(p => p.label === "Allure E (endurance)");
      if (easyPace) push(`• Allure endurance cible : ${formatPace(easyPace.minPaceSecPerKm)}–${formatPace(easyPace.maxPaceSecPerKm)} /km`);
    }
    if (drift) {
      // Dérive < 5% = bonne endurance aérobie ; 5–9% = modérée ; > 9% = élevée
      const severity = drift.decoupling < 5 ? "faible" : drift.decoupling < 9 ? "modérée" : "élevée";
      push(`• Dérive cardiaque : ${drift.decoupling.toFixed(1)}% (${severity}) — EF1 ${drift.ef1.toFixed(2)} → EF2 ${drift.ef2.toFixed(2)}`);
    }
    sep();
  }

  // ── Bilan FIT montre ─────────────────────────────────────────────────────────
  if (fitSummary) {
    const teLabels = ["Aucun effet", "Maintien", "Amélioration", "Optimisation", "Surcompensation"];
    const feelLabels: Record<number, string> = { 1: "Très difficile", 2: "Difficile", 3: "Normal", 4: "Bon", 5: "Excellent" };
    push("⌚ DONNÉES MONTRE (FIT)");
    if (fitSummary.trainingEffect != null) {
      const teIdx = Math.min(4, Math.floor(fitSummary.trainingEffect));
      push(`• Training Effect : ${fitSummary.trainingEffect.toFixed(1)} — ${teLabels[teIdx]}`);
    }
    if (fitSummary.estimatedVO2max != null) push(`• VO2max estimé montre : ${fitSummary.estimatedVO2max.toFixed(1)} mL/kg/min`);
    if (fitSummary.recoveryTimeH != null) push(`• Récupération recommandée : ${fitSummary.recoveryTimeH}h`);
    if (fitSummary.peakEpoc != null) push(`• EPOC : ${fitSummary.peakEpoc.toFixed(1)} mL/kg`);
    if (fitSummary.feeling != null) push(`• Ressenti athlète : ${fitSummary.feeling}/5 — ${feelLabels[Math.round(fitSummary.feeling)] ?? ""}`);
    if (fitSummary.tss != null) push(`• TSS montre : ${fitSummary.tss.toFixed(1)}`);
    sep();
  }

  // ── Historique récent (7 jours) ─────────────────────────────────────────────
  if (history && history.length > 0) {
    const refDate = activityDate ?? new Date().toISOString().slice(0, 10);
    const cutoff = new Date(refDate);
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    // Exclure la séance courante (même date + distance + durée)
    const recent = history.filter(e => {
      if (e.date < cutoffStr || e.date > refDate) return false;
      if (e.date === activityDate &&
          activity.totalDistance && e.distance && Math.abs(e.distance - activity.totalDistance) < 50 &&
          activity.movingTime && e.duration && Math.abs(e.duration - activity.movingTime) < 10) return false;
      return true;
    });
    if (recent.length > 0) {
      const totalKm = recent.reduce((s, e) => s + (e.distance ?? 0) / 1000, 0);
      const totalTrimp = recent.reduce((s, e) => s + e.trimp, 0);
      push("📅 CHARGE RÉCENTE (7 derniers jours, hors séance actuelle)");
      push(`• ${recent.length} séance${recent.length > 1 ? "s" : ""}, ${totalKm.toFixed(1)} km, TRIMP cumulé ${Math.round(totalTrimp)}`);
      const runs = recent.filter(e => !e.activityType || e.activityType === "running");
      const bikes = recent.filter(e => e.activityType === "cycling");
      if (runs.length > 0 && bikes.length > 0) {
        push(`  • Course : ${runs.length} séance${runs.length > 1 ? "s" : ""}, ${runs.reduce((s, e) => s + (e.distance ?? 0) / 1000, 0).toFixed(1)} km`);
        push(`  • Vélo : ${bikes.length} séance${bikes.length > 1 ? "s" : ""}, ${bikes.reduce((s, e) => s + (e.distance ?? 0) / 1000, 0).toFixed(1)} km`);
      }
      sep();
    }
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

  // ── Fractionnés ──────────────────────────────────────────────────────────────
  if (intervals && intervals.efforts.length > 0) {
    const eff = intervals.efforts;
    push(`⚡ FRACTIONNÉS DÉTECTÉS (${eff.length} répétitions)`);
    // Détail de chaque effort
    for (let i = 0; i < eff.length; i++) {
      const iv = eff[i];
      const distLabel = iv.distance >= 1000 ? `${(iv.distance / 1000).toFixed(2)} km` : `${Math.round(iv.distance)} m`;
      let line = `  Rep. ${i + 1} : ${formatDuration(Math.round(iv.duration))}, ${distLabel}`;
      if (isCycling) {
        line += `, ${(iv.avgSpeed * 3.6).toFixed(1)} km/h`;
        if (iv.avgPower) line += `, ${Math.round(iv.avgPower)} W`;
      } else {
        line += `, ${formatPace(iv.avgPace)} /km`;
      }
      if (iv.avgHeartRate) line += `, FC ${iv.avgHeartRate} bpm`;
      if (iv.totalAscent) line += `, D+ ${Math.round(iv.totalAscent)} m`;
      if (iv.totalDescent) line += `, D- ${Math.round(iv.totalDescent)} m`;
      push(line);
    }
    // Résumé / fatigue
    if (isCycling) {
      const avgSpeed = eff.reduce((s, iv) => s + iv.avgSpeed, 0) / eff.length;
      push(`• Vitesse effort moy. : ${(avgSpeed * 3.6).toFixed(1)} km/h`);
      if (eff[0].avgPower) {
        const avgPow = eff.reduce((s, iv) => s + (iv.avgPower ?? 0), 0) / eff.length;
        push(`• Puissance effort moy. : ${Math.round(avgPow)} W`);
      }
    } else {
      const avgEffPace = eff.reduce((s, iv) => s + iv.avgPace, 0) / eff.length;
      push(`• Allure effort moy. : ${formatPace(avgEffPace)} /km`);
      if (intervals.recoveries.length > 0) {
        const avgRecPace = intervals.recoveries.reduce((s, iv) => s + iv.avgPace, 0) / intervals.recoveries.length;
        push(`• Allure récupération moy. : ${formatPace(avgRecPace)} /km`);
      }
      if (eff.length >= 6) {
        const avgF = eff.slice(0, 3).reduce((s, iv) => s + iv.avgPace, 0) / 3;
        const avgL = eff.slice(-3).reduce((s, iv) => s + iv.avgPace, 0) / 3;
        const fatigue = ((avgL - avgF) / avgF) * 100;
        push(`• Fatigue : ${fatigue > 0 ? "+" : ""}${fatigue.toFixed(1)}% entre 1ères et dernières répétitions`);
      }
    }
    sep();
  }

  // ── Splits ───────────────────────────────────────────────────────────────────
  if (splits.length >= 2) {
    const distLabel = splits[0].distance >= 900
      ? `${(splits[0].distance / 1000).toFixed(1)} KM`
      : `${splits[0].distance} M`;
    push(`📏 SPLITS PAR ${distLabel}`);
    for (const s of splits) {
      const at = s.cumulativeDistance >= 900
        ? `@${(s.cumulativeDistance / 1000).toFixed(1)} km`
        : `@${s.cumulativeDistance} m`;
      let line: string;
      if (isCycling) {
        const speedKmh = s.avgPace > 0 ? (3600 / s.avgPace).toFixed(1) : "–";
        line = `• ${at} — ${speedKmh} km/h`;
      } else {
        line = `• ${at} — allure ${formatPace(s.avgPace)} /km`;
        if (s.avgGAP !== null && Math.abs(s.avgGAP - s.avgPace) > 3) line += `, GAP ${formatPace(s.avgGAP)} /km`;
      }
      if (s.avgHeartRate) line += `, FC ${s.avgHeartRate} bpm`;
      if (s.elevationGain > 0) line += `, D+ ${Math.round(s.elevationGain)} m`;
      if (s.elevationLoss > 0) line += `, D- ${Math.round(s.elevationLoss)} m`;
      push(line);
    }
    sep();
  }

  // ── Demande d'analyse ────────────────────────────────────────────────────────
  push("---");
  push("Merci de m'analyser cette séance en détail :");
  push("1. Évaluation globale de la qualité de l'effort");
  push("2. Points forts et points d'attention");
  push("3. Analyse de la distribution cardiaque et de la gestion de l'effort");
  if (isCycling && normalizedPower) push("4. Analyse de la puissance (NP, IF, zones Coggan)");
  else if (!isCycling) push("4. Analyse des zones d'allure par rapport à la VMA");
  push("5. Recommandations pour la récupération");
  push("6. Suggestions concrètes pour la prochaine séance");

  return lines.join("\n");
}
