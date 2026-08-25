import { calcTSB } from './trainingMetrics';

// ─── Objectif course — cible TSB calibrée sur les anciennes courses ────────────

/** Catégorie de course : combine discipline et tranche de distance (taper et cible TSB différents). */
export type RaceCategory = 'run-short' | 'run-medium' | 'run-marathon' | 'run-ultra' | 'bike-standard' | 'bike-long';

interface CategoryDef {
  maxKm: number;
  category: RaceCategory;
  label: string;
  taperDays: number;
  defaultTarget: [number, number];
}

// Seuils et cibles TSB par défaut — sources : littérature taper (marathon 19-22j, 15-30K 11-14j,
// 5-10K 7-10j) et guides TSB cyclisme/course (TSB +5 à +25 vélo, +10 à +25 course, plus bas pour l'ultra
// où la durabilité prime sur la fraîcheur de pointe).
const RUN_CATEGORIES: CategoryDef[] = [
  { maxKm: 12,       category: 'run-short',    label: 'Course courte (5–10K)',   taperDays: 8,  defaultTarget: [15, 25] },
  { maxKm: 32,       category: 'run-medium',   label: 'Course moyenne (15–30K)', taperDays: 12, defaultTarget: [10, 20] },
  { maxKm: 50,       category: 'run-marathon', label: 'Marathon',                taperDays: 20, defaultTarget: [10, 20] },
  { maxKm: Infinity, category: 'run-ultra',    label: 'Ultra',                   taperDays: 12, defaultTarget: [0, 15] },
];

const BIKE_CATEGORIES: CategoryDef[] = [
  { maxKm: 100,      category: 'bike-standard', label: 'Sortie / course vélo',     taperDays: 12, defaultTarget: [5, 25] },
  { maxKm: Infinity, category: 'bike-long',      label: 'Cyclosportive longue',    taperDays: 12, defaultTarget: [0, 15] },
];

/** Détermine la catégorie de course (discipline + tranche de distance) et ses paramètres taper/TSB par défaut. */
export function classifyRace(activityType: string, distanceMeters: number): CategoryDef {
  const km = distanceMeters / 1000;
  const table = activityType === 'cycling' ? BIKE_CATEGORIES : RUN_CATEGORIES;
  return table.find(c => km <= c.maxKm) ?? table[table.length - 1];
}

/** Séance passée marquée comme course, utilisée pour la calibration. */
export interface PastRaceEntry {
  date: string;
  name: string;
  distance: number;      // mètres
  activityType: string;
  trimp?: number;
}

/** TSB reconstitué à la date d'une course passée. */
export interface PastRaceTsb {
  date: string;
  name: string;
  distance: number;
  tsb: number;
}

/**
 * Recalcule le TSB au jour de chaque course passée marquée `isRace` correspondant à la même
 * discipline + catégorie de distance que l'objectif visé (rejoue calcTSB avec asOfDate = date de la course).
 */
export function findPastRaceTsb(
  allEntries: PastRaceEntry[],
  races: PastRaceEntry[],
  activityType: string,
  category: RaceCategory,
): PastRaceTsb[] {
  const trimpSeries = allEntries.map(e => ({ date: e.date, trimp: e.trimp ?? 0 }));
  return races
    .filter(r => r.activityType === activityType && classifyRace(activityType, r.distance).category === category)
    .map(r => ({
      date: r.date,
      name: r.name,
      distance: r.distance,
      tsb: calcTSB(trimpSeries, r.date).tsb,
    }));
}

/** Cible TSB retenue pour l'objectif — personnalisée si des courses passées comparables existent, sinon générique. */
export interface TsbTarget {
  min: number;
  max: number;
  source: 'personalized' | 'default';
  sampleCount: number;
}

/** Construit la cible TSB : moyenne ± marge des courses passées comparables, ou fourchette générique par défaut. */
export function computeTsbTarget(pastRaces: PastRaceTsb[], defaultTarget: [number, number]): TsbTarget {
  if (pastRaces.length === 0) {
    return { min: defaultTarget[0], max: defaultTarget[1], source: 'default', sampleCount: 0 };
  }
  const values = pastRaces.map(r => r.tsb);
  // Marge plus large avec un seul point de référence (variance individuelle documentée jusqu'à ±15 pts)
  const margin = pastRaces.length === 1 ? 5 : 3;
  return {
    min: Math.round(Math.min(...values) - margin),
    max: Math.round(Math.max(...values) + margin),
    source: 'personalized',
    sampleCount: pastRaces.length,
  };
}

/** Résultat de la projection TSB jusqu'au jour de l'objectif. */
export interface TsbProjection {
  chartData: { date: string; ctl: number; atl: number; tsb: number }[];
  tsbAtRace: number | null;
  daysRemaining: number;
}

/**
 * Projette le TSB jusqu'au jour de la course en simulant un taper standard : charge maintenue à la
 * moyenne des 7 derniers jours jusqu'au début de la fenêtre de taper, puis décroissance linéaire vers
 * ~35% de cette charge (réduction de volume ~65%, cohérent avec les tapers vélo/course usuels).
 */
export function projectTsb(
  history: { date: string; trimp: number }[],
  raceDate: string,
  taperDays: number,
  tailFraction = 0.35,
): TsbProjection {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const race = new Date(raceDate + 'T00:00:00');
  const daysRemaining = Math.round((race.getTime() - today.getTime()) / 86400000);

  if (daysRemaining <= 0 || history.length === 0) {
    const asOf = daysRemaining <= 0 ? raceDate : undefined;
    const result = calcTSB(history, asOf);
    return { chartData: result.chartData, tsbAtRace: history.length > 0 ? result.tsb : null, daysRemaining };
  }

  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const last7 = sorted.slice(-7);
  const recentAvg = last7.reduce((s, e) => s + e.trimp, 0) / 7;

  const future: { date: string; trimp: number }[] = [];
  for (let i = 1; i <= daysRemaining; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const daysBeforeRace = daysRemaining - i; // 0 le jour de la course
    const trimp = daysBeforeRace >= taperDays
      ? recentAvg
      : recentAvg * (tailFraction + (1 - tailFraction) * (daysBeforeRace / taperDays));
    future.push({ date: d.toISOString().slice(0, 10), trimp: Math.round(trimp) });
  }

  const result = calcTSB([...history, ...future], raceDate);
  return { chartData: result.chartData, tsbAtRace: result.tsb, daysRemaining };
}
