import type { GPXTrackPoint } from './gpxCore';
import type { GeoPoint } from './segments';

const R = 6371e3;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Point de destination à `distanceM`/`bearingDeg` d'un point de départ (formule sphérique directe). */
export function destinationPoint(lat: number, lon: number, bearingDeg: number, distanceM: number): { lat: number; lon: number } {
  const delta = distanceM / R;
  const theta = toRad(bearingDeg);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lon);

  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta));
  const lambda2 = lambda1 + Math.atan2(
    Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
    Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
  );

  return { lat: toDeg(phi2), lon: toDeg(lambda2) };
}

export interface PathLeg {
  bearingDeg: number;
  distanceM: number;
}

/** Point de départ par défaut des fixtures — Vieux-Lille, sans signification particulière. */
export const ORIGIN = { lat: 50.6365, lon: 3.0635 };

/**
 * Construit une trace GeoPoint[] en enchaînant des segments droits (`legs`), échantillonnés tous les
 * `stepM` mètres — `distFromStart` cumulé sur l'ensemble du trajet. Permet de fabriquer des géométries
 * réalistes pour tester le moteur de matching (lignes droites, épingles, boucles, détours) sans
 * dépendre d'un vrai fichier GPX.
 */
export function walkPath(start: { lat: number; lon: number }, legs: PathLeg[], stepM = 20): GeoPoint[] {
  const points: GeoPoint[] = [];
  let cur = start;
  let dist = 0;
  points.push({ lat: cur.lat, lon: cur.lon, distFromStart: dist });

  for (const leg of legs) {
    const steps = Math.max(1, Math.round(leg.distanceM / stepM));
    const stepDist = leg.distanceM / steps;
    for (let i = 0; i < steps; i++) {
      cur = destinationPoint(cur.lat, cur.lon, leg.bearingDeg, stepDist);
      dist += stepDist;
      points.push({ lat: cur.lat, lon: cur.lon, distFromStart: dist });
    }
  }
  return points;
}

/** Enrichit des GeoPoint[] en GPXTrackPoint[] complets (temps régulier à `speedMs` constante, pas de FC/altitude par défaut) — nécessaire pour buildAttempt/matchFullRoute/matchStoredSegment. */
export function toTrackPoints(points: GeoPoint[], speedMs = 3): GPXTrackPoint[] {
  const start = Date.now();
  return points.map((p) => ({
    lat: p.lat,
    lon: p.lon,
    distFromStart: p.distFromStart,
    ele: null,
    time: new Date(start + (p.distFromStart / speedMs) * 1000),
    hr: null,
    cad: null,
    power: null,
    temp: null,
    speed: speedMs,
    rawSpeed: speedMs,
    grade: null,
  }));
}

/** Inverse l'ordre d'un tracé et recalcule distFromStart depuis 0 — simule un aller-retour en sens inverse. */
export function reversePath(points: GeoPoint[]): GeoPoint[] {
  const reversed = [...points].reverse();
  const start = reversed[0]?.distFromStart ?? 0;
  return reversed.map(p => ({ ...p, distFromStart: start - p.distFromStart }));
}
