import type { GPXActivity, GPXTrackPoint } from './gpxCore';
import type { Sex } from '../hooks/useUserSettings';
import { karvonenBounds, getZoneKarvonen } from './session';

// ─── Cardiac Drift ───────────────────────────────────────────────────────────

/** Résultat de l'analyse de dérive cardiaque (cardiac drift / decoupling aérobie). */
export interface CardiacDrift {
  ef1: number;        // Efficiency Factor first half (speed×1000/HR)
  ef2: number;        // Efficiency Factor second half
  decoupling: number; // % — absolute drift
  avgHR1: number;
  avgHR2: number;
  avgPace1: number;   // s/km
  avgPace2: number;
  efOverall: number;
}

/**
 * Calcule la dérive cardiaque (cardiac decoupling) en comparant l'Efficiency Factor
 * de la 1ère et 2ème moitié de la séance.
 * EF = vitesse × 1000 / FC. Dérive < 5% = bonne endurance aérobie ; > 9% = fatigue/sous-entraînement.
 */
export function calcCardiacDrift(activity: GPXActivity): CardiacDrift | null {
  const pts = activity.points.filter(
    (p: GPXTrackPoint) => p.hr !== null && p.speed !== null && p.speed > 0.5 && p.time !== null
  );
  if (pts.length < 40) return null;

  const tStart = pts[0].time!.getTime();
  const tEnd   = pts[pts.length - 1].time!.getTime();
  const tMid   = (tStart + tEnd) / 2;
  const half1  = pts.filter((p: GPXTrackPoint) => p.time!.getTime() <= tMid);
  const half2  = pts.filter((p: GPXTrackPoint) => p.time!.getTime() >  tMid);
  if (half1.length < 15 || half2.length < 15) return null;

  const stats = (pts: GPXTrackPoint[]) => {
    const avgSpd = pts.reduce((s, p) => s + (p.speed ?? 0), 0) / pts.length;
    const avgHR  = pts.reduce((s, p) => s + (p.hr  ?? 0), 0) / pts.length;
    // EF = vitesse (m/s) × 1000 / FC — mesure l'efficacité cardiovasculaire
    return { ef: avgHR > 0 ? avgSpd * 1000 / avgHR : 0, avgSpd, avgHR };
  };

  const r1 = stats(half1);
  const r2 = stats(half2);
  const rAll = stats(pts);

  // Décroissance de l'EF entre 1ère et 2ème moitié (positif = dérive)
  const decoupling = r1.ef > 0 ? ((r1.ef - r2.ef) / r1.ef) * 100 : 0;

  return {
    ef1: Math.round(r1.ef * 100) / 100,
    ef2: Math.round(r2.ef * 100) / 100,
    decoupling: Math.round(decoupling * 10) / 10,
    avgHR1: Math.round(r1.avgHR),
    avgHR2: Math.round(r2.avgHR),
    avgPace1: r1.avgSpd > 0 ? Math.round(1000 / r1.avgSpd) : 0,
    avgPace2: r2.avgSpd > 0 ? Math.round(1000 / r2.avgSpd) : 0,
    efOverall: Math.round(rAll.ef * 100) / 100,
  };
}

// ─── TSB / CTL / ATL — Training Stress Balance ───────────────────────────────

/** Point de données quotidien pour le graphique CTL/ATL/TSB. */
export interface TSBDay {
  date:  string;
  trimp: number;
  atl:   number;
  ctl:   number;
  tsb:   number;
}

/** Résultat du calcul CTL/ATL/TSB avec les 90 derniers jours pour le graphique. */
export interface TSBResult {
  atl:       number;
  ctl:       number;
  tsb:       number;
  chartData: TSBDay[]; // last 90 days
}

/**
 * Calcule CTL (forme), ATL (fatigue) et TSB (fraîcheur) par EMA (moyenne mobile exponentielle) sur l'historique TRIMP.
 * Constantes Banister/Coggan (formule PMC standard TrainingPeaks) : λ = 1/τ, avec τ=7j (ATL) et τ=42j (CTL).
 * TSB(jour) = CTL − ATL calculés à partir de la VEILLE (fraîcheur avant la séance du jour), pas du jour même —
 * sinon le TSB du jour chuterait artificiellement dès qu'on charge la séance qui vient d'être faite.
 */
export function calcTSB(history: { date: string; trimp: number }[]): TSBResult {
  if (history.length === 0) return { atl: 0, ctl: 0, tsb: 0, chartData: [] };

  // Constantes de lissage EMA : λ = 1/τ avec τ=7j (ATL) et τ=42j (CTL)
  const LA = 1 / 7;   // ATL — 7-day decay (fatigue à court terme)
  const LF = 1 / 42;  // CTL — 42-day decay (forme chronique)

  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const trimpMap = new Map<string, number>();
  for (const e of sorted) trimpMap.set(e.date, (trimpMap.get(e.date) ?? 0) + e.trimp);

  const today = new Date().toISOString().slice(0, 10);
  let atl = 0, ctl = 0;
  const all: TSBDay[] = [];

  const d = new Date(sorted[0].date);
  const end = new Date(today);
  while (d <= end) {
    const ds = d.toISOString().slice(0, 10);
    const t = trimpMap.get(ds) ?? 0;
    // TSB du jour = forme/fatigue accumulées jusqu'à la veille, avant d'intégrer la séance du jour
    const tsb = ctl - atl;
    atl = t * LA + (1 - LA) * atl;
    ctl = t * LF + (1 - LF) * ctl;
    all.push({ date: ds, trimp: t, atl: Math.round(atl * 10) / 10, ctl: Math.round(ctl * 10) / 10, tsb: Math.round(tsb * 10) / 10 });
    d.setDate(d.getDate() + 1);
  }

  const last = all[all.length - 1] ?? { atl: 0, ctl: 0, tsb: 0 };
  return { atl: last.atl, ctl: last.ctl, tsb: last.tsb, chartData: all.slice(-90) };
}

// ─── TRIMP — Training Impulse ─────────────────────────────────────────────────

/** Résultat du calcul TRIMP (charge d'entraînement) selon les méthodes Edwards et Banister. */
export interface TRIMPResult {
  edwards: number;       // zone-weighted load
  banister: number;      // Banister formula
  zoneMinutes: number[]; // [Z1..Z5] minutes
  totalMinutes: number;
}

/**
 * Calcule la charge d'entraînement TRIMP selon deux méthodes :
 * - Edwards : somme pondérée par zone (Z1×1, Z2×2, Z3×3, Z4×4, Z5×5).
 * - Banister (1991) : TRIMP = T × ΔFC × k, où k = a × e^(b × ΔFC),
 *   ΔFC = (FC_moy − FC_repos) / (FC_max − FC_repos) (fraction de réserve cardiaque),
 *   Hommes : a=0,64, b=1,92 ; Femmes : a=0,86, b=1,67.
 */
export function calcTRIMP(
  points: GPXTrackPoint[],
  fcMax: number,
  fcRest: number,
  sex: Sex = 'M',
): TRIMPResult | null {
  // Zones Karvonen — cohérentes avec l'affichage HeartRateZones
  const bounds = karvonenBounds(fcMax, fcRest);
  const zoneTime = [0, 0, 0, 0, 0]; // seconds
  let hrSum = 0, totalTime = 0;

  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    if (curr.hr === null || prev.hr === null || !curr.time || !prev.time) continue;
    const dt = (curr.time.getTime() - prev.time.getTime()) / 1000;
    if (dt <= 0 || dt > 60) continue;
    const avgHr = (curr.hr + prev.hr) / 2;
    zoneTime[getZoneKarvonen(avgHr, bounds)] += dt;
    hrSum += avgHr * dt;
    totalTime += dt;
  }

  if (totalTime < 60) return null;

  const WEIGHTS = [1, 2, 3, 4, 5];
  const edwards = zoneTime.reduce((s, t, i) => s + (t / 60) * WEIGHTS[i], 0);

  // Banister : TRIMP = T × ΔFC × k,  k = a×e^(b×ΔFC)
  // Hommes: a=0.64, b=1.92 — Femmes: a=0.86, b=1.67  (Banister 1991)
  const avgHR = hrSum / totalTime;
  // ΔFC = fraction de réserve cardiaque utilisée (0 = repos, 1 = FCmax)
  const dfc = Math.max(0, Math.min(1, (avgHR - fcRest) / (fcMax - fcRest)));
  const a = sex === 'F' ? 0.86 : 0.64;
  const b = sex === 'F' ? 1.67 : 1.92;
  const banister = Math.round((totalTime / 60) * dfc * a * Math.exp(b * dfc));

  return {
    edwards: Math.round(edwards),
    banister,
    zoneMinutes: zoneTime.map(t => Math.round(t / 60)),
    totalMinutes: Math.round(totalTime / 60),
  };
}

// ─── Allure cardiaque ─────────────────────────────────────────────────────────

/**
 * Allure normalisée par l'effort cardiaque (HRR%).
 * Formule : allure_cardiaque = allure_réelle × (HRR_ref / HRR_actuel)
 * HRR_ref = 65% (seuil aérobie Z2/Z3 de référence).
 * Interprétation : si HRR > 65%, on travaille plus que la référence
 * → allure cardiaque plus rapide (on "vaut mieux" que ce que la vitesse brute montre).
 */
const CARDIAC_REF_HRR = 0.65;

/** Résultat du calcul d'allure cardiaque (vitesse normalisée par % HRR). */
export interface CardiacPaceResult {
  avgCardiacPace: number | null; // s/km — moyenne pondérée sur la séance
}

/**
 * Calcule l'allure cardiaque moyenne : allure brute corrigée par le ratio HRR_ref / HRR_actuel.
 * Filtre les points hors de la plage HRR 20–99% (repos ou effort maximal).
 */
export function calcCardiacPace(
  points: GPXTrackPoint[],
  fcMax: number,
  fcRest: number,
): CardiacPaceResult {
  const reserve = fcMax - fcRest;
  if (reserve <= 0) return { avgCardiacPace: null };

  const paces: number[] = [];
  for (const p of points) {
    if (!p.hr || !p.speed || p.speed < 0.5) continue;
    const hrr = (p.hr - fcRest) / reserve;
    if (hrr < 0.2 || hrr > 0.99) continue;
    paces.push((1000 / p.speed) * (CARDIAC_REF_HRR / hrr));
  }
  if (paces.length < 10) return { avgCardiacPace: null };
  return { avgCardiacPace: paces.reduce((a, b) => a + b, 0) / paces.length };
}

// ─── Normalized Power ─────────────────────────────────────────────────────────

/**
 * Calcule la Puissance Normalisée (NP) selon la méthode Coggan :
 * 1) Moyenne mobile 30 s sur la puissance brute.
 * 2) Élevé à la puissance 4, puis moyenne, puis racine 4ème.
 * NP > puissance moyenne = la variabilité de l'effort est prise en compte.
 */
export function calcNormalizedPower(points: GPXTrackPoint[]): number | null {
  const pwrPts = points.filter(p => p.power !== null && p.time !== null);
  if (pwrPts.length < 60) return null;

  const WINDOW_MS = 30_000; // fenêtre 30 s (Coggan)
  const avg30s: number[] = [];

  for (let i = 0; i < pwrPts.length; i++) {
    const t = pwrPts[i].time!.getTime();
    let sum = 0, count = 0;
    for (let j = i; j >= 0; j--) {
      if (t - pwrPts[j].time!.getTime() > WINDOW_MS) break;
      sum += pwrPts[j].power!;
      count++;
    }
    if (count > 0) avg30s.push(sum / count);
  }

  if (avg30s.length === 0) return null;
  // NP = (moyenne des puissances^4)^(1/4) — donne plus de poids aux efforts intenses
  const sum4 = avg30s.reduce((s, v) => s + v ** 4, 0);
  return Math.round((sum4 / avg30s.length) ** 0.25);
}

// ─── VO2max estimation ────────────────────────────────────────────────────────

/** Estimation du VO2max depuis une séance courante, avec niveau de confiance et paramètres du segment utilisé. */
export interface VO2maxEstimate {
  value: number;          // mL/kg/min
  confidence: 'high' | 'medium' | 'low';
  hrrPct: number;         // avg HRR% used
  speedKmh: number;       // actual flat speed of the segment used
  windowMin: number;      // duration of the stable segment used (minutes)
}

/**
 * Estime le VO2max à partir du segment le plus stable de la séance (CV HR et vitesse minimaux sur terrain plat).
 * Formule Swain & Leutholtz (1997) : VO2max = VO2net / HRR% + 3,5 mL/kg/min (VO2 de repos).
 * VO2net = coût ACSM course à plat : 0,2 × vitesse (m/min).
 * Plage HRR valide : 55%–97% (en dehors, l'extrapolation linéaire est trop imprécise).
 * Segments avec pente moyenne > 5% exclus (biais GAP et FC sur descentes/montées).
 */
export function estimateVO2max(
  activity: GPXActivity,
  fcMax: number,
  fcRest: number,
): VO2maxEstimate | null {
  if (activity.activityType === 'cycling') return null;

  const pts = activity.points.filter(
    (p: GPXTrackPoint) => p.hr !== null && p.speed !== null && p.speed > 1.5 && p.time !== null
  );
  if (pts.length < 60) return null;

  // Sommes préfixées pour calcul O(1) de moyenne/variance et pente absolue moyenne
  const m = pts.length;
  const prefHR        = new Float64Array(m + 1);
  const prefHR2       = new Float64Array(m + 1);
  const prefSpd       = new Float64Array(m + 1);
  const prefSpd2      = new Float64Array(m + 1);
  const prefAbsGrade  = new Float64Array(m + 1);
  for (let k = 0; k < m; k++) {
    prefHR[k + 1]       = prefHR[k]       + pts[k].hr!;
    prefHR2[k + 1]      = prefHR2[k]      + pts[k].hr! ** 2;
    prefSpd[k + 1]      = prefSpd[k]      + pts[k].speed!;
    prefSpd2[k + 1]     = prefSpd2[k]     + pts[k].speed! ** 2;
    prefAbsGrade[k + 1] = prefAbsGrade[k] + Math.abs(pts[k].grade ?? 0);
  }

  const winStats = (i: number, j: number) => {
    const n = j - i + 1;
    const mHR  = (prefHR[j + 1]  - prefHR[i])  / n;
    const mSpd = (prefSpd[j + 1] - prefSpd[i]) / n;
    const varHR  = (prefHR2[j + 1]  - prefHR2[i])  / n - mHR  ** 2;
    const varSpd = (prefSpd2[j + 1] - prefSpd2[i]) / n - mSpd ** 2;
    const avgAbsGrade = (prefAbsGrade[j + 1] - prefAbsGrade[i]) / n;
    return {
      mHR, mSpd, avgAbsGrade,
      cvHR:  Math.sqrt(Math.max(0, varHR))  / mHR,   // coefficient de variation FC
      cvSpd: Math.sqrt(Math.max(0, varSpd)) / mSpd,  // coefficient de variation vitesse
    };
  };

  // Two-pointer : cherche la fenêtre la plus stable (CV HR + CV vitesse minimaux) d'au moins minMs.
  // Score = 2×CV(HR) + CV(vitesse). Fenêtres avec pente moy > 5% exclues :
  // descentes gonflent la vitesse via GAP, montées gonflent la FC → formule ACSM non valide.
  const findBestWindow = (minMs: number) => {
    let j = 0;
    let bestScore = Infinity, bestI = -1, bestJ = -1;
    for (let i = 0; i < m; i++) {
      while (j < m - 1 && pts[j].time!.getTime() - pts[i].time!.getTime() < minMs) j++;
      if (pts[j].time!.getTime() - pts[i].time!.getTime() < minMs) continue;
      if (j - i < 20) continue;
      const { cvHR, cvSpd, avgAbsGrade } = winStats(i, j);
      if (avgAbsGrade > 5) continue;
      const score = 2 * cvHR + cvSpd;
      if (score < bestScore) { bestScore = score; bestI = i; bestJ = j; }
    }
    return bestI >= 0 ? { i: bestI, j: bestJ } : null;
  };

  const win10 = findBestWindow(10 * 60_000);
  if (!win10) return null;

  const { i: bestI, j: bestJ } = win10;
  const { mHR: avgHR, mSpd: avgSpd, cvHR, cvSpd } = winStats(bestI, bestJ);

  const hrrPct = (avgHR - fcRest) / (fcMax - fcRest);
  // En dessous de 55% HRR, l'erreur d'extrapolation linéaire explose (×1,8) ;
  // au-dessus de 97%, l'athlète est quasi à FCmax → formule non valide.
  if (hrrPct < 0.55 || hrrPct > 0.97) return null;

  // Swain & Leutholtz (1997) : VO2 repos = 3,5 mL/kg/min (constante),
  // seul le VO2 net (exercice) est proportionnel au %HRR.
  // VO2net = 0,2 × vitesse (m/min) — formule ACSM course à plat
  const vo2net = 0.2 * (avgSpd * 60);
  const vo2max = vo2net / hrrPct + 3.5;

  const windowMin = Math.round((pts[bestJ].time!.getTime() - pts[bestI].time!.getTime()) / 60_000);

  const win20exists = cvHR < 0.05 ? findBestWindow(20 * 60_000) !== null : false;

  // Confiance élevée : fenêtre ≥20 min, CV(HR) < 5%, CV(vitesse) < 10%, HRR 60–87%
  const confidence: 'high' | 'medium' | 'low' =
    win20exists && cvHR < 0.05 && cvSpd < 0.10 && hrrPct >= 0.60 && hrrPct <= 0.87 ? 'high' :
    cvHR < 0.12 ? 'medium' : 'low';

  return {
    value:    Math.round(vo2max * 10) / 10,
    confidence,
    hrrPct:   Math.round(hrrPct * 100),
    speedKmh: Math.round(avgSpd * 3.6 * 10) / 10,
    windowMin,
  };
}
