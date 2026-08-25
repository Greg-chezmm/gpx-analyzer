import type { GPXTrackPoint } from './gpxCore';

// ─── Meilleurs efforts — best efforts (course) / courbe de puissance (vélo) ────

/** Distances standard pour les meilleurs efforts course à pied (mètres). */
export const RUN_DISTANCES: { key: string; label: string; meters: number }[] = [
  { key: '400m',  label: '400 m',   meters: 400 },
  { key: '1km',   label: '1 km',    meters: 1000 },
  { key: '5km',   label: '5 km',    meters: 5000 },
  { key: '10km',  label: '10 km',   meters: 10000 },
  { key: '21km',  label: 'Semi',    meters: 21097 },
  { key: '42km',  label: 'Marathon', meters: 42195 },
];

/** Durées standard pour la courbe de puissance/vitesse vélo (secondes). */
export const BIKE_DURATIONS: { key: string; label: string; seconds: number }[] = [
  { key: '5s',    label: '5 s',    seconds: 5 },
  { key: '1min',  label: '1 min',  seconds: 60 },
  { key: '5min',  label: '5 min',  seconds: 300 },
  { key: '20min', label: '20 min', seconds: 1200 },
  { key: '60min', label: '60 min', seconds: 3600 },
];

export interface BestEffortsData {
  unit: 'time' | 'power' | 'speed';
  values: Record<string, number>; // running: secondes ; vélo: watts ou km/h
}

/** Meilleur temps (s) pour couvrir `targetMeters` en continu — two-pointer O(n) sur distFromStart (monotone). */
function bestTimeForDistance(points: GPXTrackPoint[], targetMeters: number): number | null {
  const pts = points.filter(p => p.time !== null);
  if (pts.length < 2) return null;
  if (pts[pts.length - 1].distFromStart - pts[0].distFromStart < targetMeters) return null;

  let j = 0;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    if (j < i) j = i;
    while (j < pts.length - 1 && pts[j].distFromStart - pts[i].distFromStart < targetMeters) j++;
    if (pts[j].distFromStart - pts[i].distFromStart < targetMeters) break; // distance restante insuffisante à partir d'ici
    let crossTimeMs: number;
    if (j === i) {
      crossTimeMs = pts[j].time!.getTime();
    } else {
      const prev = pts[j - 1], cur = pts[j];
      const distPrev = prev.distFromStart - pts[i].distFromStart;
      const distCur = cur.distFromStart - pts[i].distFromStart;
      const frac = distCur > distPrev ? (targetMeters - distPrev) / (distCur - distPrev) : 0;
      crossTimeMs = prev.time!.getTime() + frac * (cur.time!.getTime() - prev.time!.getTime());
    }
    const elapsed = (crossTimeMs - pts[i].time!.getTime()) / 1000;
    if (elapsed > 0 && elapsed < best) best = elapsed;
  }
  return best === Infinity ? null : best;
}

/** Ré-échantillonne un champ numérique du point sur une grille 1 Hz (interpolation linéaire) pour un fenêtrage glissant simple. */
function resampleSeriesPerSecond(points: GPXTrackPoint[], accessor: (p: GPXTrackPoint) => number): number[] {
  const pts = points.filter(p => p.time !== null);
  if (pts.length < 2) return [];
  const t0 = pts[0].time!.getTime();
  const totalSec = Math.floor((pts[pts.length - 1].time!.getTime() - t0) / 1000);
  const out: number[] = new Array(totalSec + 1);
  let idx = 0;
  for (let s = 0; s <= totalSec; s++) {
    const targetMs = t0 + s * 1000;
    while (idx < pts.length - 2 && pts[idx + 1].time!.getTime() < targetMs) idx++;
    const a = pts[idx], b = pts[Math.min(idx + 1, pts.length - 1)];
    const ta = a.time!.getTime(), tb = b.time!.getTime();
    const frac = tb > ta ? (targetMs - ta) / (tb - ta) : 0;
    const va = accessor(a), vb = accessor(b);
    out[s] = va + frac * (vb - va);
  }
  return out;
}

/** Meilleure moyenne glissante sur une fenêtre de `windowSec` secondes (somme glissante O(n)). */
function bestAvgOverWindow(series: number[], windowSec: number): number | null {
  if (series.length < windowSec) return null;
  let sum = 0;
  for (let i = 0; i < windowSec; i++) sum += series[i];
  let best = sum;
  for (let i = windowSec; i < series.length; i++) {
    sum += series[i] - series[i - windowSec];
    if (sum > best) best = sum;
  }
  return best / windowSec;
}

/**
 * Calcule les meilleurs efforts d'une activité : temps record sur distances standard (course),
 * ou puissance/vitesse moyenne max sur durées standard (vélo, watts si dispo sinon vitesse).
 * Appelé à la sauvegarde Drive — le résultat est stocké dans l'index (`ActivityIndexEntry.bestEfforts`)
 * pour agréger la courbe sans avoir à retélécharger/reparser chaque fichier.
 */
export function computeBestEfforts(points: GPXTrackPoint[], activityType: string): BestEffortsData | null {
  if (activityType === 'cycling') {
    const hasPower = points.some(p => p.power !== null && p.power > 0);
    const series = resampleSeriesPerSecond(points, hasPower ? (p => p.power ?? 0) : (p => p.speed ?? 0));
    if (series.length === 0) return null;
    const values: Record<string, number> = {};
    for (const { key, seconds } of BIKE_DURATIONS) {
      const v = bestAvgOverWindow(series, seconds);
      if (v !== null) values[key] = hasPower ? Math.round(v) : Math.round(v * 3.6 * 10) / 10; // m/s → km/h
    }
    if (Object.keys(values).length === 0) return null;
    return { unit: hasPower ? 'power' : 'speed', values };
  }

  const values: Record<string, number> = {};
  for (const { key, meters } of RUN_DISTANCES) {
    const t = bestTimeForDistance(points, meters);
    if (t !== null) values[key] = Math.round(t * 10) / 10;
  }
  if (Object.keys(values).length === 0) return null;
  return { unit: 'time', values };
}
