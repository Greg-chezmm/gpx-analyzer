import type {
  GPXActivity, GPXSplit, GPXInterval, ClimbSegment,
  TRIMPResult, VO2maxEstimate, CardiacDrift,
} from "./gpxParser";
import { CLIMB_CATEGORIES } from "./gpxParser";
import { formatDuration, formatPace } from "../components/SplitsTable";

interface SummaryOptions {
  activity: GPXActivity;
  splits: GPXSplit[];
  climbs: ClimbSegment[];
  intervals: { efforts: GPXInterval[]; recoveries: GPXInterval[] } | null;
  fcMax: number;
  fcRest: number;
  vma: number;
  weight: number;
  birthYear: number;
  sessionType: string | null;
  trimp: TRIMPResult | null;
  vo2max: VO2maxEstimate | null;
  drift: CardiacDrift | null;
}

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

export function generateSummary(opts: SummaryOptions): string {
  const { activity, splits, climbs, intervals, fcMax, fcRest, vma, weight, birthYear,
          sessionType, trimp, vo2max, drift } = opts;

  const isCycling = activity.activityType === "cycling";
  const lines: string[] = [];
  const push = (s: string) => lines.push(s);
  const sep = () => lines.push("");

  push(`Voici les données de ma séance de ${isCycling ? "vélo" : "course à pied"}${activity.name ? ` "${activity.name}"` : ""}. Peux-tu analyser ma performance et me donner des recommandations personnalisées ?`);
  sep();

  // ── Profil ──────────────────────────────────────────────────────────────────
  const age = new Date().getFullYear() - birthYear;
  push("👤 MON PROFIL");
  push(`• Âge : ${age} ans (né en ${birthYear})`);
  push(`• FCmax : ${fcMax} bpm  |  FC repos : ${fcRest} bpm`);
  if (!isCycling) push(`• VMA : ${vma} km/h`);
  if (weight > 0)  push(`• Poids : ${weight} kg`);
  sep();

  // ── Données générales ────────────────────────────────────────────────────────
  push("📊 DONNÉES GÉNÉRALES");
  push(`• Distance : ${(activity.totalDistance / 1000).toFixed(2)} km`);
  push(`• Durée : ${formatDuration(activity.totalDuration)}`);
  if (!isCycling && activity.avgPace > 0) {
    push(`• Allure moyenne : ${formatPace(activity.avgPace)} /km`);
  }
  if (activity.avgSpeed > 0) {
    push(`• Vitesse moyenne : ${(activity.avgSpeed * 3.6).toFixed(1)} km/h`);
  }
  push(`• Dénivelé : +${activity.elevationGain} m / -${activity.elevationLoss} m`);
  if (activity.avgHeartRate) push(`• FC moyenne : ${activity.avgHeartRate} bpm`);
  if (activity.maxHeartRate) push(`• FC max : ${activity.maxHeartRate} bpm`);
  if (sessionType)            push(`• Type de séance détecté : ${sessionType}`);
  sep();

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
  if (trimp || vo2max || drift) {
    push("📈 CHARGE & MÉTRIQUES PHYSIOLOGIQUES");
    if (trimp) {
      push(`• TRIMP Edwards : ${trimp.edwards}  |  Banister : ${trimp.banister}`);
      // Recovery estimate: ~1h per 10 Edwards points
      const recovH = Math.round(trimp.edwards / 10) * 6;
      push(`• Récupération estimée : ~${recovH}h (règle empirique TRIMP/10 × 6h)`);
    }
    if (vo2max) {
      const confLabel = vo2max.confidence === 'high' ? 'élevée' : vo2max.confidence === 'medium' ? 'moyenne' : 'faible';
      push(`• VO2max estimé : ${vo2max.value} ml/kg/min (fiabilité ${confLabel}, vitesse GAP ~${vo2max.gapSpeedKmh.toFixed(1)} km/h)`);
    }
    if (drift) {
      const severity = drift.decoupling < 5 ? "faible" : drift.decoupling < 9 ? "modérée" : "élevée";
      push(`• Dérive cardiaque : ${drift.decoupling.toFixed(1)}% (${severity}) — EF1 ${drift.ef1.toFixed(2)} → EF2 ${drift.ef2.toFixed(2)}`);
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
      if (c.avgPace > 0) line += `, allure ${formatPace(c.avgPace)} /km`;
      push(line);
    }
    sep();
  }

  // ── Fractionnés ──────────────────────────────────────────────────────────────
  if (intervals && intervals.efforts.length > 0) {
    const eff = intervals.efforts;
    const avgEffPace = eff.reduce((s, iv) => s + iv.avgPace, 0) / eff.length;
    push(`⚡ FRACTIONNÉS DÉTECTÉS (${eff.length} répétitions)`);
    push(`• Allure effort moy. : ${formatPace(avgEffPace)} /km`);
    if (intervals.recoveries.length > 0) {
      const avgRecPace = intervals.recoveries.reduce((s, iv) => s + iv.avgPace, 0) / intervals.recoveries.length;
      push(`• Allure récupération moy. : ${formatPace(avgRecPace)} /km`);
    }
    if (eff.length >= 6) {
      const avgF = eff.slice(0, 3).reduce((s, iv) => s + iv.avgPace, 0) / 3;
      const avgL = eff.slice(-3).reduce((s, iv) => s + iv.avgPace, 0) / 3;
      const fatigue = ((avgL - avgF) / avgF) * 100;
      push(`• Fatigue : ${fatigue > 0 ? "+" : ""}${fatigue.toFixed(1)}% d'allure entre 1ères et dernières répétitions`);
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
      let line = `• ${at} — allure ${formatPace(s.avgPace)} /km`;
      if (s.avgHeartRate) line += `, FC ${s.avgHeartRate} bpm`;
      if (s.avgGAP !== null && Math.abs(s.avgGAP - s.avgPace) > 3) line += `, GAP ${formatPace(s.avgGAP)} /km`;
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
  push("4. Recommandations pour la récupération");
  push("5. Suggestions concrètes pour la prochaine séance");

  return lines.join("\n");
}
