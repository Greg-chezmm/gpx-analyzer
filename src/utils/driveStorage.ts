import type { WeatherSource } from './weather';
import type { BestEffortsData } from './bestEfforts';

/** Entrée de l'index d'activités — Google Drive (metadata + stats résumées) ou Firebase (cloud primaire). */
export interface ActivityIndexEntry {
  fileId: string | null;
  // Présents uniquement pour les entrées issues de Firebase (voir firestoreStorage.ts)
  cloudId?: string;
  storagePath?: string;
  name: string;
  date: string;           // "YYYY-MM-DD"
  distance: number;       // metres
  duration: number;       // seconds (movingTime)
  activityType: string;
  elevationGain: number;  // metres
  fileName: string;
  // FC
  avgHeartRate?: number;
  // Charge
  trimp?: number;
  trimpBanister?: number;
  zoneMinutes?: number[]; // [Z1..Z5] Karvonen, minutes — voir polarization.ts
  // VO2max
  vo2max?: number;
  vo2maxConfidence?: string;
  // Séance
  sessionType?: string;
  // Vélo
  normalizedPower?: number;
  tss?: number;
  // Autres
  driftPct?: number;
  avgCadence?: number;
  // Objectif course — calibration TSB personnalisée (voir raceGoal.ts)
  isRace?: boolean;
  // Meilleurs efforts — temps record (course) ou puissance/vitesse (vélo), voir bestEfforts.ts
  bestEfforts?: BestEffortsData;
  // Météo au moment de l'activité (Open-Meteo, modèles Météo-France)
  weatherTemp?: number;
  weatherWindSpeed?: number;
  weatherWindDirection?: number;
  weatherCloudCover?: number;
  weatherPrecipitation?: number;
  weatherCode?: number;
  weatherSource?: WeatherSource;
}

/** Structure du fichier d'index JSON sauvegardé sur Drive (activities-index.json). */
interface DriveIndex {
  version: 1;
  folderId: string;
  activities: ActivityIndexEntry[];
}

const INDEX_NAME = 'activities-index.json';
const FOLDER_NAME = 'GPX Analyzer';
const BASE = 'https://www.googleapis.com';

/** Effectue une requête authentifiée vers l'API Google Drive ; lève une erreur si le statut HTTP n'est pas OK. */
async function req(url: string, token: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = Object.assign(new Error(`Drive API ${res.status}`), { status: res.status });
    throw err;
  }
  return res;
}

/** Récupère ou crée le dossier "GPX Analyzer" dans le Drive de l'utilisateur, retourne son id. */
async function getOrCreateFolder(token: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const r = await req(`${BASE}/drive/v3/files?q=${q}&fields=files(id)`, token);
  const { files } = await r.json() as { files: { id: string }[] };
  if (files.length > 0) return files[0].id;

  const r2 = await req(`${BASE}/drive/v3/files`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const { id } = await r2.json() as { id: string };
  return id;
}

/** Charge le fichier d'index JSON depuis Drive ; retourne un index vide si inexistant. */
async function loadIndex(token: string, folderId: string): Promise<{ id: string | null; data: DriveIndex }> {
  const q = encodeURIComponent(`name='${INDEX_NAME}' and '${folderId}' in parents and trashed=false`);
  const r = await req(`${BASE}/drive/v3/files?q=${q}&fields=files(id)`, token);
  const { files } = await r.json() as { files: { id: string }[] };

  if (files.length === 0) return { id: null, data: { version: 1, folderId, activities: [] } };

  const r2 = await req(`${BASE}/drive/v3/files/${files[0].id}?alt=media`, token);
  return { id: files[0].id, data: await r2.json() as DriveIndex };
}

/** Construit un corps multipart/related (format requis par l'API Drive upload) depuis les métadonnées et le contenu du fichier. */
function buildMultipart(
  boundary: string,
  meta: object,
  content: ArrayBuffer | string,
  mime: string
): Blob {
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`
  );
  const body = content instanceof ArrayBuffer ? new Uint8Array(content) : enc.encode(content);
  const tail = enc.encode(`\r\n--${boundary}--`);
  return new Blob([head, body, tail]);
}

/** Sauvegarde (crée ou met à jour) le fichier d'index JSON sur Drive. */
async function saveIndex(token: string, folderId: string, id: string | null, data: DriveIndex): Promise<void> {
  const boundary = 'gpxanalyzer_idx_314159';
  const meta = id ? { name: INDEX_NAME } : { name: INDEX_NAME, parents: [folderId] };
  const body = buildMultipart(boundary, meta, JSON.stringify(data), 'application/json');
  const url = id
    ? `${BASE}/upload/drive/v3/files/${id}?uploadType=multipart`
    : `${BASE}/upload/drive/v3/files?uploadType=multipart`;
  await req(url, token, {
    method: id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
    body,
  });
}

/** Uploade un fichier d'activité (GPX ou FIT) sur Drive et met à jour l'index. Si l'activité existe déjà (même date+nom), seules les métadonnées sont rafraîchies sans ré-upload. */
export async function uploadActivity(
  token: string,
  rawData: string | ArrayBuffer,
  fileName: string,
  entry: Omit<ActivityIndexEntry, 'fileId'>
): Promise<void> {
  const folderId = await getOrCreateFolder(token);
  const { id: indexId, data: index } = await loadIndex(token, folderId);

  // Match by date+name first; fall back to date+fileName to handle renames
  let existingIdx = index.activities.findIndex(a => a.date === entry.date && a.name === entry.name);
  if (existingIdx < 0) {
    existingIdx = index.activities.findIndex(a => a.date === entry.date && a.fileName === entry.fileName);
  }

  if (existingIdx >= 0) {
    // Update metadata only — keep the existing file reference, no re-upload
    index.activities[existingIdx] = {
      ...index.activities[existingIdx],
      ...entry,
      fileId: index.activities[existingIdx].fileId,
    };
    await saveIndex(token, folderId, indexId, index);
    return;
  }

  const isFit = fileName.toLowerCase().endsWith('.fit');
  const mime = isFit ? 'application/octet-stream' : 'application/gpx+xml';
  const boundary = 'gpxanalyzer_file_271828';
  const fileMeta = { name: fileName, parents: [folderId], mimeType: mime };
  const fileBody = buildMultipart(boundary, fileMeta, rawData, mime);

  const r = await req(`${BASE}/upload/drive/v3/files?uploadType=multipart&fields=id`, token, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
    body: fileBody,
  });
  const { id: fileId } = await r.json() as { id: string };

  index.activities.unshift({ ...entry, fileId });
  await saveIndex(token, folderId, indexId, index);
}

/** Récupère la liste des activités depuis l'index Drive (tri chronologique inversé conservé). */
export async function fetchActivityList(token: string): Promise<ActivityIndexEntry[]> {
  const folderId = await getOrCreateFolder(token);
  const { data } = await loadIndex(token, folderId);
  return data.activities;
}

/** Met à jour uniquement les métadonnées d'une entrée de l'index (ex. drapeau "course") sans toucher au fichier. */
export async function updateActivityMeta(
  token: string,
  entry: Pick<ActivityIndexEntry, 'date' | 'name'>,
  updates: Partial<ActivityIndexEntry>,
): Promise<void> {
  const folderId = await getOrCreateFolder(token);
  const { id: indexId, data: index } = await loadIndex(token, folderId);
  const idx = index.activities.findIndex(a => a.date === entry.date && a.name === entry.name);
  if (idx < 0) return;
  index.activities[idx] = { ...index.activities[idx], ...updates };
  await saveIndex(token, folderId, indexId, index);
}

/** Télécharge le contenu brut d'un fichier d'activité depuis Drive (ArrayBuffer pour FIT, string pour GPX). */
export async function fetchActivityFile(token: string, fileId: string, fileName: string): Promise<ArrayBuffer | string> {
  const r = await req(`${BASE}/drive/v3/files/${fileId}?alt=media`, token);
  if (fileName.toLowerCase().endsWith('.fit')) return r.arrayBuffer();
  return r.text();
}

// ── Training history (TSB/CTL/ATL) ───────────────────────────────────

/** Entrée de l'historique d'entraînement utilisée pour le calcul CTL/ATL/TSB. */
export interface DriveTrainingEntry {
  date: string;
  trimp: number;
  name: string;
}

const HISTORY_NAME = 'training-history.json';

/** Sauvegarde ou met à jour un fichier JSON générique dans le dossier Drive. */
async function saveJsonFile<T>(
  token: string,
  folderId: string,
  name: string,
  data: T
): Promise<void> {
  const q = encodeURIComponent(`name='${name}' and '${folderId}' in parents and trashed=false`);
  const r = await req(`${BASE}/drive/v3/files?q=${q}&fields=files(id)`, token);
  const { files } = await r.json() as { files: { id: string }[] };
  const existingId = files.length > 0 ? files[0].id : null;

  const boundary = 'gpxanalyzer_json_161803';
  const meta = existingId ? { name } : { name, parents: [folderId] };
  const body = buildMultipart(boundary, meta, JSON.stringify(data), 'application/json');
  const url = existingId
    ? `${BASE}/upload/drive/v3/files/${existingId}?uploadType=multipart`
    : `${BASE}/upload/drive/v3/files?uploadType=multipart`;
  await req(url, token, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
    body,
  });
}

/** Charge un fichier JSON générique depuis le dossier Drive ; retourne null si inexistant. */
async function loadJsonFile<T>(
  token: string,
  folderId: string,
  name: string
): Promise<T | null> {
  const q = encodeURIComponent(`name='${name}' and '${folderId}' in parents and trashed=false`);
  const r = await req(`${BASE}/drive/v3/files?q=${q}&fields=files(id)`, token);
  const { files } = await r.json() as { files: { id: string }[] };
  if (files.length === 0) return null;
  const r2 = await req(`${BASE}/drive/v3/files/${files[0].id}?alt=media`, token);
  return r2.json() as Promise<T>;
}

/** Sauvegarde l'historique d'entraînement (TRIMP par jour) sur Drive. */
export async function saveTrainingHistory(token: string, history: DriveTrainingEntry[]): Promise<void> {
  const folderId = await getOrCreateFolder(token);
  await saveJsonFile(token, folderId, HISTORY_NAME, history);
}

/** Charge l'historique d'entraînement depuis Drive ; retourne un tableau vide si absent. */
export async function fetchTrainingHistory(token: string): Promise<DriveTrainingEntry[]> {
  const folderId = await getOrCreateFolder(token);
  const data = await loadJsonFile<DriveTrainingEntry[]>(token, folderId, HISTORY_NAME);
  return data ?? [];
}

// ── User settings ─────────────────────────────────────────────────────

/** Paramètres physiologiques de l'utilisateur synchronisés sur Drive. */
export interface DriveUserSettings {
  fcMax: number;
  fcRest: number;
  vma: number;
  ftp: number;
  weight: number;
  birthYear: number;
  sex: string;
}

const SETTINGS_NAME = 'user-settings.json';

/** Sauvegarde les paramètres utilisateur sur Drive. */
export async function saveUserSettings(token: string, settings: DriveUserSettings): Promise<void> {
  const folderId = await getOrCreateFolder(token);
  await saveJsonFile(token, folderId, SETTINGS_NAME, settings);
}

/** Charge les paramètres utilisateur depuis Drive ; retourne null si jamais sauvegardés. */
export async function fetchUserSettings(token: string): Promise<DriveUserSettings | null> {
  const folderId = await getOrCreateFolder(token);
  return loadJsonFile<DriveUserSettings>(token, folderId, SETTINGS_NAME);
}

// ── Delete activity ────────────────────────────────────────────────────

/** Supprime une activité de Drive : efface le fichier GPX/FIT, la retire de l'index et de l'historique TRIMP. */
export async function deleteActivity(
  token: string,
  fileId: string | null,
  entry: Pick<ActivityIndexEntry, 'date' | 'name'>,
): Promise<void> {
  const folderId = await getOrCreateFolder(token);

  // 1. Supprimer le fichier Drive si l'id existe
  if (fileId) {
    try {
      await req(`${BASE}/drive/v3/files/${fileId}`, token, { method: 'DELETE' });
    } catch {
      // Déjà supprimé ou inaccessible — on continue
    }
  }

  // 2. Retirer de activities-index.json
  const { id: indexId, data: index } = await loadIndex(token, folderId);
  index.activities = index.activities.filter(
    a => !(a.date === entry.date && a.name === entry.name)
  );
  await saveIndex(token, folderId, indexId, index);

  // 3. Retirer de training-history.json
  const history = await loadJsonFile<DriveTrainingEntry[]>(token, folderId, HISTORY_NAME);
  if (history) {
    const filtered = history.filter(
      h => !(h.date === entry.date && h.name === entry.name)
    );
    if (filtered.length !== history.length) {
      await saveJsonFile(token, folderId, HISTORY_NAME, filtered);
    }
  }
}
