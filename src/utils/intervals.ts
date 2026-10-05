import type { GPXActivity } from './gpxCore';
import { calcAvgGAP } from './splits';

/** Un intervalle d'effort ou de récupération détecté dans une activité (fractionné). */
export interface GPXInterval {
  number: number;
  type: 'effort' | 'recovery';
  startTime: Date | null;
  endTime: Date | null;
  duration: number;       // seconds
  distance: number;       // meters
  avgSpeed: number;       // m/s
  maxSpeed: number;       // m/s
  avgPace: number;        // s/km
  avgGAP: number | null;  // s/km — allure ajustée à la pente (Minetti), voir splits.ts calcAvgGAP
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgCadence: number | null;
  avgPower?: number | null;
  totalAscent?: number | null;
  totalDescent?: number | null;
  startPointIndex: number;
  endPointIndex: number;
}

/**
 * Fusionne plusieurs intervalles consécutifs (ex. deux laps mal découpés par la montre) en un seul.
 * Les moyennes (FC, cadence, puissance, GAP) sont pondérées par la durée de chaque segment ;
 * le type retenu est celui du segment le plus long en durée.
 */
export function mergeIntervals(chunk: GPXInterval[]): GPXInterval {
  if (chunk.length === 1) return chunk[0];

  const first = chunk[0];
  const last = chunk[chunk.length - 1];
  const duration = chunk.reduce((a, c) => a + c.duration, 0);
  const distance = chunk.reduce((a, c) => a + c.distance, 0);
  const avgSpeed = duration > 0 ? distance / duration : 0;
  const maxSpeed = Math.max(...chunk.map(c => c.maxSpeed));

  const weightedAvg = (sel: (c: GPXInterval) => number | null | undefined): number | null => {
    let sum = 0, weight = 0;
    for (const c of chunk) {
      const v = sel(c);
      if (v != null) { sum += v * c.duration; weight += c.duration; }
    }
    return weight > 0 ? sum / weight : null;
  };

  const maxOf = (sel: (c: GPXInterval) => number | null | undefined): number | null => {
    const values = chunk.map(sel).filter((v): v is number => v != null);
    return values.length > 0 ? Math.max(...values) : null;
  };

  const effortDuration = chunk.filter(c => c.type === 'effort').reduce((a, c) => a + c.duration, 0);
  const type: 'effort' | 'recovery' = effortDuration >= duration - effortDuration ? 'effort' : 'recovery';
  const totalAscent = chunk.reduce((a, c) => a + (c.totalAscent ?? 0), 0);
  const totalDescent = chunk.reduce((a, c) => a + (c.totalDescent ?? 0), 0);

  return {
    number: first.number,
    type,
    startTime: first.startTime,
    endTime: last.endTime,
    duration,
    distance,
    avgSpeed,
    maxSpeed,
    avgPace: avgSpeed > 0 ? 1000 / avgSpeed : 0,
    avgGAP: weightedAvg(c => c.avgGAP),
    avgHeartRate: weightedAvg(c => c.avgHeartRate),
    maxHeartRate: maxOf(c => c.maxHeartRate),
    avgCadence: weightedAvg(c => c.avgCadence),
    avgPower: weightedAvg(c => c.avgPower),
    totalAscent: totalAscent || null,
    totalDescent: totalDescent || null,
    startPointIndex: first.startPointIndex,
    endPointIndex: last.endPointIndex,
  };
}

/**
 * Détecte automatiquement les intervalles (efforts/récupérations) dans une activité par machine à états hystérétique sur la vitesse.
 * Seuil effort : médiane × 1,15 ; seuil retour : médiane × 0,90.
 * Retourne null si moins de 2 efforts significatifs ou si le ratio effort/récup est insuffisant (<1,10).
 */
export function detectIntervals(activity: GPXActivity): GPXInterval[] | null {
  const { points } = activity;
  if (points.length < 60) return null;

  const movingSpeeds = points.map(p => p.speed ?? 0).filter(s => s > 0.5).sort((a, b) => a - b);
  if (movingSpeeds.length < 20) return null;
  const median = movingSpeeds[Math.floor(movingSpeeds.length / 2)];
  if (median <= 0) return null;

  // Seuils d'hystérésis : on passe en "effort" au-dessus de +15% médiane,
  // on repasse en "récupération" en-dessous de -10% médiane → évite les oscillations rapides
  const hiThresh = median * 1.15;
  const loThresh = median * 0.90;

  // Hysteresis state machine
  let state: 'effort' | 'recovery' = 'recovery';
  const states: ('effort' | 'recovery')[] = new Array(points.length).fill('recovery');
  for (let i = 0; i < points.length; i++) {
    const s = points[i].speed ?? 0;
    if (state === 'recovery' && s > hiThresh) state = 'effort';
    else if (state === 'effort' && s < loThresh) state = 'recovery';
    states[i] = state;
  }

  // Collapse into segments
  const segments: { type: 'effort' | 'recovery'; start: number; end: number }[] = [];
  let segStart = 0;
  for (let i = 1; i <= states.length; i++) {
    if (i === states.length || states[i] !== states[segStart]) {
      segments.push({ type: states[segStart], start: segStart, end: i - 1 });
      segStart = i;
    }
  }

  const segDuration = (s: { start: number; end: number }): number => {
    const a = points[s.start].time, b = points[s.end].time;
    return a && b ? (b.getTime() - a.getTime()) / 1000 : 0;
  };

  // Filtrer les segments trop courts (effort < 20 s, récupération < 10 s)
  const filtered = segments.filter(s =>
    s.type === 'effort' ? segDuration(s) >= 20 : segDuration(s) >= 10
  );

  const effortSegs = filtered.filter(s => s.type === 'effort');
  if (effortSegs.length < 2) return null;

  // Validate: efforts must be meaningfully faster than recoveries (ratio > 1,10)
  const avgOf = (segs: typeof filtered, key: 'effort' | 'recovery') => {
    const relevant = segs.filter(s => s.type === key);
    if (relevant.length === 0) return 0;
    const sum = relevant.map(s => {
      const pts = points.slice(s.start, s.end + 1);
      return pts.reduce((acc, p) => acc + (p.speed ?? 0), 0) / pts.length;
    }).reduce((a, b) => a + b, 0);
    return sum / relevant.length;
  };
  if (avgOf(filtered, 'effort') / Math.max(avgOf(filtered, 'recovery'), 0.1) < 1.10) return null;

  const intervals: GPXInterval[] = [];
  let num = 0;

  for (const seg of filtered) {
    const pts = points.slice(seg.start, seg.end + 1);
    const dist = pts[pts.length - 1].distFromStart - pts[0].distFromStart;
    const dur = segDuration(seg);
    if (dur < 3 || dist < 5) continue;

    let hrSum = 0, hrCount = 0, hrMax = 0, cadSum = 0, cadCount = 0, maxSpd = 0;
    for (const pt of pts) {
      if (pt.hr !== null) { hrSum += pt.hr; hrCount++; if (pt.hr > hrMax) hrMax = pt.hr; }
      if (pt.cad !== null) { cadSum += pt.cad; cadCount++; }
      if ((pt.speed ?? 0) > maxSpd) maxSpd = pt.speed ?? 0;
    }

    const avgSpd = dur > 0 ? dist / dur : 0;
    // Numéro global séquentiel (1, 2, 3…), pas un compteur séparé par type.
    ++num;

    intervals.push({
      number: num,
      type: seg.type,
      startTime: pts[0].time,
      endTime: pts[pts.length - 1].time,
      duration: dur,
      distance: dist,
      avgSpeed: avgSpd,
      maxSpeed: maxSpd,
      avgPace: avgSpd > 0 ? 1000 / avgSpd : 0,
      avgGAP: calcAvgGAP(pts),
      avgHeartRate: hrCount > 0 ? Math.round(hrSum / hrCount) : null,
      maxHeartRate: hrCount > 0 ? hrMax : null,
      avgCadence: cadCount > 0 ? Math.round(cadSum / cadCount) : null,
      startPointIndex: seg.start,
      endPointIndex: seg.end,
    });
  }

  return intervals;
}
