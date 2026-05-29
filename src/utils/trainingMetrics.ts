import type { GPXActivity, GPXTrackPoint } from './gpxCore';
import { karvonenBounds } from './session';
import { gapFactor } from './splits';

// ─── Cardiac Drift ───────────────────────────────────────────────────────────

export interface CardiacDrift {
  ef1: number;        // Efficiency Factor first half (speed×1000/HR)
  ef2: number;        // Efficiency Factor second half
  decoupling: number; // % — absolute drift
  avgHR1: number;
  avgHR2: number;
  avgPace1: number;   // s/km
  avgPace2: number;
  efOverall: number;
}

export function calcCardiacDrift(activity: GPXActivity): CardiacDrift | null {
  const pts = activity.points.filter(
    (p: GPXTrackPoint) => p.hr !== null && p.speed !== null && p.speed > 0.5 && p.time !== null
  );
  if (pts.length < 40) return null;

  const tStart = pts[0].time!.getTime();
  const tEnd   = pts[pts.length - 1].time!.getTime();
  const tMid   = (tStart + tEnd) / 2;
  const half1  = pts.filter((p: GPXTrackPoint) => p.time!.getTime() <= tMid);
  const half2  = pts.filter((p: GPXTrackPoint) => p.time!.getTime() >  tMid);
  if (half1.length < 15 || half2.length < 15) return null;

  const stats = (pts: GPXTrackPoint[]) => {
    const avgSpd = pts.reduce((s, p) => s + (p.speed ?? 0), 0) / pts.length;
    const avgHR  = pts.reduce((s, p) => s + (p.hr  ?? 0), 0) / pts.length;
    return { ef: avgHR > 0 ? avgSpd * 1000 / avgHR : 0, avgSpd, avgHR };
  };

  const r1 = stats(half1);
  const r2 = stats(half2);
  const rAll = stats(pts);

  const decoupling = r1.ef > 0 ? ((r1.ef - r2.ef) / r1.ef) * 100 : 0;

  return {
    ef1: Math.round(r1.ef * 100) / 100,
    ef2: Math.round(r2.ef * 100) / 100,
    decoupling: Math.round(decoupling * 10) / 10,
    avgHR1: Math.round(r1.avgHR),
    avgHR2: Math.round(r2.avgHR),
    avgPace1: r1.avgSpd > 0 ? Math.round(1000 / r1.avgSpd) : 0,
    avgPace2: r2.avgSpd > 0 ? Math.round(1000 / r2.avgSpd) : 0,
    efOverall: Math.round(rAll.ef * 100) / 100,
  };
}

// ─── TRIMP — Training Impulse ─────────────────────────────────────────────────

export interface TRIMPResult {
  edwards: number;       // zone-weighted load
  banister: number;      // Banister formula
  zoneMinutes: number[]; // [Z1..Z5] minutes
  totalMinutes: number;
}

export function calcTRIMP(
  points: GPXTrackPoint[],
  fcMax: number,
  fcRest: number,
): TRIMPResult | null {
  const bounds = karvonenBounds(fcMax, fcRest);
  const zoneTime = [0, 0, 0, 0, 0]; // seconds
  let hrSum = 0, totalTime = 0;

  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    if (curr.hr === null || prev.hr === null || !curr.time || !prev.time) continue;
    const dt = (curr.time.getTime() - prev.time.getTime()) / 1000;
    if (dt <= 0 || dt > 60) continue;
    const avgHr = (curr.hr + prev.hr) / 2;
    const z = avgHr >= bounds[4] ? 4 : avgHr >= bounds[3] ? 3 : avgHr >= bounds[2] ? 2 : avgHr >= bounds[1] ? 1 : 0;
    zoneTime[z] += dt;
    hrSum += avgHr * dt;
    totalTime += dt;
  }

  if (totalTime < 60) return null;

  const WEIGHTS = [1, 2, 3, 4, 5];
  const edwards = zoneTime.reduce((s, t, i) => s + (t / 60) * WEIGHTS[i], 0);

  const avgHR = hrSum / totalTime;
  const hrr = Math.max(0, Math.min(1, (avgHR - fcRest) / (fcMax - fcRest)));
  const banister = Math.round((totalTime / 60) * hrr * Math.exp(1.92 * hrr));

  return {
    edwards: Math.round(edwards),
    banister,
    zoneMinutes: zoneTime.map(t => Math.round(t / 60)),
    totalMinutes: Math.round(totalTime / 60),
  };
}

// ─── Normalized Power ─────────────────────────────────────────────────────────

export function calcNormalizedPower(points: GPXTrackPoint[]): number | null {
  const pwrPts = points.filter(p => p.power !== null && p.time !== null);
  if (pwrPts.length < 60) return null;

  const WINDOW_MS = 30_000;
  const avg30s: number[] = [];

  for (let i = 0; i < pwrPts.length; i++) {
    const t = pwrPts[i].time!.getTime();
    let sum = 0, count = 0;
    for (let j = i; j >= 0; j--) {
      if (t - pwrPts[j].time!.getTime() > WINDOW_MS) break;
      sum += pwrPts[j].power!;
      count++;
    }
    if (count > 0) avg30s.push(sum / count);
  }

  if (avg30s.length === 0) return null;
  const sum4 = avg30s.reduce((s, v) => s + v ** 4, 0);
  return Math.round((sum4 / avg30s.length) ** 0.25);
}

// ─── VO2max estimation ────────────────────────────────────────────────────────

export interface VO2maxEstimate {
  value: number;          // mL/kg/min
  confidence: 'high' | 'medium' | 'low';
  hrrPct: number;         // avg HRR% used
  gapSpeedKmh: number;    // equivalent flat speed used
}

export function estimateVO2max(
  activity: GPXActivity,
  fcMax: number,
  fcRest: number,
): VO2maxEstimate | null {
  if (activity.activityType === 'cycling') return null;
  const pts = activity.points.filter(
    (p: GPXTrackPoint) => p.hr !== null && p.speed !== null && p.speed > 1.5 && p.time !== null
  );
  if (pts.length < 60) return null;

  // Use middle 60% to skip warmup/cooldown
  const tStart = pts[0].time!.getTime();
  const tEnd   = pts[pts.length - 1].time!.getTime();
  const tRange = tEnd - tStart;
  const steady = pts.filter((p: GPXTrackPoint) => {
    const pct = (p.time!.getTime() - tStart) / tRange;
    return pct >= 0.2 && pct <= 0.8;
  });
  if (steady.length < 30) return null;

  // Average GAP speed (m/s)
  const avgGapSpd = steady.reduce((s: number, p: GPXTrackPoint) => {
    const gf = p.grade !== null ? gapFactor(p.grade) : 1;
    return s + p.speed! * gf;
  }, 0) / steady.length;

  const vMMin = avgGapSpd * 60; // m/min

  // ACSM running VO2 formula (flat equivalent)
  const vo2 = 0.2 * vMMin + 3.5;

  // Average HRR%
  const avgHR = steady.reduce((s: number, p: GPXTrackPoint) => s + p.hr!, 0) / steady.length;
  const hrrPct = (avgHR - fcRest) / (fcMax - fcRest);
  if (hrrPct < 0.35 || hrrPct > 0.97) return null;

  const vo2max = vo2 / hrrPct;

  // Confidence: based on duration and HR steadiness
  const hrCV = Math.sqrt(
    steady.reduce((s: number, p: GPXTrackPoint) => s + (p.hr! - avgHR) ** 2, 0) / steady.length
  ) / avgHR;
  const durationMin = tRange / 60_000;

  const confidence: 'high' | 'medium' | 'low' =
    durationMin >= 30 && hrCV < 0.06 && hrrPct >= 0.5 && hrrPct <= 0.87 ? 'high' :
    durationMin >= 15 && hrCV < 0.12 ? 'medium' : 'low';

  return {
    value: Math.round(vo2max * 10) / 10,
    confidence,
    hrrPct: Math.round(hrrPct * 100),
    gapSpeedKmh: Math.round(avgGapSpd * 3.6 * 10) / 10,
  };
}
