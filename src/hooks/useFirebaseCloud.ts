import { useState, useCallback, useEffect } from 'react';
import {
  fetchCloudActivities, findExistingCloudActivity, createCloudActivityMeta,
  updateCloudActivityMeta, deleteCloudActivityDoc,
} from '../utils/firestoreStorage';
import {
  uploadRawFileToDrive, fetchActivityFile, deleteRawFileFromDrive,
  type ActivityIndexEntry,
} from '../utils/driveStorage';
import { isFirebaseConfigured } from '../utils/firebase';
import type { useFirebaseAuth } from './useFirebaseAuth';

export type CloudStatus = 'unavailable' | 'signed-out' | 'connecting' | 'needs-drive' | 'connected';

/** Résultat d'un import en masse depuis l'ancien index Drive (voir `importFromDrive`). */
export interface ImportResult {
  imported: number;
  skipped: number; // déjà présentes sur Firestore (même date+nom/fileName)
  total: number;
}

export interface CloudHandle {
  status: CloudStatus;
  userEmail: string | null;
  history: ActivityIndexEntry[];
  isSaving: boolean;
  isImporting: boolean;
  signIn(): void;
  signOut(): void;
  save(rawData: string | ArrayBuffer, fileName: string, meta: Omit<ActivityIndexEntry, 'fileId' | 'cloudId'>): Promise<void>;
  loadFile(entry: ActivityIndexEntry): Promise<ArrayBuffer | string>;
  deleteActivity(entry: ActivityIndexEntry): Promise<void>;
  updateActivityMeta(entry: ActivityIndexEntry, updates: Partial<ActivityIndexEntry>): Promise<void>;
  /**
   * Met à jour plusieurs activités en une fois sans refetch intermédiaire (contrairement à
   * `updateActivityMeta`, qui recharge tout l'historique à chaque appel) — utilisé pour persister
   * réciproquement un groupe de trajets correspondants, voir useFullRouteMatches.ts.
   */
  updateActivityMetaBatch(items: { entry: ActivityIndexEntry; updates: Partial<ActivityIndexEntry> }[]): Promise<void>;
  refresh(): Promise<void>;
  /**
   * Copie les métadonnées de l'ancien index Drive (`activities-index.json`) vers Firestore, sans
   * ré-upload ni re-parsing : le fichier brut reste sur Drive, référencé par le même `fileId`, et
   * tous les stats (TRIMP, VO2max, meilleurs efforts...) sont déjà calculés dans l'entrée Drive.
   * Ignore les activités déjà présentes sur Firestore (même vérification que `save`).
   */
  importFromDrive(driveEntries: ActivityIndexEntry[], onProgress?: (done: number, total: number) => void): Promise<ImportResult>;
}

/**
 * Sauvegarde/chargement des activités — solution hybride : métadonnées sur Firestore, fichier
 * brut GPX/FIT sur Google Drive (Firebase Storage nécessite un forfait payant non actif
 * actuellement). Requiert donc Firebase Auth ET une connexion Drive actives simultanément —
 * voir statut `needs-drive` quand seule la première est établie.
 */
export function useFirebaseCloud(auth: ReturnType<typeof useFirebaseAuth>, driveToken: string | null): CloudHandle {
  const [history, setHistory] = useState<ActivityIndexEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const refresh = useCallback(async () => {
    if (!auth.user) return;
    setHistory(await fetchCloudActivities(auth.user.uid));
  }, [auth.user]);

  useEffect(() => {
    if (auth.status === 'signed-in' && auth.user) {
      refresh();
    } else {
      setHistory([]);
    }
  }, [auth.status, auth.user]); // eslint-disable-line react-hooks/exhaustive-deps

  const status: CloudStatus = !isFirebaseConfigured ? 'unavailable'
    : auth.status === 'loading' ? 'connecting'
    : auth.status !== 'signed-in' ? 'signed-out'
    : !driveToken ? 'needs-drive'
    : 'connected';

  const save = useCallback(async (
    rawData: string | ArrayBuffer,
    fileName: string,
    meta: Omit<ActivityIndexEntry, 'fileId' | 'cloudId'>,
  ) => {
    if (!auth.user || !driveToken) return;
    setIsSaving(true);
    try {
      // Toujours vérifié fraîchement sur Firestore (jamais l'état local `history`, qui peut être
      // périmé juste après un rechargement de page) — évite un re-upload Drive orphelin ou un
      // doublon d'activité si l'état local n'est pas encore synchronisé.
      const existing = await findExistingCloudActivity(auth.user.uid, meta.date, meta.name, meta.fileName);
      const fileId = existing?.fileId ?? await uploadRawFileToDrive(driveToken, rawData, fileName);
      if (existing) {
        await updateCloudActivityMeta(auth.user.uid, existing.cloudId, { ...meta, fileId });
      } else {
        await createCloudActivityMeta(auth.user.uid, { ...meta, fileId });
      }
      await refresh();
    } finally {
      setIsSaving(false);
    }
  }, [auth.user, driveToken, refresh]);

  const loadFile = useCallback(async (entry: ActivityIndexEntry) => {
    if (!driveToken || !entry.fileId) throw new Error('Activité invalide (fichier introuvable) ou Drive non connecté');
    return fetchActivityFile(driveToken, entry.fileId, entry.fileName);
  }, [driveToken]);

  const deleteActivityFn = useCallback(async (entry: ActivityIndexEntry) => {
    if (!auth.user || !entry.cloudId) return;
    if (driveToken && entry.fileId) await deleteRawFileFromDrive(driveToken, entry.fileId);
    await deleteCloudActivityDoc(auth.user.uid, entry.cloudId);
    await refresh();
  }, [auth.user, driveToken, refresh]);

  const updateActivityMetaFn = useCallback(async (entry: ActivityIndexEntry, updates: Partial<ActivityIndexEntry>) => {
    if (!auth.user || !entry.cloudId) return;
    await updateCloudActivityMeta(auth.user.uid, entry.cloudId, updates);
    await refresh();
  }, [auth.user, refresh]);

  const updateActivityMetaBatchFn = useCallback(async (
    items: { entry: ActivityIndexEntry; updates: Partial<ActivityIndexEntry> }[],
  ) => {
    if (!auth.user) return;
    const uid = auth.user.uid;
    await Promise.all(items
      .filter(({ entry }) => entry.cloudId)
      .map(({ entry, updates }) => updateCloudActivityMeta(uid, entry.cloudId!, updates)));
    setHistory(prev => prev.map(e => {
      const item = items.find(i => i.entry.cloudId === e.cloudId);
      return item ? { ...e, ...item.updates } : e;
    }));
  }, [auth.user]);

  const importFromDrive = useCallback(async (
    driveEntries: ActivityIndexEntry[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<ImportResult> => {
    if (!auth.user) return { imported: 0, skipped: 0, total: 0 };
    const uid = auth.user.uid;
    setIsImporting(true);
    let imported = 0, skipped = 0;
    try {
      for (let i = 0; i < driveEntries.length; i++) {
        const entry = driveEntries[i];
        // Même vérification que save() — jamais l'état local, toujours interrogé frais.
        const existing = await findExistingCloudActivity(uid, entry.date, entry.name, entry.fileName);
        if (existing) {
          skipped++;
        } else {
          await createCloudActivityMeta(uid, entry);
          imported++;
        }
        onProgress?.(i + 1, driveEntries.length);
      }
      await refresh();
    } finally {
      setIsImporting(false);
    }
    return { imported, skipped, total: driveEntries.length };
  }, [auth.user, refresh]);

  return {
    status, userEmail: auth.user?.email ?? null, history, isSaving, isImporting,
    signIn: auth.signIn, signOut: auth.signOut,
    save, loadFile, deleteActivity: deleteActivityFn, updateActivityMeta: updateActivityMetaFn,
    updateActivityMetaBatch: updateActivityMetaBatchFn, refresh,
    importFromDrive,
  };
}
