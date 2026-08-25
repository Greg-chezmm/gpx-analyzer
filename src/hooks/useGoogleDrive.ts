import { useState, useEffect, useCallback, useRef } from 'react';
import {
  uploadActivity, fetchActivityList, fetchActivityFile,
  saveUserSettings, fetchUserSettings,
  deleteActivity as deleteActivityStorage,
  updateActivityMeta as updateActivityMetaStorage,
  type ActivityIndexEntry, type DriveUserSettings,
} from '../utils/driveStorage';

declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }): { requestAccessToken(overrides?: { prompt?: string }): void };
          revoke(token: string, done: () => void): void;
        };
      };
    };
  }
}

export type DriveStatus = 'unavailable' | 'disconnected' | 'connecting' | 'connected' | 'error';

export interface DriveHandle {
  status: DriveStatus;
  wasAuthorized: boolean;
  // Jeton d'accès brut — utilisé par useFirebaseCloud.ts pour l'upload/téléchargement de fichier
  // (solution hybride : fichier brut sur Drive, métadonnées sur Firestore).
  token: string | null;
  history: ActivityIndexEntry[];
  isSaving: boolean;
  signIn(): void;
  signOut(): void;
  save(rawData: string | ArrayBuffer, fileName: string, meta: Omit<ActivityIndexEntry, 'fileId'>): Promise<void>;
  loadFile(fileId: string, fileName: string): Promise<ArrayBuffer | string>;
  deleteActivity(fileId: string | null, entry: Pick<ActivityIndexEntry, 'date' | 'name'>): Promise<void>;
  updateActivityMeta(entry: Pick<ActivityIndexEntry, 'date' | 'name'>, updates: Partial<ActivityIndexEntry>): Promise<void>;
  refresh(): Promise<void>;
  saveSettings(settings: DriveUserSettings): Promise<void>;
  loadSettings(): Promise<DriveUserSettings | null>;
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const AUTHORIZED_KEY = 'gpx_drive_authorized';

export function useGoogleDrive(): DriveHandle {
  const [status, setStatus] = useState<DriveStatus>(CLIENT_ID ? 'disconnected' : 'unavailable');
  const [token, setToken] = useState<string | null>(null);
  const [history, setHistory] = useState<ActivityIndexEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const clientRef = useRef<{ requestAccessToken(overrides?: { prompt?: string }): void } | null>(null);
  // Persiste à travers les refreshs : true tant que l'utilisateur n'a pas explicitement déconnecté
  const [wasAuthorized] = useState(() => localStorage.getItem(AUTHORIZED_KEY) === '1');

  useEffect(() => {
    if (!CLIENT_ID) return;

    const init = () => {
      if (!window.google?.accounts?.oauth2) return;

      clientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (resp) => {
          if (!resp.access_token) {
            // Reconnexion bloquée (popup-blocker, cookies tiers) — on ne supprime pas la clé
            setStatus('disconnected');
            return;
          }
          localStorage.setItem(AUTHORIZED_KEY, '1');
          setToken(resp.access_token);
          setStatus('connected');
        },
      });

      // Auto-reconnect silencieux si déjà autorisé — prompt vide = pas d'écran de consentement
      if (localStorage.getItem(AUTHORIZED_KEY) === '1') {
        setStatus('connecting');
        clientRef.current.requestAccessToken({ prompt: '' });
      }
    };

    if (window.google?.accounts?.oauth2) {
      init();
    } else {
      const t = setInterval(() => {
        if (window.google?.accounts?.oauth2) { clearInterval(t); init(); }
      }, 100);
      return () => clearInterval(t);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setHistory(await fetchActivityList(token));
    } catch (e: unknown) {
      if ((e as { status?: number }).status === 401) {
        setToken(null); setStatus('disconnected');
      }
    }
  }, [token]);

  useEffect(() => { if (token) refresh(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback(() => {
    if (!clientRef.current) return;
    setStatus('connecting');
    // Si déjà autorisé, pas besoin de redemander le consentement — prompt vide = popup rapide sans écran de consentement
    const prompt = localStorage.getItem(AUTHORIZED_KEY) === '1' ? '' : 'consent';
    clientRef.current.requestAccessToken({ prompt });
  }, []);

  const signOut = useCallback(() => {
    if (token) window.google.accounts.oauth2.revoke(token, () => {});
    localStorage.removeItem(AUTHORIZED_KEY);
    setToken(null); setStatus('disconnected'); setHistory([]);
  }, [token]);

  const save = useCallback(async (
    rawData: string | ArrayBuffer,
    fileName: string,
    meta: Omit<ActivityIndexEntry, 'fileId'>
  ) => {
    if (!token) return;
    setIsSaving(true);
    try {
      await uploadActivity(token, rawData, fileName, meta);
      await refresh();
    } finally {
      setIsSaving(false);
    }
  }, [token, refresh]);

  const loadFile = useCallback(async (fileId: string, fileName: string) => {
    if (!token) throw new Error('Non connecté à Drive');
    return fetchActivityFile(token, fileId, fileName);
  }, [token]);

  const saveSettings = useCallback(async (settings: DriveUserSettings) => {
    if (!token) return;
    try { await saveUserSettings(token, settings); } catch { /* silently fail */ }
  }, [token]);

  const loadSettings = useCallback(async (): Promise<DriveUserSettings | null> => {
    if (!token) return null;
    try { return await fetchUserSettings(token); } catch { return null; }
  }, [token]);

  const deleteActivity = useCallback(async (
    fileId: string | null,
    entry: Pick<ActivityIndexEntry, 'date' | 'name'>,
  ) => {
    if (!token) return;
    await deleteActivityStorage(token, fileId, entry);
    await refresh();
  }, [token, refresh]);

  const updateActivityMeta = useCallback(async (
    entry: Pick<ActivityIndexEntry, 'date' | 'name'>,
    updates: Partial<ActivityIndexEntry>,
  ) => {
    if (!token) return;
    await updateActivityMetaStorage(token, entry, updates);
    await refresh();
  }, [token, refresh]);

  return { status, wasAuthorized, token, history, isSaving, signIn, signOut, save, loadFile, deleteActivity, updateActivityMeta, refresh, saveSettings, loadSettings };
}
