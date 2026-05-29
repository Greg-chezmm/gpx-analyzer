import type { GPXTrackPoint } from './gpxCore';

// ─── Session classification ───────────────────────────────────────────────────

export type SessionType =
  | 'Récupération'
  | 'Endurance aérobie'
  | 'Aérobie / Tempo'
  | 'Seuil'
  | 'VO2max'
  | 'Fractionné';

export interface SessionClassification {
  type: SessionType;
  color: string;
  emoji: string;
  description: string;
  basis: 'hr' | 'speed';
  zonePcts: number[]; // [Z1..Z5] percentage of time
}

// Karvonen zone boundaries — returns bpm thresholds [z1min, z2min, z3min, z4min, z5min, z5max]
export function karvonenBounds(fcMax: number, fcRest: number): number[] {
  const r = fcMax - fcRest;
  return [0.50, 0.60, 0.70, 0.80, 0.90].map(p => Math.round(fcRest + p * r));
}

function getZoneKarvonen(hr: number, bounds: number[]): number {
  // bounds = [z1min, z2min, z3min, z4min, z5min]
  if (hr >= bounds[4]) return 4; // Z5
  if (hr >= bounds[3]) return 3; // Z4
  if (hr >= bounds[2]) return 2; // Z3
  if (hr >= bounds[1]) return 1; // Z2
  return 0;                       // Z1
}

export function classifySession(
  points: GPXTrackPoint[],
  fcMax: number,
  fcRest: number,
  vma: number, // km/h
): SessionClassification {
  const bounds = karvonenBounds(fcMax, fcRest);

  // Try HR-based classification first
  const zoneTime = [0, 0, 0, 0, 0];
  let totalHrTime = 0;

  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    if (curr.hr === null || prev.hr === null) continue;
    if (curr.time === null || prev.time === null) continue;
    const dt = (curr.time.getTime() - prev.time.getTime()) / 1000;
    if (dt <= 0 || dt > 60) continue;
    const avgHr = (curr.hr + prev.hr) / 2;
    zoneTime[getZoneKarvonen(avgHr, bounds)] += dt;
    totalHrTime += dt;
  }

  if (totalHrTime > 60) {
    const pcts = zoneTime.map(t => totalHrTime > 0 ? (t / totalHrTime) * 100 : 0);
    let type: SessionType;
    let color: string;
    let emoji: string;
    let description: string;

    if (pcts[4] >= 10 || pcts[3] + pcts[4] >= 25) {
      // Significant Z5 or lots of Z4+Z5 → could be fractionné if intervals detected
      if (pcts[4] >= 15) {
        type = 'VO2max'; color = '#ef4444'; emoji = '🔴';
        description = `${pcts[4].toFixed(0)}% en Z5 — effort maximal`;
      } else {
        type = 'Seuil'; color = '#f97316'; emoji = '🟠';
        description = `${(pcts[3] + pcts[4]).toFixed(0)}% en Z4-Z5 — travail au seuil`;
      }
    } else if (pcts[2] >= 30) {
      type = 'Aérobie / Tempo'; color = '#fbbf24'; emoji = '🟡';
      description = `${pcts[2].toFixed(0)}% en Z3 — allure soutenue`;
    } else if (pcts[1] >= 40) {
      type = 'Endurance aérobie'; color = '#34d399'; emoji = '🟢';
      description = `${pcts[1].toFixed(0)}% en Z2 — endurance fondamentale`;
    } else {
      type = 'Récupération'; color = '#60a5fa'; emoji = '🔵';
      description = `${pcts[0].toFixed(0)}% en Z1 — récupération active`;
    }

    return { type, color, emoji, description, basis: 'hr', zonePcts: pcts };
  }

  // Fallback: speed-based classification
  const vmaMs = vma / 3.6;
  const speedTime = [0, 0, 0, 0, 0]; // <50%, 50-65%, 65-80%, 80-90%, >90% VMA
  let totalSpeedTime = 0;

  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    if (!curr.speed || !curr.time || !prev.time) continue;
    const dt = (curr.time.getTime() - prev.time.getTime()) / 1000;
    if (dt <= 0 || dt > 60) continue;
    const pctVma = curr.speed / vmaMs;
    if      (pctVma >= 0.90) speedTime[4] += dt;
    else if (pctVma >= 0.80) speedTime[3] += dt;
    else if (pctVma >= 0.65) speedTime[2] += dt;
    else if (pctVma >= 0.50) speedTime[1] += dt;
    else                     speedTime[0] += dt;
    totalSpeedTime += dt;
  }

  const sPcts = speedTime.map(t => totalSpeedTime > 0 ? (t / totalSpeedTime) * 100 : 0);
  let type: SessionType;
  let color: string;
  let emoji: string;
  let description: string;

  if (sPcts[4] >= 10) {
    type = 'VO2max'; color = '#ef4444'; emoji = '🔴';
    description = `${sPcts[4].toFixed(0)}% au-dessus de 90% VMA`;
  } else if (sPcts[3] >= 20) {
    type = 'Seuil'; color = '#f97316'; emoji = '🟠';
    description = `${sPcts[3].toFixed(0)}% entre 80–90% VMA`;
  } else if (sPcts[2] >= 35) {
    type = 'Aérobie / Tempo'; color = '#fbbf24'; emoji = '🟡';
    description = `${sPcts[2].toFixed(0)}% entre 65–80% VMA`;
  } else if (sPcts[1] >= 40) {
    type = 'Endurance aérobie'; color = '#34d399'; emoji = '🟢';
    description = `Vitesse prédominante entre 50–65% VMA`;
  } else {
    type = 'Récupération'; color = '#60a5fa'; emoji = '🔵';
    description = `Allure basse — récupération active`;
  }

  return { type, color, emoji, description, basis: 'speed', zonePcts: sPcts };
}
