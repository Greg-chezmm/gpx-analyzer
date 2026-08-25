import { useState, useCallback, useRef } from 'react';
import type { GPXActivity } from '../utils/gpxCore';
import type { ActivityIndexEntry } from '../utils/driveStorage';
import type { StoredSegment } from '../utils/firestoreStorage';
import {
  fingerprintOverlap, matchStoredSegment, parseActivityRawToPoints, type SegmentAttempt,
} from '../utils/segments';
import type { SegmentScanStatus } from './useRecurringSegments';

const MAX_CANDIDATES = 20;
const MIN_FINGERPRINT_OVERLAP = 0.15;

export interface StoredSegmentScanHandle {
  status: SegmentScanStatus;
  progress: { done: number; total: number } | null;
  attempts: SegmentAttempt[];
  skippedCount: number;
  scan: () => Promise<void>;
}

/**
 * Compare un segment défini manuellement (géométrie de référence fixe) à l'historique — même
 * pré-filtrage par empreinte + plafond de candidats que la détection automatique (voir
 * useRecurringSegments.ts), mais matching à sens unique (pas de découverte/regroupement).
 * L'activité actuellement ouverte est comparée sans téléchargement (déjà en mémoire).
 */
export function useStoredSegmentScan(
  segment: StoredSegment,
  activity: GPXActivity | null,
  history: ActivityIndexEntry[],
  loadFile: (entry: ActivityIndexEntry) => Promise<ArrayBuffer | string>,
): StoredSegmentScanHandle {
  const [status, setStatus] = useState<SegmentScanStatus>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [attempts, setAttempts] = useState<SegmentAttempt[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const runId = useRef(0);

  const scan = useCallback(async () => {
    const myRunId = ++runId.current;
    setStatus('scanning');
    setAttempts([]);
    setSkippedCount(0);
    setProgress(null);

    const scored = history.map(entry => ({
      entry,
      score: entry.fingerprint ? fingerprintOverlap(segment.fingerprint, entry.fingerprint) : -1,
    }));
    const known = scored.filter(s => s.score >= MIN_FINGERPRINT_OVERLAP).sort((a, b) => b.score - a.score);
    const unknown = scored.filter(s => s.score === -1);
    const candidates = [...known, ...unknown].slice(0, MAX_CANDIDATES);
    setSkippedCount(Math.max(0, known.length + unknown.length - candidates.length));

    const found: SegmentAttempt[] = [];

    if (activity) {
      const currentDate = activity.startTime ? activity.startTime.toISOString().slice(0, 10) : '';
      const m = matchStoredSegment(segment.points, segment.distance, { points: activity.points, date: currentDate }, true);
      if (m) found.push(m);
    }

    setProgress({ done: 0, total: candidates.length });
    let done = 0;
    for (const c of candidates) {
      try {
        const raw = await loadFile(c.entry);
        const points = await parseActivityRawToPoints(raw, c.entry.fileName);
        const m = matchStoredSegment(segment.points, segment.distance, { points, date: c.entry.date });
        if (m) found.push(m);
      } catch {
        // Fichier illisible/supprimé côté cloud — ignoré silencieusement.
      }
      done++;
      if (myRunId === runId.current) setProgress({ done, total: candidates.length });
    }

    if (myRunId !== runId.current) return;
    found.sort((a, b) => a.duration - b.duration);
    setAttempts(found);
    setStatus('done');
  }, [segment, activity, history, loadFile]);

  return { status, progress, attempts, skippedCount, scan };
}
