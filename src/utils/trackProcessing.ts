// ─── Shared track-point processing ──────────────────────────────────────────
// Used by both gpxCore.ts (GPX) and fitParser.ts (FIT) so the two formats
// produce identical GPXActivity objects from the same raw point array.
//
// Invariant: points must already have distFromStart set before calling these.

import type { GPXTrackPoint } from './gpxCore';

// ── 1. enrichPoints ──────────────────────────────────────────────────────────
// Mutates points in-place:
//   a) Elevation smoothing — fenêtre symétrique ±5 points (11 points au total).
//      Nécessaire pour les GPX corrigés DEM (ex. Strava) : le bruit per-point
//      est < 0,25 m mais s'accumule sur les km. Un seuil naïf sous-compte massivement.
//   b) Elevation gain / loss accumulation from smoothed values.
//   c) Raw speed from consecutive distFromStart / time deltas.
//   d) Speed smoothing — moyenne mobile 5 points (supprime les pics GPS).
//   e) Grade — fenêtre de 60 m indépendante de la fréquence d'enregistrement.
//
// Returns the rounded elevationGain / elevationLoss (meters).

/**
 * Enrichit les points in-place : lissage altitude (±5 pts), calcul D+/D−,
 * vitesse brute, lissage vitesse (±2 pts), et pente sur fenêtre 60 m.
 * Retourne D+, D−, nombre d'outliers altitude corrigés et couverture altitude.
 */
export function enrichPoints(points: GPXTrackPoint[]): {
  elevationGain: number;
  elevationLoss: number;
  elevOutliers: number;
  elevCoverage: number;
} {
  if (points.length === 0) return { elevationGain: 0, elevationLoss: 0, elevOutliers: 0, elevCoverage: 100 };

  // a) Elevation smoothing
  const rawEle = points.map(p => p.ele);

  // Pré-passe : rejette les outliers altitude GPS isolés avant le lissage.
  // Un point déviant de > 50 m de la moyenne de ses voisins est quasi-certainement
  // du bruit capteur (précision GPS altitude typique : ±10–20 m, pas ±100 m).
  let elevOutliers = 0;
  for (let i = 1; i < rawEle.length - 1; i++) {
    if (rawEle[i] === null) continue;
    const prev = rawEle[i - 1], next = rawEle[i + 1];
    if (prev === null || next === null) continue;
    if (Math.abs(rawEle[i]! - (prev + next) / 2) > 50) {
      rawEle[i] = (prev + next) / 2;
      elevOutliers++;
    }
  }
  const elevWithData = rawEle.filter(e => e !== null).length;
  const elevCoverage = Math.round(elevWithData / points.length * 100);

  // Lissage 11 points (±5) sur les altitudes nettoyées
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

  // b) Elevation gain / loss (from smoothed values)
  let elevationGain = 0, elevationLoss = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = (points[i].ele ?? 0) - (points[i - 1].ele ?? 0);
    if (points[i].ele !== null && points[i - 1].ele !== null) {
      if (diff > 0) elevationGain += diff;
      else           elevationLoss += -diff;
    }
  }

  // c) Raw speed (Δdistance / Δtime point-à-point)
  points[0].rawSpeed = 0;
  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    const distDiff = curr.distFromStart - prev.distFromStart;
    const timeDiff = curr.time && prev.time
      ? (curr.time.getTime() - prev.time.getTime()) / 1000 : 0;
    curr.rawSpeed = timeDiff > 0 && distDiff > 0 ? distDiff / timeDiff : 0;
  }

  // d) Speed smoothing (moyenne mobile 5 points — supprime pics GPS)
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

  // e) Grade — fenêtre de 60 m (±30 m de chaque côté)
  // Indépendante de la fréquence d'enregistrement : stable à 1 s comme à 5 s.
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
    elevOutliers,
    elevCoverage,
  };
}

// ── 2. computeTrackStats ──────────────────────────────────────────────────────
// Computes global timing / speed statistics from enriched points.
// fallbackDistance: totalDistance in meters (used when timestamps are absent).

/**
 * Calcule les statistiques globales de l'activité depuis les points enrichis :
 * durée totale, temps en mouvement (vitesse > 0,5 m/s et Δt < 30 s),
 * vitesse max, vitesse et allure moyennes, nombre et durée max des pauses GPS.
 */
export function computeTrackStats(points: GPXTrackPoint[], fallbackDistance: number) {
  const startTime = points[0].time;
  const endTime   = points[points.length - 1].time;
  const totalDuration = startTime && endTime
    ? (endTime.getTime() - startTime.getTime()) / 1000 : 0;

  let movingTime = 0, maxSpeed = 0, movingSpeedSum = 0, movingPointsCount = 0;
  let gapCount = 0, longestGap = 0;

  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    const timeDiff = curr.time && prev.time
      ? (curr.time.getTime() - prev.time.getTime()) / 1000 : 0;

    // Pause GPS : intervalle ≥ 30 s entre deux points consécutifs
    if (timeDiff >= 30) {
      gapCount++;
      if (timeDiff > longestGap) longestGap = timeDiff;
    }

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
    gapCount,
    longestGap,
  };
}
