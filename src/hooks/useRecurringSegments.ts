import { useState, useCallback, useRef } from 'react';
import type { GPXActivity } from '../utils/gpxCore';
import type { ActivityIndexEntry } from '../utils/driveStorage';
import {
  computeFingerprint, fingerprintOverlap, detectRecurringSegments, parseActivityRawToPoints,
  type RecurringSegment, type SegmentSource,
} from '../utils/segments';

const MAX_CANDIDATES = 20;
const MIN_FINGERPRINT_OVERLAP = 0.15;

export type SegmentScanStatus = 'idle' | 'scanning' | 'done';

export interface RecurringSegmentsHandle {
  status: SegmentScanStatus;
  progress: { done: number; total: number } | null;
  segments: RecurringSegment[];
  /** Activités de l'historique non comparées (plafond MAX_CANDIDATES) — affiché pour transparence, pas de troncature silencieuse. */
  skippedCount: number;
  scan: () => Promise<void>;
}

/**
 * Détecte les segments récurrents entre l'activité courante et l'historique cloud.
 * Deux étapes : pré-filtrage bon marché via empreinte geohash (évite de télécharger/parser
 * tout l'historique), puis matching géométrique précis sur les meilleurs candidats seulement
 * (voir utils/segments.ts). Déclenché explicitement (bouton) — coûte du réseau et du CPU.
 */
export function useRecurringSegments(
  activity: GPXActivity | null,
  history: ActivityIndexEntry[],
  loadFile: (entry: ActivityIndexEntry) => Promise<ArrayBuffer | string>,
): RecurringSegmentsHandle {
  const [status, setStatus] = useState<SegmentScanStatus>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [segments, setSegments] = useState<RecurringSegment[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  // Ignore les résultats d'un scan précédent si une nouvelle recherche démarre entretemps.
  const runId = useRef(0);

  const scan = useCallback(async () => {
    if (!activity) return;
    const myRunId = ++runId.current;
    setStatus('scanning');
    setSegments([]);
    setSkippedCount(0);
    setProgress(null);

    const currentDate = activity.startTime ? activity.startTime.toISOString().slice(0, 10) : '';
    const currentFingerprint = computeFingerprint(activity.points);

    // Exclut l'activité courante elle-même si déjà présente dans l'historique. Le nom seul n'est
    // pas fiable (renommage, entrée dupliquée lors d'une migration Drive→Firestore...) — on
    // compare plutôt distance et durée totales (±3%), bien plus robuste pour repérer "c'est la
    // même sortie physique" qu'un texte libre.
    const closeEnough = (a: number, b: number) => a > 0 && Math.abs(a - b) / a < 0.03;
    const pool = history.filter(e => !(
      e.date === currentDate &&
      closeEnough(activity.totalDistance, e.distance) &&
      closeEnough(activity.movingTime, e.duration)
    ));

    const scored = pool.map(entry => ({
      entry,
      // -1 = empreinte inconnue (activité sauvegardée avant l'ajout de cette fonctionnalité) — pas exclue, priorité basse.
      score: entry.fingerprint ? fingerprintOverlap(currentFingerprint, entry.fingerprint) : -1,
    }));

    const known = scored.filter(s => s.score >= MIN_FINGERPRINT_OVERLAP).sort((a, b) => b.score - a.score);
    const unknown = scored.filter(s => s.score === -1);
    const candidates = [...known, ...unknown].slice(0, MAX_CANDIDATES);
    setSkippedCount(Math.max(0, known.length + unknown.length - candidates.length));

    if (candidates.length === 0) {
      setStatus('done');
      return;
    }

    setProgress({ done: 0, total: candidates.length });
    const parsed: SegmentSource[] = [];
    let done = 0;

    for (const c of candidates) {
      try {
        const raw = await loadFile(c.entry);
        const points = await parseActivityRawToPoints(raw, c.entry.fileName);
        parsed.push({ points, date: c.entry.date });
      } catch {
        // Fichier illisible/supprimé côté cloud — ignoré silencieusement, n'interrompt pas le scan.
      }
      done++;
      if (myRunId === runId.current) setProgress({ done, total: candidates.length });
    }

    if (myRunId !== runId.current) return; // une recherche plus récente a pris le relais

    const result = detectRecurringSegments({ points: activity.points, date: currentDate }, parsed);
    setSegments(result);
    setStatus('done');
  }, [activity, history, loadFile]);

  return { status, progress, segments, skippedCount, scan };
}
