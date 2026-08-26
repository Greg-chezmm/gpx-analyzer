// ─── Jack Daniels VDOT ────────────────────────────────────────────────────────
// Ref: Daniels & Gilbert, "Oxygen Power: Performance Tables for Distance Runners"
// Formulas from the published regression equations.

import type { AggregatedRunBest } from './bestEfforts';

/**
 * VO2 demandé (mL/kg/min) à la vitesse v (m/min) — équation de régression Daniels & Gilbert.
 * Polynôme du 2e degré : VO2 = −4,60 + 0,182258×v + 0,000104×v².
 */
function vo2AtVelocity(v: number): number {
  return -4.60 + 0.182258 * v + 0.000104 * v * v;
}

/**
 * Fraction du VO2max utilisée à la durée de course t (minutes) — Daniels & Gilbert.
 * Modèle bi-exponentiel : l'utilisation de VO2max diminue pour les épreuves longues
 * car l'athlète ne peut soutenir 100% VO2max sur marathon.
 */
function pctVO2maxAtDuration(t: number): number {
  return 0.8
    + 0.1894393 * Math.exp(-0.012778 * t)
    + 0.2989558 * Math.exp(-0.1932605 * t);
}

/**
 * Vitesse (m/min) correspondant à un pourcentage pct du VDOT (inverse de vo2AtVelocity).
 * Résolue par la formule quadratique : v = (−b + √(b²+4a×target)) / (2a).
 */
function velocityAtPctVDOT(vdot: number, pct: number): number {
  const target = pct * vdot + 4.60;
  const disc = 0.182258 * 0.182258 + 4 * 0.000104 * target;
  return (-0.182258 + Math.sqrt(Math.max(0, disc))) / (2 * 0.000104);
}

/**
 * Prédit le temps de course (secondes) pour une distance donnée (mètres) à un VDOT donné.
 * Résolution numérique par dichotomie (80 itérations) :
 * cherche t tel que VO2(d/t) = VDOT × %VO2max(t).
 */
function predictRaceTime(distanceM: number, vdot: number): number {
  let lo = distanceM / 2000; // lower bound (very fast)
  let hi = distanceM / 50;   // upper bound (very slow)
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    // f(t) = vo2(d/t) - vdot×pct(t) est décroissante :
    // f > 0 → allure trop rapide → temps correct plus grand → lo = mid
    // f < 0 → allure trop lente → temps correct plus petit → hi = mid
    if (vo2AtVelocity(distanceM / mid) > vdot * pctVO2maxAtDuration(mid)) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 60; // seconds
}

/**
 * Inverse de `predictRaceTime` : retrouve le VDOT impliqué par une performance réelle
 * (distance + temps), par dichotomie (`predictRaceTime` est strictement décroissante en VDOT).
 * Sert de base à une prédiction "depuis un vrai résultat de course" plutôt que depuis l'estimation
 * sous-maximale FC/allure — voir `computeVDOTFromBests`.
 */
export function vdotFromPerformance(distanceM: number, timeS: number): number {
  let lo = 20, hi = 85;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (predictRaceTime(distanceM, mid) > timeS) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ─── Public types ──────────────────────────────────────────────────────────────

/** Temps prédit sur une distance de course standard, calculé à partir du VDOT. */
export interface VDOTRace {
  label: string;
  distance: number; // meters
  timeS: number;    // seconds
  /** Vrai si `timeS` est un temps réellement couru (pas une prédiction du modèle). */
  isActual?: boolean;
  /** Référence réelle utilisée pour la prédiction (absent si `isActual` ou si aucun résultat réel disponible). */
  sourceLabel?: string;
}

/** Zone d'allure d'entraînement Daniels (E, M, T, I, R) avec plage min/max en s/km. */
export interface VDOTPace {
  label: string;
  description: string;
  minPaceSecPerKm: number;
  maxPaceSecPerKm: number;
  /** Référence réelle utilisée pour la prédiction (absent si aucun résultat réel disponible). */
  sourceLabel?: string;
}

/** Résultat complet du calcul VDOT : valeur, temps de course prédits et zones d'allure. */
export interface VDOTResult {
  vdot: number;
  races: VDOTRace[];
  paces: VDOTPace[];
}

// ─── Main entry point ──────────────────────────────────────────────────────────

const RACE_DISTANCES: { label: string; distance: number }[] = [
  { label: "1 500 m",  distance: 1500  },
  { label: "1 mile",   distance: 1609  },
  { label: "5 km",     distance: 5000  },
  { label: "10 km",    distance: 10000 },
  { label: "Semi",     distance: 21097 },
  { label: "Marathon", distance: 42195 },
];

/**
 * Calcule le VDOT de Jack Daniels à partir du VO2max estimé et dérive :
 * - les temps de course prédits sur 6 distances standard (1500m → marathon),
 * - les zones d'allure d'entraînement E/M/T/I/R (pourcentages du VDOT selon Daniels).
 *
 * Zones d'allure : E=59–74% VDOT, T=88%, I=100% (vVO2max), R~105%, M=allure marathon prédite.
 */
export function computeVDOT(vo2max: number): VDOTResult {
  const vdot = vo2max;

  const races: VDOTRace[] = RACE_DISTANCES.map(r => ({
    ...r,
    timeS: predictRaceTime(r.distance, vdot),
  }));

  // Velocity (m/min) → pace (s/km)
  const toSecPerKm = (v: number) => v > 0 ? 60000 / v : 0;

  // Zones d'allure selon % du VDOT (définitions Jack Daniels)
  const easyFastV  = velocityAtPctVDOT(vdot, 0.74); // 74% VO2max — borne haute allure E
  const easySlowV  = velocityAtPctVDOT(vdot, 0.59); // 59% VO2max — borne basse allure E
  const thresholdV = velocityAtPctVDOT(vdot, 0.88); // 88% VO2max — allure T (seuil)
  const intervalV  = velocityAtPctVDOT(vdot, 1.00); // 100% VO2max — allure I (vVO2max)
  const repV       = velocityAtPctVDOT(vdot, 1.05); // ~105% VO2max — allure R (répétitions)

  // Allure marathon depuis le temps prédit (plus précis que le % pour les longues distances)
  const marathonPaceSecPerKm = races[5].timeS / 42.195;

  const paces: VDOTPace[] = [
    {
      label: "E",
      description: "Endurance / Récup",
      minPaceSecPerKm: toSecPerKm(easyFastV),
      maxPaceSecPerKm: toSecPerKm(easySlowV),
    },
    {
      label: "M",
      description: "Allure Marathon",
      minPaceSecPerKm: marathonPaceSecPerKm,
      maxPaceSecPerKm: marathonPaceSecPerKm,
    },
    {
      label: "T",
      description: "Seuil / Tempo",
      minPaceSecPerKm: toSecPerKm(thresholdV),
      maxPaceSecPerKm: toSecPerKm(thresholdV),
    },
    {
      label: "I",
      description: "Intervalles VO2max",
      minPaceSecPerKm: toSecPerKm(intervalV),
      maxPaceSecPerKm: toSecPerKm(intervalV),
    },
    {
      label: "R",
      description: "Répétitions",
      minPaceSecPerKm: toSecPerKm(repV),
      maxPaceSecPerKm: toSecPerKm(repV),
    },
  ];

  return { vdot, races, paces };
}

// ─── Prédiction depuis de vrais résultats de course ────────────────────────────
//
// L'estimation sous-maximale FC/allure (estimateVO2max) est peu fiable (voir feedback_vo2max_estimation) ;
// un vrai résultat de course est une bien meilleure base. Mais un VDOT unique ne se transpose pas
// forcément d'une distance à l'autre pour tout le monde : un coureur peut être "rapide sur courte
// distance" et "endurant sur longue distance" dans des proportions différentes de ce que suppose le
// modèle de Daniels (ex. un 10K rapide qui surestimerait le marathon prédit). Pour éviter ce biais,
// chaque prédiction utilise le résultat réel le plus proche en distance (échelle logarithmique),
// pas un seul VDOT appliqué partout.

/** Distance de référence utilisée pour choisir le résultat réel le plus pertinent par allure Daniels. */
const PACE_ANCHOR_METERS: Record<string, number> = { E: 42195, M: 42195, T: 15000, I: 5000, R: 1500 };

/** Résultat réel dont la distance est la plus proche de `targetMeters` (ratio logarithmique, symétrique). */
function nearestBest(targetMeters: number, bests: AggregatedRunBest[]): AggregatedRunBest | null {
  let best: AggregatedRunBest | null = null, bestDist = Infinity;
  for (const b of bests) {
    const d = Math.abs(Math.log(b.meters / targetMeters));
    if (d < bestDist) { bestDist = d; best = b; }
  }
  return best;
}

/** Formate un résultat réel en libellé court pour l'affichage ("10 km 39'52"" ). */
function formatSourceLabel(b: AggregatedRunBest): string {
  const totalS = Math.round(b.timeSeconds);
  const h = Math.floor(totalS / 3600), m = Math.floor((totalS % 3600) / 60), s = totalS % 60;
  const timeStr = h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}'${String(s).padStart(2, '0')}"`;
  return `${b.label} ${timeStr}`;
}

/**
 * Calcule temps prédits + allures d'entraînement à partir des meilleurs résultats réels de
 * l'athlète (voir `aggregateBestRunEfforts`), en choisissant pour chaque distance/allure le
 * résultat réel le plus proche plutôt qu'un VDOT unique. `fallbackVo2max` (estimation sous-maximale)
 * n'est utilisé que pour les distances/allures sans résultat réel disponible.
 */
export function computeVDOTFromBests(bests: AggregatedRunBest[], fallbackVo2max: number | null): VDOTResult {
  const fallback = fallbackVo2max != null ? computeVDOT(fallbackVo2max) : null;
  const toSecPerKm = (v: number) => v > 0 ? 60000 / v : 0;

  const races: VDOTRace[] = RACE_DISTANCES.map((r, i) => {
    const exact = bests.find(b => b.meters === r.distance);
    if (exact) return { ...r, timeS: exact.timeSeconds, isActual: true };
    const near = nearestBest(r.distance, bests);
    if (near) {
      const vdot = vdotFromPerformance(near.meters, near.timeSeconds);
      return { ...r, timeS: predictRaceTime(r.distance, vdot), sourceLabel: formatSourceLabel(near) };
    }
    return fallback ? fallback.races[i] : { ...r, timeS: 0 };
  });

  const PACE_DEFS: { label: string; description: string; compute: (vdot: number) => { min: number; max: number } }[] = [
    { label: "E", description: "Endurance / Récup",
      compute: vdot => ({ min: toSecPerKm(velocityAtPctVDOT(vdot, 0.74)), max: toSecPerKm(velocityAtPctVDOT(vdot, 0.59)) }) },
    { label: "M", description: "Allure Marathon",
      compute: vdot => { const p = predictRaceTime(42195, vdot) / 42.195; return { min: p, max: p }; } },
    { label: "T", description: "Seuil / Tempo",
      compute: vdot => { const v = toSecPerKm(velocityAtPctVDOT(vdot, 0.88)); return { min: v, max: v }; } },
    { label: "I", description: "Intervalles VO2max",
      compute: vdot => { const v = toSecPerKm(velocityAtPctVDOT(vdot, 1.00)); return { min: v, max: v }; } },
    { label: "R", description: "Répétitions",
      compute: vdot => { const v = toSecPerKm(velocityAtPctVDOT(vdot, 1.05)); return { min: v, max: v }; } },
  ];

  const paces: VDOTPace[] = PACE_DEFS.map(({ label, description, compute }) => {
    const near = nearestBest(PACE_ANCHOR_METERS[label], bests);
    if (near) {
      const vdot = vdotFromPerformance(near.meters, near.timeSeconds);
      const { min, max } = compute(vdot);
      return { label, description, minPaceSecPerKm: min, maxPaceSecPerKm: max, sourceLabel: formatSourceLabel(near) };
    }
    const fb = fallback?.paces.find(p => p.label === label);
    return fb ? { ...fb } : { label, description, minPaceSecPerKm: 0, maxPaceSecPerKm: 0 };
  });

  const vdot = fallback?.vdot ?? (bests.length > 0 ? vdotFromPerformance(bests[0].meters, bests[0].timeSeconds) : 0);

  return { vdot, races, paces };
}
