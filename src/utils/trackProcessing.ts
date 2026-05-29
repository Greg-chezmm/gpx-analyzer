// ─── Shared track-point processing ──────────────────────────────────────────
// Used by both gpxCore.ts (GPX) and fitParser.ts (FIT) so the two formats
// produce identical GPXActivity objects from the same raw point array.
//
// Invariant: points must already have distFromStart set before calling these.

import type { GPXTrackPoint } from './gpxCore';

// ── 1. enrichPoints ──────────────────────────────────────────────────────────
// Mutates points in-place:
//   a) Elevation smoothing — 11-point symmetric moving average.
//      Required for DEM-corrected GPX (Strava): per-point noise < 0.25 m but
//      real terrain accumulates over km. A naive threshold massively under-counts.
//   b) Elevation gain / loss accumulation from smoothed values.
//   c) Raw speed from consecutive distFromStart / time deltas.
//   d) Speed smoothing — 5-point moving average (kills GPS spikes).
//   e) Grade — 60 m distance window regardless of recording frequency.
//
// Returns the rounded elevationGain / elevationLoss (meters).

export function enrichPoints(points: GPXTrackPoint[]): {
  elevationGain: number;
  elevationLoss: number;
} {
  if (points.length === 0) return { elevationGain: 0, elevationLoss: 0 };

  // a) Elevation smoothing
  const rawEle = points.map(p => p.ele);

  // Pre-pass: reject isolated GPS altitude outliers before smoothing.
  // A point deviating > 50 m from its neighbors' midpoint is almost certainly
  // sensor noise (GPS altitude accuracy is typically ±10-20 m, not ±100 m).
  for (let i = 1; i < rawEle.length - 1; i++) {
    if (rawEle[i] === null) continue;
    const prev = rawEle[i - 1], next = rawEle[i + 1];
    if (prev === null || next === null) continue;
    if (Math.abs(rawEle[i]! - (prev + next) / 2) > 50) {
      rawEle[i] = (prev + next) / 2;
    }
  }

  const ELE_WIN = 5;
  for (let i = 0; i < points.length; i++) {
    if (rawEle[i] === null) continue;
    const lo = Math.max(0, i - ELE_WIN);
    const hi = Math.min(points.length - 1, i + ELE_WIN);
    let sum = 0, cnt = 0;
    for (let j = lo; j <= hi; j++) {
      if (rawEle[j] !== null) { sum += rawEle[j]!; cnt++; }
    }
    points[i].ele = cnt > 0 ? sum / cnt : rawEle[i];
  }

  // b) Elevation gain / loss
  let elevationGain = 0, elevationLoss = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = (points[i].ele ?? 0) - (points[i - 1].ele ?? 0);
    if (points[i].ele !== null && points[i - 1].ele !== null) {
      if (diff > 0) elevationGain += diff;
      else           elevationLoss += -diff;
    }
  }

  // c) Raw speed
  points[0].rawSpeed = 0;
  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    const distDiff = curr.distFromStart - prev.distFromStart;
    const timeDiff = curr.time && prev.time
      ? (curr.time.getTime() - prev.time.getTime()) / 1000 : 0;
    curr.rawSpeed = timeDiff > 0 && distDiff > 0 ? distDiff / timeDiff : 0;
  }

  // d) Speed smoothing (5-point moving average)
  const SPD_WIN = 5;
  const half = Math.floor(SPD_WIN / 2);
  for (let i = 0; i < points.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(points.length - 1, i + half);
    let sum = 0, count = 0;
    for (let j = lo; j <= hi; j++) {
      if (points[j].rawSpeed !== null) { sum += points[j].rawSpeed!; count++; }
    }
    points[i].speed = count > 0 ? sum / count : 0;
  }
  points[0].speed = 0;

  // e) Grade — 60 m window (±30 m each side)
  const HALF_M = 30;
  for (let i = 0; i < points.length; i++) {
    const base = points[i].distFromStart;
    let lo = i, hi = i;
    while (lo > 0 && base - points[lo - 1].distFromStart < HALF_M) lo--;
    while (hi < points.length - 1 && points[hi + 1].distFromStart - base < HALF_M) hi++;
    const hDist = points[hi].distFromStart - points[lo].distFromStart;
    if (hDist >= 10 && points[hi].ele !== null && points[lo].ele !== null) {
      points[i].grade = Math.round(((points[hi].ele! - points[lo].ele!) / hDist) * 1000) / 10;
    } else {
      points[i].grade = 0;
    }
  }

  return {
    elevationGain: Math.round(elevationGain * 10) / 10,
    elevationLoss: Math.round(elevationLoss * 10) / 10,
  };
}

// ── 2. computeTrackStats ──────────────────────────────────────────────────────
// Computes global timing / speed statistics from enriched points.
// fallbackDistance: totalDistance in meters (used when timestamps are absent).

export function computeTrackStats(points: GPXTrackPoint[], fallbackDistance: number) {
  const startTime = points[0].time;
  const endTime   = points[points.length - 1].time;
  const totalDuration = startTime && endTime
    ? (endTime.getTime() - startTime.getTime()) / 1000 : 0;

  let movingTime = 0, maxSpeed = 0, movingSpeedSum = 0, movingPointsCount = 0;

  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    const timeDiff = curr.time && prev.time
      ? (curr.time.getTime() - prev.time.getTime()) / 1000 : 0;

    if (timeDiff > 0 && timeDiff < 30) {
      const spd = curr.speed ?? 0;
      if (spd > 0.5) {
        movingTime         += timeDiff;
        movingSpeedSum     += spd * timeDiff;
        movingPointsCount  += timeDiff;
      }
    }
    if ((curr.speed ?? 0) > maxSpeed) maxSpeed = curr.speed ?? 0;
  }

  if (movingTime === 0 || !startTime) {
    movingTime = totalDuration || fallbackDistance / 4;
  }

  const avgSpeed = movingTime > 0
    ? (movingPointsCount > 0 ? movingSpeedSum / movingPointsCount : fallbackDistance / movingTime)
    : 0;

  return {
    startTime,
    endTime,
    totalDuration,
    movingTime,
    maxSpeed,
    avgSpeed,
    avgPace: avgSpeed > 0 ? 1000 / avgSpeed : 0,
  };
}
