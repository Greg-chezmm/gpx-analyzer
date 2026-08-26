import { useState, useEffect, useRef } from 'react';
import type { GPXActivity } from '../utils/gpxCore';
import type { ActivityIndexEntry } from '../utils/driveStorage';
import {
  computeFingerprint, fingerprintOverlap, matchFullRoute, debugRouteCoverage, parseActivityRawToPoints,
  buildAttempt, type SegmentAttempt,
} from '../utils/segments';

// Seuil bien plus strict que celui utilisé pour un segment partiel (0.15) — on cherche le MÊME
// trajet complet, pas un simple chevauchement ; un pré-filtre serré limite le nombre d'activités
// réellement téléchargées (le matching géométrique précis, lui, est fait sans téléchargement pour
// l'activité courante et coûte un téléchargement+parse par candidate survivante seulement).
const MIN_FINGERPRINT_OVERLAP = 0.6;
const DISTANCE_RATIO_TOLERANCE = 0.3; // ±30% — au-delà, pas la peine de vérifier plus finement
// Plafond de candidates réellement téléchargées par recherche (mêmes valeurs que useStoredSegmentScan.ts).
const MAX_CANDIDATES = 20;

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
  /** Candidates plausibles (distance+empreinte proches) mais rejetées à la vérification géométrique précise. */
  rejected: RejectedCandidate[];
}

/**
 * Détecte automatiquement si des activités passées suivent le même trajet complet que l'activité
 * ouverte (pas juste un tronçon partagé, voir `matchFullRoute`). Se déclenche silencieusement à
 * l'ouverture d'une activité (pas de bouton) — si rien n'est trouvé, `matches` reste vide et
 * l'appelant n'affiche rien.
 */
export function useFullRouteMatches(
  activity: GPXActivity | null,
  history: ActivityIndexEntry[],
  loadFile: (entry: ActivityIndexEntry) => Promise<ArrayBuffer | string>,
): FullRouteMatchesHandle {
  const [status, setStatus] = useState<FullRouteMatchStatus>('idle');
  const [matches, setMatches] = useState<RouteMatch[]>([]);
  const [rejected, setRejected] = useState<RejectedCandidate[]>([]);
  const runId = useRef(0);
  // Évite de relancer un scan déjà fait si `history` change de référence sans changer de contenu
  // pertinent (ex. tableau recréé à chaque rendu par un `.filter()` inline côté appelant).
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activity) { setMatches([]); setRejected([]); setStatus('idle'); lastKeyRef.current = null; return; }

    const currentDate = activity.startTime ? activity.startTime.toISOString().slice(0, 10) : '';
    // `history.length` seul ne suffit pas : un rétro-calcul d'empreinte (voir CloudSync.tsx →
    // "Calculer les empreintes") enrichit des entrées déjà présentes sans changer leur nombre —
    // sans ce compte, une empreinte ajoutée après un premier scan ne déclencherait jamais de nouveau scan.
    const withFingerprint = history.reduce((n, e) => n + (e.fingerprint ? 1 : 0), 0);
    const key = `${currentDate}|${Math.round(activity.totalDistance)}|${history.length}|${withFingerprint}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    const myRunId = ++runId.current;
    setStatus('scanning');

    (async () => {
      const currentFingerprint = computeFingerprint(activity.points);
      const totalCurrent = activity.totalDistance;

      // Exclut l'activité courante elle-même si déjà présente dans l'historique (comparaison
      // distance+durée ±3%, plus robuste qu'un nom qui peut avoir été renommé/dupliqué).
      const closeEnough = (a: number, b: number) => a > 0 && Math.abs(a - b) / a < 0.03;
      const pool = history.filter(e => !(
        e.date === currentDate &&
        closeEnough(activity.totalDistance, e.distance) &&
        closeEnough(activity.movingTime, e.duration)
      ));

      // Pré-filtre bon marché sur les métadonnées seules (aucun téléchargement) : distance globale
      // proche, puis empreinte géographique très recouvrante. Les activités sans empreinte (sauvegardées
      // avant l'ajout de cette fonctionnalité, ex. import en masse depuis Drive) ne sont PAS exclues —
      // elles sont juste reléguées en priorité basse ("inconnu"), sinon tout l'historique migré serait
      // silencieusement ignoré. Plafonné à MAX_CANDIDATES pour borner le coût réseau.
      const closeDistance = (e: ActivityIndexEntry) => {
        if (totalCurrent <= 0 || !e.distance) return false;
        const ratio = e.distance / totalCurrent;
        return ratio >= 1 - DISTANCE_RATIO_TOLERANCE && ratio <= 1 + DISTANCE_RATIO_TOLERANCE;
      };
      const scored = pool.filter(closeDistance).map(e => ({
        entry: e,
        score: e.fingerprint ? fingerprintOverlap(currentFingerprint, e.fingerprint) : -1,
      }));
      const known = scored.filter(s => s.score >= MIN_FINGERPRINT_OVERLAP).sort((a, b) => b.score - a.score);
      const unknown = scored.filter(s => s.score === -1);
      const candidates = [...known, ...unknown].slice(0, MAX_CANDIDATES).map(s => s.entry);

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
      // Une seule correspondance (l'activité courante) = rien trouvé, ne rien afficher comme "matches" —
      // mais le diagnostic des candidates rejetées reste utile pour comprendre pourquoi.
      setMatches(found.length > 1 ? found.sort((a, b) => a.attempt.duration - b.attempt.duration) : []);
      setRejected(rejectedList);
      setStatus('done');
    })();
  }, [activity, history, loadFile]);

  return { status, matches, rejected };
}
