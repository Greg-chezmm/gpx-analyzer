import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchActivityList, fetchActivityFile,
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
            callback: (resp: { access_token?: string; error?: string; expires_in?: number }) => void;
          }): { requestAccessToken(overrides?: { prompt?: string }): void };
          revoke(token: string, done: () => void): void;
        };
      };
    };
  }
}

export type DriveStatus = 'unavailable' | 'disconnected' | 'connecting' | 'connected' | 'error';

/** Traduit les codes d'erreur Google Identity Services en message compréhensible. */
function describeDriveError(code: string | undefined): string {
  switch (code) {
    case 'popup_closed_by_user': return 'Fenêtre de connexion Google fermée avant la fin.';
    case 'popup_failed_to_open': return "La fenêtre de connexion Google n'a pas pu s'ouvrir (bloqueur de popups ?).";
    case 'access_denied': return "Accès refusé — l'autorisation Drive n'a pas été accordée.";
    default: return code ? `Connexion Drive refusée (${code}).` : 'Connexion Drive refusée par le navigateur.';
  }
}

export interface DriveHandle {
  status: DriveStatus;
  wasAuthorized: boolean;
  /** Message d'erreur de la dernière tentative de connexion explicite (signIn) — null si aucune ou réussie. */
  error: string | null;
  // Jeton d'accès brut — utilisé par useFirebaseCloud.ts pour l'upload/téléchargement de fichier
  // (solution hybride : fichier brut sur Drive, métadonnées sur Firestore).
  token: string | null;
  history: ActivityIndexEntry[];
  signIn(): void;
  signOut(): void;
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
const OAUTH_STATE_KEY = 'gpx_drive_oauth_state';
// Le token est aussi mis en sessionStorage (en plus du state React) pour survivre à un rechargement
// d'onglet — fréquent sur mobile quand le navigateur décharge l'onglet en arrière-plan pendant que
// le sélecteur de fichier natif est ouvert (perte de mémoire vive, pas propre à notre code).
const TOKEN_STORAGE_KEY = 'gpx_drive_token';

function storeToken(token: string, expiresInSeconds: number | undefined) {
  const expiresAt = Date.now() + (expiresInSeconds ?? 3600) * 1000;
  sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ token, expiresAt }));
}

function readStoredToken(): string | null {
  const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const { token, expiresAt } = JSON.parse(raw) as { token: string; expiresAt: number };
    if (Date.now() >= expiresAt) { sessionStorage.removeItem(TOKEN_STORAGE_KEY); return null; }
    return token;
  } catch { return null; }
}

// Le flux popup (Google Identity Services) est peu fiable sur navigateurs mobiles (Android/iOS) —
// boucle "choix du compte → popup se ferme → se rouvre" sans jamais aboutir. Sur mobile on utilise
// donc une redirection pleine page vers l'écran de consentement Google à la place (voir signIn /
// l'effet qui lit le token dans le hash au retour).
const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function driveRedirectUri(): string {
  return window.location.origin + import.meta.env.BASE_URL;
}

function buildDriveAuthUrl(prompt: string, state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    redirect_uri: driveRedirectUri(),
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state,
  });
  if (prompt) params.set('prompt', prompt);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function useGoogleDrive(): DriveHandle {
  const [status, setStatus] = useState<DriveStatus>(CLIENT_ID ? 'disconnected' : 'unavailable');
  const [token, setToken] = useState<string | null>(null);
  const [history, setHistory] = useState<ActivityIndexEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<{ requestAccessToken(overrides?: { prompt?: string }): void } | null>(null);
  // Distingue une tentative explicite (bouton "Connecter Drive") d'une reconnexion silencieuse au
  // montage — seule la première doit afficher une erreur, l'autre échoue souvent sans conséquence
  // (ex. token expiré, l'utilisateur reclique juste après).
  const isExplicitAttemptRef = useRef(false);
  // Persiste à travers les refreshs : true tant que l'utilisateur n'a pas explicitement déconnecté
  const [wasAuthorized] = useState(() => localStorage.getItem(AUTHORIZED_KEY) === '1');

  // Restaure un token encore valide après un rechargement d'onglet (voir TOKEN_STORAGE_KEY) — avant
  // le traitement du hash ci-dessous, qui prévaut si un retour de redirection est aussi présent.
  useEffect(() => {
    if (!CLIENT_ID) return;
    const stored = readStoredToken();
    if (stored) { setToken(stored); setStatus('connected'); }
  }, []);

  // Retour de la redirection mobile — le token arrive dans le fragment d'URL (#access_token=...).
  // Tourne aussi sur desktop par sécurité (ex. lien ouvert depuis un partage mobile), sans effet si absent.
  useEffect(() => {
    if (!CLIENT_ID || !window.location.hash.includes('access_token=')) return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get('access_token');
    const expiresIn = params.get('expires_in');
    const returnedState = params.get('state');
    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    // Nettoie l'URL dans tous les cas pour ne pas laisser le jeton dans la barre d'adresse / l'historique.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (!accessToken || !expectedState || returnedState !== expectedState) return;
    localStorage.setItem(AUTHORIZED_KEY, '1');
    storeToken(accessToken, expiresIn ? Number(expiresIn) : undefined);
    setError(null);
    setToken(accessToken);
    setStatus('connected');
  }, []);

  useEffect(() => {
    if (!CLIENT_ID || isMobile) return; // mobile passe par la redirection ci-dessus, pas le client popup

    const init = () => {
      if (!window.google?.accounts?.oauth2) return;

      clientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (resp) => {
          if (!resp.access_token) {
            // Reconnexion bloquée (popup-blocker, cookies tiers) — on ne supprime pas la clé
            if (isExplicitAttemptRef.current) setError(describeDriveError(resp.error));
            isExplicitAttemptRef.current = false;
            setStatus('disconnected');
            return;
          }
          isExplicitAttemptRef.current = false;
          setError(null);
          localStorage.setItem(AUTHORIZED_KEY, '1');
          storeToken(resp.access_token, resp.expires_in);
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
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken(null); setStatus('disconnected');
      }
    }
  }, [token]);

  useEffect(() => { if (token) refresh(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback(() => {
    // Si déjà autorisé, pas besoin de redemander le consentement — prompt vide = accès direct sans écran de consentement
    const prompt = localStorage.getItem(AUTHORIZED_KEY) === '1' ? '' : 'consent';
    if (isMobile) {
      const state = crypto.randomUUID();
      sessionStorage.setItem(OAUTH_STATE_KEY, state);
      window.location.href = buildDriveAuthUrl(prompt, state);
      return;
    }
    if (!clientRef.current) return;
    isExplicitAttemptRef.current = true;
    setError(null);
    setStatus('connecting');
    clientRef.current.requestAccessToken({ prompt });
  }, []);

  const signOut = useCallback(() => {
    if (token) window.google.accounts.oauth2.revoke(token, () => {});
    localStorage.removeItem(AUTHORIZED_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null); setStatus('disconnected'); setHistory([]);
  }, [token]);

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

  return { status, wasAuthorized, error, token, history, signIn, signOut, loadFile, deleteActivity, updateActivityMeta, refresh, saveSettings, loadSettings };
}
