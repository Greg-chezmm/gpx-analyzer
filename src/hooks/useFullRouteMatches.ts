import { useState, useEffect, useRef, useCallback } from 'react';
import type { GPXActivity } from '../utils/gpxCore';
import type { ActivityIndexEntry } from '../utils/driveStorage';
import {
  computeFingerprint, fingerprintOverlap, matchFullRoute, debugRouteCoverage, parseActivityRawToPoints,
  buildAttempt, type SegmentAttempt,
} from '../utils/segments';

const DISTANCE_RATIO_TOLERANCE = 0.3; // ±30% — au-delà, ça ne peut structurellement pas être le même trajet complet

export type FullRouteMatchStatus = 'idle' | 'scanning' | 'done';

/** Un passage retenu — `entry` est `null` pour l'activité courante (déjà ouverte, pas besoin de la recharger). */
export interface RouteMatch {
  attempt: SegmentAttempt;
  entry: ActivityIndexEntry | null;
}

/** Diagnostic d'une candidate écartée — pourquoi elle n'a pas été retenue comme même trajet. */
export interface RejectedCandidate {
  name: string;
  date: string;
  found: boolean;
  coverageCurrent: number;
  coverageCandidate: number;
}

export interface FullRouteMatchesHandle {
  status: FullRouteMatchStatus;
  /** Activité courante + correspondances passées, triées par durée croissante ; vide si aucune correspondance. */
  matches: RouteMatch[];
  /** Candidates plausibles (distance+empreinte proches) mais rejetées à la vérification géométrique précise. Vide si le résultat vient du cache. */
  rejected: RejectedCandidate[];
  /** Vrai si `matches` vient du cache Firestore (pas d'un scan réseau) — voir ActivityIndexEntry.routeMatchIds. */
  fromCache: boolean;
  /** Dernière fois qu'un scan complet a été fait pour cette activité (ISO), si connue. */
  scannedAt: string | null;
  /** Force un nouveau scan complet en ignorant le cache. */
  rescan: () => void;
}

const closeEnough = (a: number, b: number) => a > 0 && Math.abs(a - b) / a < 0.03;

/** Résumé de passage construit directement depuis les métadonnées en cache — aucun téléchargement. */
function attemptFromEntry(entry: ActivityIndexEntry): SegmentAttempt {
  return {
    points: [], startIndex: 0, endIndex: 0,
    distance: entry.distance,
    duration: entry.duration,
    avgPace: entry.avgPace ?? (entry.duration > 0 ? entry.duration / (entry.distance / 1000) : 0),
    avgSpeed: entry.avgSpeed ?? (entry.duration > 0 ? (entry.distance / entry.duration) * 3.6 : 0),
    avgHR: entry.avgHeartRate ?? null,
    elevGain: entry.elevationGain,
    date: entry.date,
    isCurrent: false,
  };
}

/**
 * Détecte automatiquement si des activités passées suivent le même trajet complet que l'activité
 * ouverte (pas juste un tronçon partagé, voir `matchFullRoute`). Se déclenche silencieusement à
 * l'ouverture d'une activité (pas de bouton) — si rien n'est trouvé, `matches` reste vide et
 * l'appelant n'affiche rien.
 *
 * Le résultat d'un scan complet (pas de plafond — tout l'historique du même type est comparé) est
 * persisté en cache (`ActivityIndexEntry.routeMatchIds`), réciproquement sur chaque activité du
 * groupe trouvé, pour ne plus jamais avoir à retélécharger/reparser tout l'historique à chaque
 * ouverture — seule la première ouverture d'une activité (ou un `rescan()` explicite) coûte un scan réseau.
 */
export function useFullRouteMatches(
  activity: GPXActivity | null,
  history: ActivityIndexEntry[],
  loadFile: (entry: ActivityIndexEntry) => Promise<ArrayBuffer | string>,
  updateActivityMetaBatch: (items: { entry: ActivityIndexEntry; updates: Partial<ActivityIndexEntry> }[]) => Promise<void>,
): FullRouteMatchesHandle {
  const [status, setStatus] = useState<FullRouteMatchStatus>('idle');
  const [matches, setMatches] = useState<RouteMatch[]>([]);
  const [rejected, setRejected] = useState<RejectedCandidate[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const runId = useRef(0);
  // Évite de relancer un scan déjà fait si `history` change de référence sans changer de contenu
  // pertinent (ex. tableau recréé à chaque rendu par un `.filter()` inline côté appelant).
  const lastKeyRef = useRef<string | null>(null);

  const runScan = useCallback(async (forceRefresh: boolean) => {
    if (!activity) return;
    const myRunId = ++runId.current;
    setStatus('scanning');

    const currentDate = activity.startTime ? activity.startTime.toISOString().slice(0, 10) : '';
    const currentEntry = history.find(e =>
      e.cloudId && e.date === currentDate &&
      closeEnough(activity.totalDistance, e.distance) &&
      closeEnough(activity.movingTime, e.duration)
    ) ?? null;

    // Résultat déjà en cache pour cette activité — reconstruit l'affichage depuis les métadonnées
    // déjà en mémoire (aucun téléchargement, aucun re-scan).
    if (!forceRefresh && currentEntry?.routeMatchIds) {
      const matchedEntries = currentEntry.routeMatchIds
        .map(id => history.find(e => e.cloudId === id))
        .filter((e): e is ActivityIndexEntry => !!e);
      const found: RouteMatch[] = [
        { attempt: buildAttempt(activity.points, 0, activity.points.length - 1, currentDate, true), entry: null },
        ...matchedEntries.map(e => ({ attempt: attemptFromEntry(e), entry: e })),
      ];
      setMatches(found.length > 1 ? found.sort((a, b) => a.attempt.duration - b.attempt.duration) : []);
      setRejected([]);
      setFromCache(true);
      setScannedAt(currentEntry.routeMatchScannedAt ?? null);
      setStatus('done');
      return;
    }

    // Scan complet — compare tout l'historique du même type (pas de plafond), on ne veut manquer
    // aucune sortie sur ce trajet même s'il y en a plus d'une vingtaine.
    const currentFingerprint = computeFingerprint(activity.points);
    const totalCurrent = activity.totalDistance;
    const pool = history.filter(e => e !== currentEntry);
    const closeDistance = (e: ActivityIndexEntry) => {
      if (totalCurrent <= 0 || !e.distance) return false;
      const ratio = e.distance / totalCurrent;
      return ratio >= 1 - DISTANCE_RATIO_TOLERANCE && ratio <= 1 + DISTANCE_RATIO_TOLERANCE;
    };
    // L'empreinte géographique sert seulement à trier les candidats les plus probables en premier
    // (retour visuel utile pendant le scan) — plus aucune activité n'est exclue sur ce critère.
    const candidates = pool
      .filter(closeDistance)
      .map(e => ({ entry: e, score: e.fingerprint ? fingerprintOverlap(currentFingerprint, e.fingerprint) : -1 }))
      .sort((a, b) => b.score - a.score)
      .map(s => s.entry);

    const found: RouteMatch[] = [
      { attempt: buildAttempt(activity.points, 0, activity.points.length - 1, currentDate, true), entry: null },
    ];
    const rejectedList: RejectedCandidate[] = [];

    for (const c of candidates) {
      if (myRunId !== runId.current) return; // une recherche plus récente a pris le relais
      try {
        const raw = await loadFile(c);
        const points = await parseActivityRawToPoints(raw, c.fileName);
        const source = { points, date: c.date };
        const currentSource = { points: activity.points, date: currentDate };
        const m = matchFullRoute(currentSource, source);
        if (m) {
          found.push({ attempt: m, entry: c });
        } else {
          const dbg = debugRouteCoverage(currentSource, source);
          rejectedList.push({ name: c.name, date: c.date, ...dbg });
        }
      } catch {
        // Fichier illisible/supprimé côté cloud — ignoré silencieusement.
      }
    }

    if (myRunId !== runId.current) return;
    const sorted = found.length > 1 ? found.sort((a, b) => a.attempt.duration - b.attempt.duration) : [];
    setMatches(sorted);
    setRejected(rejectedList);
    setFromCache(false);
    const now = new Date().toISOString();
    setScannedAt(now);
    setStatus('done');

    // Persiste le résultat pour la prochaine ouverture — sur l'activité courante ET réciproquement
    // sur chaque activité désormais identifiée dans le même groupe, pour qu'ouvrir n'importe laquelle
    // d'entre elles bénéficie ensuite du cache sans nouveau scan.
    if (currentEntry) {
      const matchedIds = found.filter(f => f.entry).map(f => f.entry!.cloudId!);
      const items = [
        { entry: currentEntry, updates: { routeMatchIds: matchedIds, routeMatchScannedAt: now } },
        ...found.filter(f => f.entry).map(f => ({
          entry: f.entry!,
          updates: {
            routeMatchIds: [currentEntry.cloudId!, ...matchedIds.filter(id => id !== f.entry!.cloudId)],
            routeMatchScannedAt: now,
          },
        })),
      ];
      updateActivityMetaBatch(items).catch(() => {});
    }
  }, [activity, history, loadFile, updateActivityMetaBatch]);

  useEffect(() => {
    if (!activity) {
      setMatches([]); setRejected([]); setStatus('idle'); setFromCache(false); setScannedAt(null);
      lastKeyRef.current = null;
      return;
    }
    const currentDate = activity.startTime ? activity.startTime.toISOString().slice(0, 10) : '';
    // `history.length` seul ne suffit pas : un rétro-calcul d'empreinte (voir CloudSync.tsx →
    // "Calculer les empreintes") enrichit des entrées déjà présentes sans changer leur nombre —
    // sans ce compte, une empreinte ajoutée après un premier scan ne déclencherait jamais de nouveau scan.
    const withFingerprint = history.reduce((n, e) => n + (e.fingerprint ? 1 : 0), 0);
    const key = `${currentDate}|${Math.round(activity.totalDistance)}|${history.length}|${withFingerprint}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    runScan(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, history]);

  const rescan = useCallback(() => { runScan(true); }, [runScan]);

  return { status, matches, rejected, fromCache, scannedAt, rescan };
}
