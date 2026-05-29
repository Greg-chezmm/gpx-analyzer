// ─── Jack Daniels VDOT ────────────────────────────────────────────────────────
// Ref: Daniels & Gilbert, "Oxygen Power: Performance Tables for Distance Runners"
// Formulas from the published regression equations.

// VO2 (mL/kg/min) demanded at velocity v (m/min)
function vo2AtVelocity(v: number): number {
  return -4.60 + 0.182258 * v + 0.000104 * v * v;
}

// Fraction of VO2max utilised at race duration t (minutes) — Daniels & Gilbert
function pctVO2maxAtDuration(t: number): number {
  return 0.8
    + 0.1894393 * Math.exp(-0.012778 * t)
    + 0.2989558 * Math.exp(-0.1932605 * t);
}

// Velocity (m/min) at a given fraction of VDOT (inverse of vo2AtVelocity)
function velocityAtPctVDOT(vdot: number, pct: number): number {
  const target = pct * vdot + 4.60;
  const disc = 0.182258 * 0.182258 + 4 * 0.000104 * target;
  return (-0.182258 + Math.sqrt(Math.max(0, disc))) / (2 * 0.000104);
}

// Predicted race time (seconds) for distance (meters) at a given VDOT.
// Solved numerically: find t where VO2(d/t) = VDOT × %VO2max(t).
function predictRaceTime(distanceM: number, vdot: number): number {
  let lo = distanceM / 2000; // lower bound (very fast)
  let hi = distanceM / 50;   // upper bound (very slow)
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    // f(t) = vo2(d/t) - vdot×pct(t) is decreasing: positive at small t, negative at large t.
    // f > 0 → pace too fast → correct time is larger → lo = mid
    // f < 0 → pace too slow → correct time is smaller → hi = mid
    if (vo2AtVelocity(distanceM / mid) > vdot * pctVO2maxAtDuration(mid)) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 60; // seconds
}

// ─── Public types ──────────────────────────────────────────────────────────────

export interface VDOTRace {
  label: string;
  distance: number; // meters
  timeS: number;    // seconds
}

export interface VDOTPace {
  label: string;
  description: string;
  minPaceSecPerKm: number;
  maxPaceSecPerKm: number;
}

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

export function computeVDOT(vo2max: number): VDOTResult {
  const vdot = vo2max;

  const races: VDOTRace[] = RACE_DISTANCES.map(r => ({
    ...r,
    timeS: predictRaceTime(r.distance, vdot),
  }));

  // Velocity (m/min) → pace (s/km)
  const toSecPerKm = (v: number) => v > 0 ? 60000 / v : 0;

  // Training zones from % of VDOT (Jack Daniels zone definitions)
  const easyFastV  = velocityAtPctVDOT(vdot, 0.74); // 74% VO2max — upper E
  const easySlowV  = velocityAtPctVDOT(vdot, 0.59); // 59% VO2max — lower E
  const thresholdV = velocityAtPctVDOT(vdot, 0.88); // 88% VO2max — T pace
  const intervalV  = velocityAtPctVDOT(vdot, 1.00); // 100% VO2max — I pace (vVO2max)
  const repV       = velocityAtPctVDOT(vdot, 1.05); // ~105% VO2max — R pace

  // Marathon pace from predicted time (more accurate than % formula for long efforts)
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
