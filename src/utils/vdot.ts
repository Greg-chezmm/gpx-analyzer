// ─── Jack Daniels VDOT ────────────────────────────────────────────────────────
// Ref: Daniels & Gilbert, "Oxygen Power: Performance Tables for Distance Runners"
// Formulas from the published regression equations.

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

// ─── Public types ──────────────────────────────────────────────────────────────

/** Temps prédit sur une distance de course standard, calculé à partir du VDOT. */
export interface VDOTRace {
  label: string;
  distance: number; // meters
  timeS: number;    // seconds
}

/** Zone d'allure d'entraînement Daniels (E, M, T, I, R) avec plage min/max en s/km. */
export interface VDOTPace {
  label: string;
  description: string;
  minPaceSecPerKm: number;
  maxPaceSecPerKm: number;
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
