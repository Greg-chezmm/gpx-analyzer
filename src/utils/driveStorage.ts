export interface ActivityIndexEntry {
  fileId: string | null;
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
}

interface DriveIndex {
  version: 1;
  folderId: string;
  activities: ActivityIndexEntry[];
}

const INDEX_NAME = 'activities-index.json';
const FOLDER_NAME = 'GPX Analyzer';
const BASE = 'https://www.googleapis.com';

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

async function loadIndex(token: string, folderId: string): Promise<{ id: string | null; data: DriveIndex }> {
  const q = encodeURIComponent(`name='${INDEX_NAME}' and '${folderId}' in parents and trashed=false`);
  const r = await req(`${BASE}/drive/v3/files?q=${q}&fields=files(id)`, token);
  const { files } = await r.json() as { files: { id: string }[] };

  if (files.length === 0) return { id: null, data: { version: 1, folderId, activities: [] } };

  const r2 = await req(`${BASE}/drive/v3/files/${files[0].id}?alt=media`, token);
  return { id: files[0].id, data: await r2.json() as DriveIndex };
}

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

export async function fetchActivityList(token: string): Promise<ActivityIndexEntry[]> {
  const folderId = await getOrCreateFolder(token);
  const { data } = await loadIndex(token, folderId);
  return data.activities;
}

export async function fetchActivityFile(token: string, fileId: string, fileName: string): Promise<ArrayBuffer | string> {
  const r = await req(`${BASE}/drive/v3/files/${fileId}?alt=media`, token);
  if (fileName.toLowerCase().endsWith('.fit')) return r.arrayBuffer();
  return r.text();
}

// ── Training history (TSB/CTL/ATL) ───────────────────────────────────

export interface DriveTrainingEntry {
  date: string;
  trimp: number;
  name: string;
}

const HISTORY_NAME = 'training-history.json';

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

export async function saveTrainingHistory(token: string, history: DriveTrainingEntry[]): Promise<void> {
  const folderId = await getOrCreateFolder(token);
  await saveJsonFile(token, folderId, HISTORY_NAME, history);
}

export async function fetchTrainingHistory(token: string): Promise<DriveTrainingEntry[]> {
  const folderId = await getOrCreateFolder(token);
  const data = await loadJsonFile<DriveTrainingEntry[]>(token, folderId, HISTORY_NAME);
  return data ?? [];
}
