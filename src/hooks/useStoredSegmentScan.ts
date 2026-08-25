import { useState, useCallback, useRef } from 'react';
import type { GPXActivity } from '../utils/gpxCore';
import type { ActivityIndexEntry } from '../utils/driveStorage';
import type { StoredSegment } from '../utils/firestoreStorage';
import {
  fingerprintOverlap, matchStoredSegment, parseActivityRawToPoints, toCachedAttempt,
  type CachedSegmentAttempt,
} from '../utils/segments';
import type { SegmentScanStatus } from './useRecurringSegments';

const MAX_CANDIDATES = 20;
const MIN_FINGERPRINT_OVERLAP = 0.15;
/** Taille du classement mis en cache — voir StoredSegment.attempts. */
const TOP_N = 10;

export interface StoredSegmentScanHandle {
  status: SegmentScanStatus;
  progress: { done: number; total: number } | null;
  attempts: CachedSegmentAttempt[];
  skippedCount: number;
  /** Scan complet de l'historique (coûteux — téléchargement + parsing des candidats). */
  scan: () => Promise<void>;
}

/**
 * Compare un segment défini manuellement (géométrie de référence fixe) à l'historique — même
 * pré-filtrage par empreinte + plafond de candidats que la détection automatique (voir
 * useRecurringSegments.ts), mais matching à sens unique (pas de découverte/regroupement).
 * L'activité actuellement ouverte est comparée sans téléchargement (déjà en mémoire).
 * Le résultat (top 10) est remonté via onScanComplete pour être persisté par l'appelant
 * (voir useStoredSegments.updateAttempts) — ce hook ne connaît pas Firestore directement.
 */
export function useStoredSegmentScan(
  segment: StoredSegment,
  activity: GPXActivity | null,
  history: ActivityIndexEntry[],
  loadFile: (entry: ActivityIndexEntry) => Promise<ArrayBuffer | string>,
  onScanComplete?: (attempts: CachedSegmentAttempt[]) => void,
): StoredSegmentScanHandle {
  const [status, setStatus] = useState<SegmentScanStatus>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [attempts, setAttempts] = useState<CachedSegmentAttempt[]>(segment.attempts ?? []);
  const [skippedCount, setSkippedCount] = useState(0);
  const runId = useRef(0);

  const scan = useCallback(async () => {
    const myRunId = ++runId.current;
    setStatus('scanning');
    setSkippedCount(0);
    setProgress(null);

    const currentDate = activity?.startTime ? activity.startTime.toISOString().slice(0, 10) : '';

    // Exclut l'activité courante de l'historique comparé — sinon, si elle y est déjà sauvegardée,
    // elle est comptée deux fois (une fois en mémoire ci-dessous, une fois via les candidats).
    // Le nom seul n'est pas fiable (renommage, doublon de migration...), on compare plutôt
    // distance et durée totales (±3%).
    const closeEnough = (a: number, b: number) => a > 0 && Math.abs(a - b) / a < 0.03;
    const pool = activity
      ? history.filter(e => !(
          e.date === currentDate &&
          closeEnough(activity.totalDistance, e.distance) &&
          closeEnough(activity.movingTime, e.duration)
        ))
      : history;

    const scored = pool.map(entry => ({
      entry,
      score: entry.fingerprint ? fingerprintOverlap(segment.fingerprint, entry.fingerprint) : -1,
    }));
    const known = scored.filter(s => s.score >= MIN_FINGERPRINT_OVERLAP).sort((a, b) => b.score - a.score);
    const unknown = scored.filter(s => s.score === -1);
    const candidates = [...known, ...unknown].slice(0, MAX_CANDIDATES);
    setSkippedCount(Math.max(0, known.length + unknown.length - candidates.length));

    const found: CachedSegmentAttempt[] = [];

    if (activity) {
      const m = matchStoredSegment(segment.points, segment.distance, { points: activity.points, date: currentDate }, true);
      if (m) found.push(toCachedAttempt(m));
    }

    setProgress({ done: 0, total: candidates.length });
    let done = 0;
    for (const c of candidates) {
      try {
        const raw = await loadFile(c.entry);
        const points = await parseActivityRawToPoints(raw, c.entry.fileName);
        const m = matchStoredSegment(segment.points, segment.distance, { points, date: c.entry.date });
        if (m) found.push(toCachedAttempt(m));
      } catch {
        // Fichier illisible/supprimé côté cloud — ignoré silencieusement.
      }
      done++;
      if (myRunId === runId.current) setProgress({ done, total: candidates.length });
    }

    if (myRunId !== runId.current) return;
    const top = found.sort((a, b) => a.duration - b.duration).slice(0, TOP_N);
    setAttempts(top);
    setStatus('done');
    onScanComplete?.(top);
  }, [segment, activity, history, loadFile, onScanComplete]);

  return { status, progress, attempts, skippedCount, scan };
}
