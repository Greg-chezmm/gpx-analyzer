import type { WeatherSource } from './weather';
import type { BestEffortsData } from './bestEfforts';
import type { GeoPoint } from './segments';

/**
 * Entrée d'activité — Google Drive seul (`fileId` = index legacy) ou solution hybride cloud
 * (`fileId` = fichier brut sur Drive, `cloudId` = métadonnées sur Firestore). Le fichier brut
 * reste sur Drive dans les deux cas ; Firebase Storage nécessite un forfait payant non actif
 * actuellement (voir firestoreStorage.ts / useFirebaseCloud.ts).
 */
export interface ActivityIndexEntry {
  fileId: string | null;
  // Présent uniquement pour les entrées dont les métadonnées vivent sur Firestore
  cloudId?: string;
  name: string;
  date: string;           // "YYYY-MM-DD"
  distance: number;       // metres
  duration: number;       // seconds (movingTime)
  activityType: string;
  elevationGain: number;  // metres
  fileName: string;
  // FC
  avgHeartRate?: number;
  // Vitesse/allure moyenne — utilisées par le graphique de progression
  avgPace?: number;  // s/km (running)
  avgSpeed?: number; // km/h (cycling)
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
  // Empreinte géographique (cellules geohash) — pré-filtrage bon marché pour la détection de
  // segments récurrents, voir utils/segments.ts. Absente sur les activités sauvegardées avant
  // l'ajout de cette fonctionnalité.
  fingerprint?: string[];
  // Géométrie allégée du tracé (mêmes points échantillonnés que fingerprint, mais lat/lon/distance
  // gardés au lieu du hash) — permet à "Ton parcours habituel" de comparer deux trajets complets
  // sans télécharger/reparser le fichier brut, voir computeRouteGeometry/checkFullRouteCoverage
  // dans utils/segments.ts. Absente sur les activités sauvegardées avant l'ajout de cette
  // fonctionnalité (rétro-calcul via "Calculer les empreintes" dans CloudSync.tsx).
  routeGeometry?: GeoPoint[];
  // Cache "Ton parcours habituel" (voir hooks/useFullRouteMatches.ts) — cloudId des autres
  // activités identifiées comme suivant le même trajet complet, évite de rescanner tout
  // l'historique à chaque ouverture. Mis à jour réciproquement sur chaque activité du groupe
  // à chaque scan complet.
  routeMatchIds?: string[];
  routeMatchScannedAt?: string; // ISO — dernière fois qu'un scan complet a été fait pour cette activité
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

/**
 * Ajoute (ou rafraîchit) une entrée dans l'ancien index Drive (activities-index.json) en réutilisant
 * un fichier déjà uploadé par le flux hybride Firestore (`fileId`) — aucun second upload, juste un
 * filet de sécurité indépendant de Firestore (voir useFirebaseCloud.ts → save). Remplace l'ancien
 * bouton "Exporter (Drive)" séparé, qui uploadait un second fichier en double — fusionné dans la
 * sauvegarde principale à la demande de Greg (2026-08-27, deux boutons de sauvegarde jugés confus).
 */
export async function mirrorToLegacyIndex(
  token: string,
  fileId: string,
  entry: Omit<ActivityIndexEntry, 'fileId'>,
): Promise<void> {
  const folderId = await getOrCreateFolder(token);
  const { id: indexId, data: index } = await loadIndex(token, folderId);

  // Match by date+name first; fall back to date+fileName to handle renames
  let existingIdx = index.activities.findIndex(a => a.date === entry.date && a.name === entry.name);
  if (existingIdx < 0) {
    existingIdx = index.activities.findIndex(a => a.date === entry.date && a.fileName === entry.fileName);
  }

  if (existingIdx >= 0) {
    index.activities[existingIdx] = { ...index.activities[existingIdx], ...entry, fileId };
  } else {
    index.activities.unshift({ ...entry, fileId });
  }
  await saveIndex(token, folderId, indexId, index);
}

// ── Fichier brut isolé — utilisé par la solution hybride cloud (métadonnées Firestore) ────────
// N'écrit/lit jamais activities-index.json, contrairement à uploadActivity/fetchActivityList.

/** Upload un fichier brut (GPX/FIT) sur Drive sans toucher à l'index ; retourne l'id du fichier créé. */
export async function uploadRawFileToDrive(token: string, rawData: string | ArrayBuffer, fileName: string): Promise<string> {
  const folderId = await getOrCreateFolder(token);
  const isFit = fileName.toLowerCase().endsWith('.fit');
  const mime = isFit ? 'application/octet-stream' : 'application/gpx+xml';
  const boundary = 'gpxanalyzer_cloudfile_141421';
  const fileMeta = { name: fileName, parents: [folderId], mimeType: mime };
  const fileBody = buildMultipart(boundary, fileMeta, rawData, mime);
  const r = await req(`${BASE}/upload/drive/v3/files?uploadType=multipart&fields=id`, token, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
    body: fileBody,
  });
  const { id } = await r.json() as { id: string };
  return id;
}

/** Supprime un fichier brut sur Drive par son id, sans toucher à l'index — best-effort. */
export async function deleteRawFileFromDrive(token: string, fileId: string): Promise<void> {
  try {
    await req(`${BASE}/drive/v3/files/${fileId}`, token, { method: 'DELETE' });
  } catch {
    // Déjà supprimé ou inaccessible — on continue
  }
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

/** Supprime une activité de l'index Drive legacy : efface le fichier GPX/FIT et la retire de l'index. */
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
}
