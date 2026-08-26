import { aggregateBestRunEfforts, type BestEffortsData } from './bestEfforts';
import type { ManualBests } from '../hooks/useManualBests';

// ─── Vitesse critique (Critical Speed) — modèle hyperbolique de Monod & Scherrer (1965) ────────
//
// d = CS × t + D'  (distance parcourue en fonction du temps jusqu'à épuisement)
// CS (Critical Speed) : asymptote — vitesse soutenable indéfiniment sans épuisement anaérobie.
// D' (D-prime) : capacité de distance anaérobie, consommée au-delà de CS.
// Régression linéaire (moindres carrés) sur les meilleurs efforts (distance, temps).

/** Point utilisé dans la régression (record personnel sur une distance donnée). */
export interface CSPoint {
  key: string;
  label: string;
  meters: number;
  timeSeconds: number;
  entryName: string;
  entryDate: string;
}

export interface CriticalSpeedResult {
  cs: number;               // m/s
  csPaceSecPerKm: number;   // allure équivalente, s/km
  dPrime: number;           // mètres
  rSquared: number;
  confidence: 'low' | 'medium' | 'high';
  points: CSPoint[];
}

// Fenêtre de durées où le modèle CS est physiologiquement valide (domaine "sévère") — en-dehors,
// l'effort est soit trop anaérobie (sprint) soit limité par la gestion de l'allure/ravitaillement
// (longue distance), ce qui fausse la régression.
const MIN_DURATION_S = 120;  // 2 min
const MAX_DURATION_S = 1800; // 30 min

/** Ajuste le modèle CS/D' par régression linéaire sur les points (distance, temps) dans la fenêtre valide. */
export function estimateCriticalSpeed(points: CSPoint[]): CriticalSpeedResult | null {
  const pts = points.filter(p => p.timeSeconds >= MIN_DURATION_S && p.timeSeconds <= MAX_DURATION_S);
  if (pts.length < 2) return null;

  const n = pts.length;
  const sumT  = pts.reduce((s, p) => s + p.timeSeconds, 0);
  const sumD  = pts.reduce((s, p) => s + p.meters, 0);
  const sumTT = pts.reduce((s, p) => s + p.timeSeconds * p.timeSeconds, 0);
  const sumTD = pts.reduce((s, p) => s + p.timeSeconds * p.meters, 0);
  const denom = n * sumTT - sumT * sumT;
  if (denom === 0) return null;

  const cs = (n * sumTD - sumT * sumD) / denom;
  const dPrime = (sumD - cs * sumT) / n;
  if (cs <= 0) return null;

  const meanD = sumD / n;
  const ssTot = pts.reduce((s, p) => s + (p.meters - meanD) ** 2, 0);
  const ssRes = pts.reduce((s, p) => { const pred = cs * p.timeSeconds + dPrime; return s + (p.meters - pred) ** 2; }, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 1;

  // 2 points définissent toujours une droite exacte (R²=1 trivial) — ne peut pas valider la linéarité,
  // donc plafonné à 'medium' même avec un ajustement parfait.
  const confidence: 'low' | 'medium' | 'high' =
    pts.length >= 3 && rSquared >= 0.98 ? 'high' :
    rSquared >= 0.85 ? 'medium' : 'low';

  return { cs, csPaceSecPerKm: 1000 / cs, dPrime, rSquared, confidence, points: pts };
}

/** Construit les points (distance, temps) depuis l'historique Drive et ajuste le modèle CS/D'. */
export function estimateCriticalSpeedFromHistory(
  history: { activityType: string; bestEfforts?: BestEffortsData; name: string; date: string }[],
  manualBests?: ManualBests,
): CriticalSpeedResult | null {
  const best = aggregateBestRunEfforts(history, manualBests);
  return estimateCriticalSpeed(best.map(b => ({
    key: b.key, label: b.label, meters: b.meters, timeSeconds: b.timeSeconds,
    entryName: b.entryName, entryDate: b.entryDate,
  })));
}

/** Interprète l'ordre de grandeur de D' (réserve anaérobie) par rapport aux valeurs typiques chez les coureurs entraînés (~150-400 m). */
export function dPrimeProfile(dPrime: number): 'endurant' | 'equilibre' | 'explosif' {
  if (dPrime < 120) return 'endurant';
  if (dPrime <= 250) return 'equilibre';
  return 'explosif';
}
