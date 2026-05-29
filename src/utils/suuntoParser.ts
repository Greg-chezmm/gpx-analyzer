import type { GPXActivity, GPXTrackPoint } from './gpxCore';

// Suunto JSON Windows — pre-computed lap/segment data
export interface GPXLap {
  number: number;
  intervalType: 'Warmup' | 'Interval' | 'Recovery' | 'Cooldown';
  notes: string;
  endTime: Date | null;
  duration: number;       // seconds
  distance: number;       // meters
  avgSpeed: number;       // m/s
  maxSpeed: number;       // m/s
  avgPace: number;        // s/km
  elevationGain: number;  // meters
  elevationLoss: number;  // meters
  avgHeartRate: number | null;      // bpm
  maxHeartRate: number | null;      // bpm
  minHeartRate: number | null;      // bpm
  avgCadencePPM: number | null;     // steps/min (already ×120)
  avgPower: number | null;          // watts
  avgVerticalSpeedMpm: number | null; // m/min (positive = climbing)
  energyKcal: number | null;        // kcal
  avgTempC: number | null;          // °C
}

// ─── Suunto session summary from Header ──────────────────────────────────────
export interface SuuntoSessionHeader {
  vo2max: number | null;                    // mL/kg/min
  epoc: number | null;                      // mL/kg
  trainingEffect: number | null;            // 0–5
  recoveryTimeH: number | null;             // hours
  energyKcal: number | null;               // kcal
  stepCount: number | null;
  fcMaxBpm: number | null;                  // Personal.MaxHR × 60
}

type SuuntoWindow = {
  IntervalType: string;
  IntervalNotes: string;
  Duration: number;
  Distance: number;
  Ascent: number;
  Descent: number;
  Energy: number | null;
  Speed:         [{ Avg: number; Max: number; Min: number }] | null;
  HR:            [{ Avg: number; Max: number; Min: number }] | null;
  Cadence:       [{ Avg: number }] | null;
  Power:         [{ Avg: number }] | null;
  VerticalSpeed: [{ Avg: number }] | null;
  Temperature:   [{ Avg: number }] | null;
};

export function parseSuuntoWindows(jsonText: string): { laps: GPXLap[]; header: SuuntoSessionHeader } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error("Fichier JSON invalide.");
  }

  const windows = data?.DeviceLog?.Windows;
  if (!Array.isArray(windows)) {
    throw new Error("Format JSON Suunto non reconnu (clé 'Windows' manquante).");
  }

  // ── Parse Header ─────────────────────────────────────────────────────────
  const h = data?.DeviceLog?.Header ?? {};
  const header: SuuntoSessionHeader = {
    vo2max:          h.MAXVO2 ?? null,
    epoc:            h.EPOC ?? null,
    trainingEffect:  h.PeakTrainingEffect ?? null,
    recoveryTimeH:   h.RecoveryTime != null ? Math.round(h.RecoveryTime / 3600) : null,
    energyKcal:      h.Energy != null ? Math.round(h.Energy / 4184) : null,
    stepCount:       h.StepCount ?? null,
    fcMaxBpm:        h.Personal?.MaxHR != null ? Math.round(h.Personal.MaxHR * 60) : null,
  };

  // ── Parse Windows (laps) ─────────────────────────────────────────────────
  const VALID = new Set(['Warmup', 'Interval', 'Recovery', 'Cooldown']);
  const laps: GPXLap[] = [];
  let num = 0;

  for (const item of windows) {
    const w = item?.Window as SuuntoWindow | undefined;
    if (!w || !VALID.has(w.IntervalType)) continue;
    num++;

    const spd    = w.Speed?.[0]?.Avg ?? null;
    const spdMax = w.Speed?.[0]?.Max ?? null;
    const hrAvg  = w.HR?.[0]?.Avg ?? null;
    const hrMax  = w.HR?.[0]?.Max ?? null;
    const hrMin  = w.HR?.[0]?.Min ?? null;
    const cad    = w.Cadence?.[0]?.Avg ?? null;
    const pwr    = w.Power?.[0]?.Avg ?? null;
    const vs     = w.VerticalSpeed?.[0]?.Avg ?? null;
    const temp   = w.Temperature?.[0]?.Avg ?? null;
    const energy = w.Energy ?? null;

    laps.push({
      number:       num,
      intervalType: w.IntervalType as GPXLap['intervalType'],
      notes:        w.IntervalNotes ?? '',
      endTime:      item.TimeISO8601 ? new Date(item.TimeISO8601) : null,
      duration:     w.Duration ?? 0,
      distance:     w.Distance ?? 0,
      avgSpeed:     spd ?? 0,
      maxSpeed:     spdMax ?? 0,
      avgPace:      spd && spd > 0 ? 1000 / spd : 0,
      elevationGain: w.Ascent ?? 0,
      elevationLoss: w.Descent ?? 0,
      avgHeartRate:  hrAvg !== null ? Math.round(hrAvg * 60) : null,
      maxHeartRate:  hrMax !== null ? Math.round(hrMax * 60) : null,
      minHeartRate:  hrMin !== null ? Math.round(hrMin * 60) : null,
      avgCadencePPM: cad !== null ? Math.round(cad * 60) : null, // raw per-min (×2 for running ppm, ×1 for cycling rpm)
      avgPower:      pwr !== null ? Math.round(pwr) : null,
      avgVerticalSpeedMpm: vs !== null ? Math.round(vs * 60 * 10) / 10 : null,
      energyKcal:    energy !== null ? Math.round(energy / 4184) : null,
      avgTempC:      temp !== null ? Math.round((temp - 273.15) * 10) / 10 : null,
    });
  }

  return { laps, header };
}

// ─── Suunto Samples — barometric altitude ────────────────────────────────────

export interface BaroSample {
  time: number; // ms epoch
  alt: number;  // meters (barometric)
}

export function parseSuuntoBaroSamples(jsonText: string): BaroSample[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  try { data = JSON.parse(jsonText); } catch { return []; }
  const samples = data?.DeviceLog?.Samples;
  if (!Array.isArray(samples)) return [];

  const result: BaroSample[] = [];
  for (const s of samples) {
    if (s.Altitude == null || !s.TimeISO8601) continue;
    const t = new Date(s.TimeISO8601).getTime();
    if (!isNaN(t)) result.push({ time: t, alt: s.Altitude });
  }
  return result;
}

// Enrich GPX points with barometric altitude from Suunto Samples
export function enrichWithBaroAlt(activity: GPXActivity, baro: BaroSample[]): GPXActivity {
  if (baro.length === 0) return activity;

  // Build sorted index
  const sorted = [...baro].sort((a, b) => a.time - b.time);

  const enrichedPoints = activity.points.map((pt: GPXTrackPoint) => {
    if (pt.time === null) return pt;
    const t = pt.time.getTime();
    // Binary search for nearest sample
    let lo = 0, hi = sorted.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].time < t) lo = mid + 1; else hi = mid;
    }
    // Pick nearest within ±10s
    const candidates = [sorted[Math.max(0, lo - 1)], sorted[lo]].filter(Boolean);
    const nearest = candidates.reduce((a, b) =>
      Math.abs(a.time - t) <= Math.abs(b.time - t) ? a : b
    );
    if (Math.abs(nearest.time - t) > 10_000) return pt;
    return { ...pt, ele: nearest.alt };
  });

  // Recalculate elevation gain/loss from the baro-enriched points
  let baroGain = 0, baroLoss = 0;
  for (let i = 1; i < enrichedPoints.length; i++) {
    const curr = enrichedPoints[i], prev = enrichedPoints[i - 1];
    if (curr.ele !== null && prev.ele !== null) {
      const diff = curr.ele - prev.ele;
      if (diff > 0.1) baroGain += diff;
      else if (diff < -0.1) baroLoss += Math.abs(diff);
    }
  }

  return {
    ...activity,
    points: enrichedPoints,
    elevationGain: Math.round(baroGain * 10) / 10,
    elevationLoss: Math.round(baroLoss * 10) / 10,
  };
}
