// ─── Répartition polarisée de la charge — modèle 3 zones de Seiler (80/10/10 ou 80/20) ────────
//
// Regroupe les 5 zones Karvonen déjà calculées (Z1..Z5, voir HeartRateZones/calcTRIMP) en 3 blocs :
// Facile (Z1+Z2, sous le seuil aérobie), Modéré (Z3+Z4, seuil), Intense (Z5, au-dessus du seuil).
// Une distribution "polarisée" (référence recherche : ~80% facile / ≤20% modéré+intense, très peu de
// zone modérée) contraste avec une distribution "pyramidale" (plus de volume en zone modérée/seuil).

export interface WeekBucket {
  weekStart: string; // lundi de la semaine, YYYY-MM-DD
  lowMin: number;
  modMin: number;
  highMin: number;
}

export type PolarizationClass = 'polarise' | 'pyramidal' | 'mixte' | 'insuffisant';

export interface PolarizationResult {
  lowMin: number; modMin: number; highMin: number; totalMin: number;
  lowPct: number; modPct: number; highPct: number;
  weeks: WeekBucket[];
  sessionCount: number;
  classification: PolarizationClass;
}

const MIN_SESSIONS = 8;

/** Retourne le lundi (YYYY-MM-DD) de la semaine contenant cette date. */
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=dimanche..6=samedi
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Agrège la répartition Facile/Modéré/Intense sur l'historique (fenêtre en jours, ou tout si omis).
 * N'utilise que les activités avec `zoneMinutes` déjà calculé à la sauvegarde (voir App.tsx) —
 * les activités antérieures à cette fonctionnalité n'y contribuent pas jusqu'à recalcul.
 */
export function aggregateZoneDistribution(
  history: { date: string; zoneMinutes?: number[] }[],
  windowDays?: number,
): PolarizationResult | null {
  let cutoff: string | null = null;
  if (windowDays) {
    const d = new Date();
    d.setDate(d.getDate() - windowDays);
    cutoff = d.toISOString().slice(0, 10);
  }

  const entries = history.filter(e => e.zoneMinutes?.length === 5 && (!cutoff || e.date >= cutoff));
  if (entries.length === 0) return null;

  const weekMap = new Map<string, WeekBucket>();
  let lowMin = 0, modMin = 0, highMin = 0;
  for (const e of entries) {
    const [z1, z2, z3, z4, z5] = e.zoneMinutes!;
    const low = z1 + z2, mod = z3 + z4, high = z5;
    lowMin += low; modMin += mod; highMin += high;

    const wk = mondayOf(e.date);
    const bucket = weekMap.get(wk) ?? { weekStart: wk, lowMin: 0, modMin: 0, highMin: 0 };
    bucket.lowMin += low; bucket.modMin += mod; bucket.highMin += high;
    weekMap.set(wk, bucket);
  }

  const totalMin = lowMin + modMin + highMin;
  if (totalMin === 0) return null;
  const lowPct = (lowMin / totalMin) * 100, modPct = (modMin / totalMin) * 100, highPct = (highMin / totalMin) * 100;

  let classification: PolarizationClass;
  if (entries.length < MIN_SESSIONS) classification = 'insuffisant';
  else if (lowPct >= 75 && modPct <= 15) classification = 'polarise';
  else if (modPct >= 25) classification = 'pyramidal';
  else classification = 'mixte';

  const weeks = [...weekMap.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  return { lowMin, modMin, highMin, totalMin, lowPct, modPct, highPct, weeks, sessionCount: entries.length, classification };
}
