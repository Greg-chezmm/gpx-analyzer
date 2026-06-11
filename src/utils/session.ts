import type { GPXTrackPoint } from './gpxCore';

// ─── Session classification ───────────────────────────────────────────────────

/** Types de séances détectables automatiquement par classification cardiaque ou vitesse. */
export type SessionType =
  | 'Récupération'
  | 'Endurance aérobie'
  | 'Sortie longue'
  | 'Aérobie / Tempo'
  | 'Seuil'
  | 'Fractionné'
  | 'VO2max';

/** Résultat de la classification d'une séance : type, couleur, emoji, description et répartition par zone. */
export interface SessionClassification {
  type: SessionType;
  color: string;
  emoji: string;
  description: string;
  basis: 'hr' | 'speed';
  zonePcts: number[]; // [Z1..Z5] percentage of time
}

/**
 * Calcule les bornes de fréquence cardiaque des zones Z1–Z5 selon la méthode Karvonen (% de la réserve cardiaque).
 * Formule : FC_zone = FC_repos + %HRR × (FC_max − FC_repos).
 * Bornes retournées : [50%, 60%, 70%, 80%, 90%] de HRR (bpm absolus).
 */
export function karvonenBounds(fcMax: number, fcRest: number): number[] {
  const r = fcMax - fcRest;
  return [0.50, 0.60, 0.70, 0.80, 0.90].map(p => Math.round(fcRest + p * r));
}

/** Retourne l'index de zone (0–4) pour une FC donnée selon les bornes Karvonen. */
function getZoneKarvonen(hr: number, bounds: number[]): number {
  // bounds = [z1min, z2min, z3min, z4min, z5min]
  if (hr >= bounds[4]) return 4; // Z5
  if (hr >= bounds[3]) return 3; // Z4
  if (hr >= bounds[2]) return 2; // Z3
  if (hr >= bounds[1]) return 1; // Z2
  return 0;                       // Z1
}

/**
 * Classifie une séance en type d'entraînement à partir de la distribution temporelle par zones cardiaques (priorité)
 * ou par zones d'allure % VMA (fallback si données FC insuffisantes).
 * La classification cardiaque utilise les bornes Karvonen ; la classification vitesse utilise des seuils % VMA.
 */
export function classifySession(
  points: GPXTrackPoint[],
  fcMax: number,
  fcRest: number,
  vma: number,          // km/h
  durationMin?: number, // total moving time
  intervalCount?: number,
): SessionClassification {
  const bounds = karvonenBounds(fcMax, fcRest);
  const hasIntervals = (intervalCount ?? 0) >= 3;

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
    const pcts = zoneTime.map(t => (t / totalHrTime) * 100);
    let type: SessionType;
    let color: string;
    let emoji: string;
    let description: string;

    // Critères de classification par priorité décroissante
    if (pcts[4] >= 15) {
      type = 'VO2max'; color = '#ef4444'; emoji = '🔴';
      description = `${pcts[4].toFixed(0)}% en Z5 — effort maximal`;
    } else if (hasIntervals && pcts[3] + pcts[4] >= 8) {
      type = 'Fractionné'; color = '#f97316'; emoji = '🟠';
      description = `${intervalCount} répétitions détectées — ${(pcts[3]+pcts[4]).toFixed(0)}% en Z4-Z5`;
    } else if (pcts[3] + pcts[4] >= 25) {
      type = 'Seuil'; color = '#f97316'; emoji = '🟠';
      description = `${(pcts[3] + pcts[4]).toFixed(0)}% en Z4-Z5 — travail au seuil`;
    } else if (pcts[2] >= 25) {
      type = 'Aérobie / Tempo'; color = '#fbbf24'; emoji = '🟡';
      description = `${pcts[2].toFixed(0)}% en Z3 — allure soutenue`;
    } else if ((durationMin ?? 0) >= 90 && pcts[0] + pcts[1] >= 60) {
      type = 'Sortie longue'; color = '#34d399'; emoji = '🟢';
      description = `${Math.round(durationMin!)} min · ${(pcts[0]+pcts[1]).toFixed(0)}% en Z1-Z2`;
    } else if (pcts[1] >= 40) {
      type = 'Endurance aérobie'; color = '#34d399'; emoji = '🟢';
      description = `${pcts[1].toFixed(0)}% en Z2 — endurance fondamentale`;
    } else {
      type = 'Récupération'; color = '#60a5fa'; emoji = '🔵';
      description = `${pcts[0].toFixed(0)}% en Z1 — récupération active`;
    }

    return { type, color, emoji, description, basis: 'hr', zonePcts: pcts };
  }

  // Fallback: speed-based classification (zones % VMA)
  const vmaMs = vma / 3.6;
  const speedTime = [0, 0, 0, 0, 0];
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
  } else if (hasIntervals && sPcts[3] + sPcts[4] >= 8) {
    type = 'Fractionné'; color = '#f97316'; emoji = '🟠';
    description = `${intervalCount} répétitions · ${(sPcts[3]+sPcts[4]).toFixed(0)}% au-dessus de 80% VMA`;
  } else if (sPcts[3] >= 20) {
    type = 'Seuil'; color = '#f97316'; emoji = '🟠';
    description = `${sPcts[3].toFixed(0)}% entre 80–90% VMA`;
  } else if (sPcts[2] >= 35) {
    type = 'Aérobie / Tempo'; color = '#fbbf24'; emoji = '🟡';
    description = `${sPcts[2].toFixed(0)}% entre 65–80% VMA`;
  } else if ((durationMin ?? 0) >= 90 && sPcts[0] + sPcts[1] >= 60) {
    type = 'Sortie longue'; color = '#34d399'; emoji = '🟢';
    description = `${Math.round(durationMin!)} min — sortie longue`;
  } else if (sPcts[1] >= 40) {
    type = 'Endurance aérobie'; color = '#34d399'; emoji = '🟢';
    description = `Vitesse prédominante entre 50–65% VMA`;
  } else {
    type = 'Récupération'; color = '#60a5fa'; emoji = '🔵';
    description = `Allure basse — récupération active`;
  }

  return { type, color, emoji, description, basis: 'speed', zonePcts: sPcts };
}
