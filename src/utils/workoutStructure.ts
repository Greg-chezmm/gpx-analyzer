import type { GPXInterval } from './intervals';

export interface WorkoutSegment {
  type: 'effort' | 'recovery';
  targetDistance: number; // mètres
}

export interface WorkoutMatchSummary {
  type: 'effort' | 'recovery';
  target: number;      // mètres
  matched: number;      // mètres réellement regroupés
  lapCount: number;     // nombre de laps bruts fusionnés
  firstNumber: number;  // numéro du lap résultant (celui à surveiller/corriger si besoin)
}

export interface WorkoutMatchResult {
  overrides: Record<number, 'effort' | 'recovery'>;
  mergedAfter: number[];
  summary: WorkoutMatchSummary[];
  /** false si la séance contient moins de laps que de segments demandés (reste de la structure ignoré). */
  fullyMatched: boolean;
}

/**
 * Parse une structure d'entraînement en texte libre, ex. "800m 1000m 1200m 1000m 800m r200m".
 * Chaque token est soit un effort (nombre + unité optionnelle m/km), soit une récupération
 * préfixée par "r"/"R". Raccourci : si un seul token de récup est donné pour N efforts (N>1),
 * il est automatiquement répété entre chaque répétition (N-1 fois) — sinon la séquence est
 * utilisée telle quelle, dans l'ordre tapé (permet des récups variables par position).
 */
export function parseWorkoutStructure(text: string): WorkoutSegment[] {
  const tokens = text.trim().split(/[\s,;]+/).filter(Boolean);
  const parsed: WorkoutSegment[] = [];

  for (const token of tokens) {
    const m = /^([rR])?\s*(\d+(?:[.,]\d+)?)\s*(km|m)?$/.exec(token);
    if (!m) continue;
    const isRecovery = !!m[1];
    let value = parseFloat(m[2].replace(',', '.'));
    if (m[3] === 'km') value *= 1000;
    if (!(value > 0)) continue;
    parsed.push({ type: isRecovery ? 'recovery' : 'effort', targetDistance: value });
  }

  const efforts = parsed.filter(p => p.type === 'effort');
  const recoveries = parsed.filter(p => p.type === 'recovery');

  // Un seul token de récup donné pour plusieurs efforts → c'est le raccourci "récup par défaut",
  // on l'insère entre chaque répétition. Dès que l'utilisateur tape plusieurs tokens de récup
  // (même si le compte ne colle pas exactement), on respecte la séquence telle que tapée — ça
  // permet par ex. un échauffement en tête sans récup juste après lui.
  if (recoveries.length === 1 && efforts.length > 2) {
    const expanded: WorkoutSegment[] = [];
    efforts.forEach((e, i) => {
      expanded.push(e);
      if (i < efforts.length - 1) expanded.push(recoveries[0]);
    });
    return expanded;
  }

  return parsed;
}

/**
 * Associe une structure cible à la séquence de laps bruts (chronologique), en fusionnant
 * les laps consécutifs nécessaires pour s'approcher au mieux de chaque distance cible.
 * La distance GPS d'un lap peut sous-estimer la vraie distance (virages de piste coupés par
 * le lissage GPS) — on cherche donc le nombre de laps consécutifs minimisant l'écart absolu
 * à la cible, sans exiger de la dépasser.
 */
export function matchWorkoutStructure(rawLaps: GPXInterval[], segments: WorkoutSegment[]): WorkoutMatchResult | null {
  if (rawLaps.length === 0 || segments.length === 0) return null;

  const overrides: Record<number, 'effort' | 'recovery'> = {};
  const mergedAfter: number[] = [];
  const summary: WorkoutMatchSummary[] = [];
  let pointer = 0;

  for (const seg of segments) {
    if (pointer >= rawLaps.length) break;

    // Pas de limite fixe sur le nombre de laps fusionnables (un échauffement peut regrouper
    // une dizaine de petits laps) — on arrête d'étendre dès que la somme dépasse largement
    // la cible, puisqu'au-delà l'écart ne peut plus que grandir.
    const maxWindow = rawLaps.length - pointer;
    let bestK = 1, bestDiff = Infinity, cum = 0;
    for (let k = 1; k <= maxWindow; k++) {
      cum += rawLaps[pointer + k - 1].distance;
      const diff = Math.abs(cum - seg.targetDistance);
      if (diff < bestDiff) { bestDiff = diff; bestK = k; }
      if (k > 1 && cum > seg.targetDistance * 1.4) break;
    }

    const group = rawLaps.slice(pointer, pointer + bestK);
    const firstNumber = group[0].number;
    overrides[firstNumber] = seg.type;
    for (let i = 0; i < group.length - 1; i++) mergedAfter.push(group[i].number);

    summary.push({
      type: seg.type,
      target: seg.targetDistance,
      matched: group.reduce((a, g) => a + g.distance, 0),
      lapCount: group.length,
      firstNumber,
    });

    pointer += bestK;
  }

  return { overrides, mergedAfter, summary, fullyMatched: summary.length === segments.length };
}
