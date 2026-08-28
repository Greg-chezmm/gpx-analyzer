import { useState, useCallback, useRef } from 'react';
import type { GPXActivity } from '../utils/gpxCore';
import type { ActivityIndexEntry } from '../utils/driveStorage';
import type { StoredSegment } from '../utils/firestoreStorage';
import {
  fingerprintOverlap, matchStoredSegmentAll, parseActivityRawToPoints, toCachedAttempt,
  type CachedSegmentAttempt,
} from '../utils/segments';

/** Taille du classement mis en cache — voir StoredSegment.attempts. */
const TOP_N = 10;

export type SegmentScanStatus = 'idle' | 'scanning' | 'done';

export interface StoredSegmentScanHandle {
  status: SegmentScanStatus;
  progress: { done: number; total: number } | null;
  attempts: CachedSegmentAttempt[];
  /** Scan complet de l'historique (coûteux — téléchargement + parsing des candidats). */
  scan: () => Promise<void>;
}

/**
 * Compare un segment défini manuellement (géométrie de référence fixe) à l'historique — matching
 * à sens unique (référence → candidates). Une même activité peut produire PLUSIEURS passages
 * (`matchStoredSegmentAll`) — utile pour un fractionné en côte (plusieurs montées du même segment
 * dans la même séance), chacune apparaît comme une ligne distincte du classement. L'activité
 * actuellement ouverte est comparée sans téléchargement (déjà en mémoire). Le résultat (top 10) est
 * remonté via onScanComplete pour être persisté par l'appelant (voir useStoredSegments.updateAttempts)
 * — ce hook ne connaît pas Firestore directement.
 */
export function useStoredSegmentScan(
  segment: StoredSegment,
  activity: GPXActivity | null,
  history: ActivityIndexEntry[],
  loadFile: (entry: ActivityIndexEntry) => Promise<ArrayBuffer | string>,
  onScanComplete?: (attempts: CachedSegmentAttempt[]) => void,
  /** FCmax/FCrepos ACTUELS du profil — utilisées seulement pour les passages de l'activité en cours
   * (pas encore sauvegardée) ; les candidats historiques utilisent leur propre FCmax/FCrepos figées
   * (`entry.fcMax`/`entry.fcRest`), voir `CachedSegmentAttempt.fcMax`. */
  fcMax?: number,
  fcRest?: number,
  /** Nom du fichier brut actuellement chargé (`fileName` dans App.tsx) — signal d'identité fiable pour
   * exclure l'activité courante des candidats comparés, voir plus bas. */
  currentFileName?: string,
): StoredSegmentScanHandle {
  const [status, setStatus] = useState<SegmentScanStatus>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [attempts, setAttempts] = useState<CachedSegmentAttempt[]>(segment.attempts ?? []);
  const runId = useRef(0);

  const scan = useCallback(async () => {
    const myRunId = ++runId.current;
    setStatus('scanning');
    setProgress(null);

    const currentDate = activity?.startTime ? activity.startTime.toISOString().slice(0, 10) : '';

    // Exclut l'activité courante de l'historique comparé — sinon, si elle y est déjà sauvegardée,
    // elle est comptée deux fois (une fois en mémoire ci-dessous, une fois via les candidats), avec
    // un risque réel de résultats incohérents entre les deux passages (cas réel constaté par Greg,
    // 2026-08-28 : la copie candidate, reparsée depuis le fichier cloud, donnait 0 passage alors que
    // la version en mémoire en trouvait 4 — activité étiquetée à tort comme "pas courante"). Le nom
    // affiché seul n'est pas fiable (renommage, doublon de migration...), on compare distance et
    // durée totales (±3%) — mais cette tolérance peut échouer si les stats stockées ont dérivé depuis
    // la sauvegarde (fusion de fichier après coup, recalcul différent). `fileName` (nom du fichier
    // brut importé, distinct du nom d'affichage éditable) est un identifiant bien plus stable :
    // comparé en plus, en OR, jamais en remplacement (garde le filtre existant pour les cas où
    // `currentFileName` est indisponible, ex. activité pas encore sauvegardée).
    const closeEnough = (a: number, b: number) => a > 0 && Math.abs(a - b) / a < 0.03;
    const pool = activity
      ? history.filter(e => !(
          e.date === currentDate &&
          (
            (closeEnough(activity.totalDistance, e.distance) && closeEnough(activity.movingTime, e.duration)) ||
            (!!currentFileName && e.fileName === currentFileName)
          )
        ))
      : history;

    // Compare TOUT l'historique (pas de plafond) — action manuelle explicite, pas un scan
    // automatique silencieux. L'empreinte géographique sert seulement à trier les candidats les
    // plus probables en premier (retour visuel utile pendant le scan), pas à en exclure.
    const candidates = pool
      .map(entry => ({ entry, score: entry.fingerprint ? fingerprintOverlap(segment.fingerprint, entry.fingerprint) : -1 }))
      .sort((a, b) => b.score - a.score);

    const found: CachedSegmentAttempt[] = [];

    if (activity) {
      const ms = matchStoredSegmentAll(segment.points, segment.distance, { points: activity.points, date: currentDate, name: activity.name }, true);
      found.push(...ms.map((a, i) => toCachedAttempt(a, i + 1, ms.length, fcMax, fcRest)));
    }

    setProgress({ done: 0, total: candidates.length });
    let done = 0;
    for (const c of candidates) {
      if (myRunId !== runId.current) return; // un nouveau scan (ou segment) a pris le relais
      try {
        const raw = await loadFile(c.entry);
        const points = await parseActivityRawToPoints(raw, c.entry.fileName);
        const ms = matchStoredSegmentAll(segment.points, segment.distance, { points, date: c.entry.date, name: c.entry.name });
        found.push(...ms.map((a, i) => toCachedAttempt(a, i + 1, ms.length, c.entry.fcMax ?? fcMax, c.entry.fcRest ?? fcRest)));
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
  }, [segment, activity, history, loadFile, onScanComplete, fcMax, fcRest, currentFileName]);

  return { status, progress, attempts, scan };
}
