import type { GPXActivity } from './gpxCore';

// Interval analysis (effort / recovery repeats)
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
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgCadence: number | null;
  startPointIndex: number;
  endPointIndex: number;
}

export function detectIntervals(activity: GPXActivity): GPXInterval[] | null {
  const { points } = activity;
  if (points.length < 60) return null;

  const movingSpeeds = points.map(p => p.speed ?? 0).filter(s => s > 0.5).sort((a, b) => a - b);
  if (movingSpeeds.length < 20) return null;
  const median = movingSpeeds[Math.floor(movingSpeeds.length / 2)];
  if (median <= 0) return null;

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

  const filtered = segments.filter(s =>
    s.type === 'effort' ? segDuration(s) >= 20 : segDuration(s) >= 10
  );

  const effortSegs = filtered.filter(s => s.type === 'effort');
  if (effortSegs.length < 2) return null;

  // Validate: efforts must be meaningfully faster than recoveries
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
  let effortNum = 0, recoveryNum = 0;

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
    const num = seg.type === 'effort' ? ++effortNum : ++recoveryNum;

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
      avgHeartRate: hrCount > 0 ? Math.round(hrSum / hrCount) : null,
      maxHeartRate: hrCount > 0 ? hrMax : null,
      avgCadence: cadCount > 0 ? Math.round(cadSum / cadCount) : null,
      startPointIndex: seg.start,
      endPointIndex: seg.end,
    });
  }

  return intervals;
}
