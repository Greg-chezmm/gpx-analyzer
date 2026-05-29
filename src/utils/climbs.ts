import type { GPXActivity } from './gpxCore';

// ─── Climb analysis ──────────────────────────────────────────────────────────

export type ClimbCategory = 'moderate' | 'steep' | 'very_steep';

export interface ClimbSegment {
  category: ClimbCategory;
  startIndex: number;
  endIndex: number;
  distance: number;   // meters
  elevGain: number;   // meters
  avgGrade: number;   // %
  maxGrade: number;   // %
  duration: number;   // seconds
  avgPace: number;    // s/km
  vam: number;        // m/h
  avgHR: number | null;
}

export const CLIMB_CATEGORIES: Record<ClimbCategory, { label: string; minGrade: number; maxGrade: number; color: string }> = {
  moderate:   { label: "Modéré",     minGrade:  5, maxGrade: 12, color: "#34d399" },
  steep:      { label: "Raide",      minGrade: 12, maxGrade: 20, color: "#fbbf24" },
  very_steep: { label: "Très raide", minGrade: 20, maxGrade: Infinity, color: "#f97316" },
};

export function detectClimbs(activity: GPXActivity): ClimbSegment[] {
  const pts = activity.points;
  if (pts.length < 10) return [];

  const MIN_GRADE    = 5;    // % — below this, not a climb
  const MIN_DIST     = 80;   // meters — minimum climb length
  const MIN_ELEV     = 8;    // meters — minimum elevation gain
  const MERGE_GAP    = 60;   // meters — merge segments closer than this

  // Light secondary smooth (±2 points) for segment detection and maxGrade.
  // Per-point grades are already stable over ~60 m; this pass only kills
  // isolated single-point spikes without masking genuine steep sections.
  const smoothGrade: number[] = new Array(pts.length).fill(0);
  for (let i = 0; i < pts.length; i++) {
    let sum = 0, count = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(pts.length - 1, i + 2); k++) {
      if (pts[k].grade !== null) { sum += pts[k].grade!; count++; }
    }
    smoothGrade[i] = count > 0 ? sum / count : 0;
  }

  // Identify climbing point indices
  const climbing = smoothGrade.map(g => g >= MIN_GRADE);

  // Build raw segments
  interface Seg { start: number; end: number }
  const segs: Seg[] = [];
  let inSeg = false, segStart = 0;
  for (let i = 0; i < pts.length; i++) {
    if (!inSeg && climbing[i]) { inSeg = true; segStart = i; }
    else if (inSeg && !climbing[i]) { segs.push({ start: segStart, end: i - 1 }); inSeg = false; }
  }
  if (inSeg) segs.push({ start: segStart, end: pts.length - 1 });

  // Merge nearby segments
  const merged: Seg[] = [];
  for (const s of segs) {
    if (merged.length === 0) { merged.push({ ...s }); continue; }
    const prev = merged[merged.length - 1];
    const gap = pts[s.start].distFromStart - pts[prev.end].distFromStart;
    if (gap <= MERGE_GAP) prev.end = s.end;
    else merged.push({ ...s });
  }

  // Convert to ClimbSegment, filter noise
  const result: ClimbSegment[] = [];
  for (const s of merged) {
    const dist = pts[s.end].distFromStart - pts[s.start].distFromStart;
    const elevGain = Math.max(0, (pts[s.end].ele ?? 0) - (pts[s.start].ele ?? 0));
    if (dist < MIN_DIST || elevGain < MIN_ELEV) continue;

    const avgGrade = (elevGain / dist) * 100;
    // maxGrade: independent 15 m half-window scan (30 m total) computed directly
    // from elevation. Short enough to capture steep sections, long enough to filter
    // point-to-point GPS noise. Does NOT use the 60 m per-point grade values.
    let maxGrade = 0;
    const MAX_HALF_M = 15;
    for (let i = s.start; i <= s.end; i++) {
      const base = pts[i].distFromStart;
      let lo = i, hi = i;
      while (lo > s.start && base - pts[lo - 1].distFromStart < MAX_HALF_M) lo--;
      while (hi < s.end   && pts[hi + 1].distFromStart - base < MAX_HALF_M)  hi++;
      const hd = pts[hi].distFromStart - pts[lo].distFromStart;
      if (hd >= 5 && pts[hi].ele !== null && pts[lo].ele !== null) {
        const g = ((pts[hi].ele! - pts[lo].ele!) / hd) * 100;
        if (g > maxGrade) maxGrade = g;
      }
    }
    maxGrade = Math.max(maxGrade, avgGrade);

    let duration = 0;
    if (pts[s.start].time && pts[s.end].time) {
      duration = (pts[s.end].time!.getTime() - pts[s.start].time!.getTime()) / 1000;
    }

    const hrVals: number[] = [];
    for (let i = s.start; i <= s.end; i++) {
      if (pts[i].hr !== null) hrVals.push(pts[i].hr!);
    }

    let category: ClimbCategory;
    if (avgGrade >= 20)      category = 'very_steep';
    else if (avgGrade >= 12) category = 'steep';
    else                     category = 'moderate';

    result.push({
      category,
      startIndex: s.start,
      endIndex:   s.end,
      distance: Math.round(dist),
      elevGain:  Math.round(elevGain),
      avgGrade:  Math.round(avgGrade * 10) / 10,
      maxGrade:  Math.round(maxGrade * 10) / 10,
      duration:  Math.round(duration),
      avgPace:   dist > 0 && duration > 0 ? (duration / (dist / 1000)) : 0,
      vam:       duration > 0 ? Math.round(elevGain / (duration / 3600)) : 0,
      avgHR:     hrVals.length > 0 ? Math.round(hrVals.reduce((a, b) => a + b, 0) / hrVals.length) : null,
    });
  }

  return result;
}
