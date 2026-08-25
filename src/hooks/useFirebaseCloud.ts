import { useState, useCallback, useEffect } from 'react';
import {
  fetchCloudActivities, upsertCloudActivityMeta,
  updateCloudActivityMeta, deleteCloudActivityDoc,
} from '../utils/firestoreStorage';
import {
  uploadRawFileToDrive, fetchActivityFile, deleteRawFileFromDrive,
  type ActivityIndexEntry,
} from '../utils/driveStorage';
import { isFirebaseConfigured } from '../utils/firebase';
import type { useFirebaseAuth } from './useFirebaseAuth';

export type CloudStatus = 'unavailable' | 'signed-out' | 'connecting' | 'needs-drive' | 'connected';

export interface CloudHandle {
  status: CloudStatus;
  userEmail: string | null;
  history: ActivityIndexEntry[];
  isSaving: boolean;
  signIn(): void;
  signOut(): void;
  save(rawData: string | ArrayBuffer, fileName: string, meta: Omit<ActivityIndexEntry, 'fileId' | 'cloudId'>): Promise<void>;
  loadFile(entry: ActivityIndexEntry): Promise<ArrayBuffer | string>;
  deleteActivity(entry: ActivityIndexEntry): Promise<void>;
  updateActivityMeta(entry: ActivityIndexEntry, updates: Partial<ActivityIndexEntry>): Promise<void>;
  refresh(): Promise<void>;
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
      // Réutilise le fichier Drive existant si l'activité est déjà connue (même date+nom/fileName,
      // ex. renommage) — sinon upload d'un nouveau fichier.
      const existing = history.find(e => e.date === meta.date && (e.name === meta.name || e.fileName === meta.fileName));
      const fileId = existing?.fileId ?? await uploadRawFileToDrive(driveToken, rawData, fileName);
      await upsertCloudActivityMeta(auth.user.uid, { ...meta, fileId });
      await refresh();
    } finally {
      setIsSaving(false);
    }
  }, [auth.user, driveToken, history, refresh]);

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

  return {
    status, userEmail: auth.user?.email ?? null, history, isSaving,
    signIn: auth.signIn, signOut: auth.signOut,
    save, loadFile, deleteActivity: deleteActivityFn, updateActivityMeta: updateActivityMetaFn, refresh,
  };
}
