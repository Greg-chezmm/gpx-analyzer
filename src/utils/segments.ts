import { calculateDistance, parseGPX, type GPXTrackPoint } from './gpxCore';

/** Forme géométrique minimale requise pour le matching — un GPXTrackPoint la satisfait déjà (structural typing). */
export interface GeoPoint { lat: number; lon: number; distFromStart: number; }

// ─── Empreinte géographique — pré-filtrage bon marché entre activités ──────────
//
// Un geohash (précision 7 ≈ cellule de 150m x 150m) est calculé pour des points
// échantillonnés tous les ~25m le long du tracé. Comparer deux empreintes (simple
// intersection d'ensembles) coûte quasi rien et évite de télécharger/parser le
// fichier complet de chaque activité de l'historique avant de savoir si elle vaut
// le coup d'être comparée finement (voir useRecurringSegments.ts).

const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const FINGERPRINT_PRECISION = 7;
const FINGERPRINT_STEP_M = 25;

/** Encode une coordonnée GPS en geohash (précision = nombre de caractères). */
export function geohashEncode(lat: number, lon: number, precision = FINGERPRINT_PRECISION): string {
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  let hash = '';
  let bit = 0, ch = 0, evenBit = true;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) { ch |= (1 << (4 - bit)); lonMin = mid; } else { lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { ch |= (1 << (4 - bit)); latMin = mid; } else { latMax = mid; }
    }
    evenBit = !evenBit;
    if (bit < 4) {
      bit++;
    } else {
      hash += GEOHASH_BASE32[ch];
      bit = 0; ch = 0;
    }
  }
  return hash;
}

/** Calcule l'empreinte géographique d'un tracé : ensemble dédupliqué de cellules geohash traversées. */
export function computeFingerprint(points: GeoPoint[]): string[] {
  const cells = new Set<string>();
  let lastDist = -Infinity;
  for (const p of points) {
    if (p.distFromStart - lastDist < FINGERPRINT_STEP_M) continue;
    lastDist = p.distFromStart;
    cells.add(geohashEncode(p.lat, p.lon));
  }
  return Array.from(cells);
}

/** Score de recouvrement entre deux empreintes (coefficient de chevauchement, 0-1) — tolère qu'un tracé soit un sous-ensemble de l'autre. */
export function fingerprintOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let inter = 0;
  for (const c of a) if (setB.has(c)) inter++;
  return inter / Math.min(a.length, b.length);
}

// ─── Matching précis — recherche du plus long corridor commun entre deux tracés ────

const RESAMPLE_STEP_M = 20;
const CORRIDOR_TOLERANCE_M = 30;
const DIRECTION_TOLERANCE_DEG = 55;
const MAX_GAP_POINTS = 4;
const MIN_SEGMENT_DISTANCE_M = 300;
const GRID_CELL_DEG = 0.005; // ~550m — bucket de pré-filtrage spatial pour le matching

interface ResampledPoint { lat: number; lon: number; dist: number; origIndex: number; }

/** Rééchantillonne un tracé à distance cumulée fixe, en conservant l'index d'origine pour retrouver les bornes exactes ensuite. */
function resampleByDistance(points: GeoPoint[], stepMeters: number): ResampledPoint[] {
  const out: ResampledPoint[] = [];
  let nextDist = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.distFromStart >= nextDist) {
      out.push({ lat: p.lat, lon: p.lon, dist: p.distFromStart, origIndex: i });
      nextDist = p.distFromStart + stepMeters;
    }
  }
  return out;
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180, phi2 = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Cap local en chaque point rééchantillonné (vers le point suivant, ou depuis le précédent pour le dernier). */
function localBearings(rs: ResampledPoint[]): number[] {
  return rs.map((p, i) => {
    if (i < rs.length - 1) return bearingDeg(p.lat, p.lon, rs[i + 1].lat, rs[i + 1].lon);
    const prev = rs[i - 1];
    return prev ? bearingDeg(prev.lat, prev.lon, p.lat, p.lon) : 0;
  });
}

function gridKey(lat: number, lon: number): string {
  return `${Math.floor(lat / GRID_CELL_DEG)}_${Math.floor(lon / GRID_CELL_DEG)}`;
}

/** Index spatial grossier (grille ~550m) pour borner la recherche de correspondance à un voisinage local plutôt qu'à tout le tracé. */
function buildGridIndex(rs: ResampledPoint[]): Map<string, number[]> {
  const idx = new Map<string, number[]>();
  rs.forEach((p, i) => {
    const key = gridKey(p.lat, p.lon);
    const bucket = idx.get(key);
    if (bucket) bucket.push(i); else idx.set(key, [i]);
  });
  return idx;
}

function neighborIndices(idx: Map<string, number[]>, lat: number, lon: number): number[] {
  const cLat = Math.floor(lat / GRID_CELL_DEG), cLon = Math.floor(lon / GRID_CELL_DEG);
  const out: number[] = [];
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLon = -1; dLon <= 1; dLon++) {
      const bucket = idx.get(`${cLat + dLat}_${cLon + dLon}`);
      if (bucket) out.push(...bucket);
    }
  }
  return out;
}

interface MatchResult { aStart: number; aEnd: number; bStart: number; bEnd: number; }

/**
 * Trouve le plus long corridor commun entre deux tracés : rééchantillonnage à pas fixe,
 * appariement point-à-point (tolérance ~30m + cap cohérent à ±55° pour ignorer un aller-retour
 * sur le même chemin), puis extraction de la plus longue plage globalement croissante côté B
 * (tolère de petits trous GPS jusqu'à MAX_GAP_POINTS points consécutifs non appariés).
 */
function findLongestMatch(pointsA: GeoPoint[], pointsB: GeoPoint[], minDistanceM = MIN_SEGMENT_DISTANCE_M): MatchResult | null {
  const rsA = resampleByDistance(pointsA, RESAMPLE_STEP_M);
  const rsB = resampleByDistance(pointsB, RESAMPLE_STEP_M);
  if (rsA.length < 5 || rsB.length < 5) return null;

  const bearA = localBearings(rsA);
  const bearB = localBearings(rsB);
  const gridB = buildGridIndex(rsB);

  const matchB: number[] = rsA.map((pa, i) => {
    let best = -1, bestDist = CORRIDOR_TOLERANCE_M;
    for (const j of neighborIndices(gridB, pa.lat, pa.lon)) {
      const pb = rsB[j];
      const d = calculateDistance(pa.lat, pa.lon, pb.lat, pb.lon);
      if (d < bestDist && angleDiff(bearA[i], bearB[j]) < DIRECTION_TOLERANCE_DEG) {
        bestDist = d; best = j;
      }
    }
    return best;
  });

  interface Run { aStart: number; aEnd: number; bMin: number; bMax: number; dist: number; }
  const runs: Run[] = [];
  let cur: { aStart: number; aEnd: number; bLast: number; bMin: number; bMax: number; gaps: number } | null = null;

  const flush = () => {
    if (cur) runs.push({ aStart: cur.aStart, aEnd: cur.aEnd, bMin: cur.bMin, bMax: cur.bMax, dist: rsA[cur.aEnd].dist - rsA[cur.aStart].dist });
  };

  for (let i = 0; i < matchB.length; i++) {
    const b = matchB[i];
    if (b < 0) {
      if (cur) {
        cur.gaps++;
        if (cur.gaps > MAX_GAP_POINTS) { flush(); cur = null; }
      }
      continue;
    }
    if (!cur) {
      cur = { aStart: i, aEnd: i, bLast: b, bMin: b, bMax: b, gaps: 0 };
    } else if (b >= cur.bLast - 2) {
      cur.aEnd = i; cur.bLast = b; cur.bMin = Math.min(cur.bMin, b); cur.bMax = Math.max(cur.bMax, b); cur.gaps = 0;
    } else {
      flush();
      cur = { aStart: i, aEnd: i, bLast: b, bMin: b, bMax: b, gaps: 0 };
    }
  }
  flush();

  const valid = runs.filter(r => r.dist >= minDistanceM);
  if (valid.length === 0) return null;
  const best = valid.reduce((a, b) => (b.dist > a.dist ? b : a));

  return {
    aStart: rsA[best.aStart].origIndex,
    aEnd: rsA[best.aEnd].origIndex,
    bStart: rsB[best.bMin].origIndex,
    bEnd: rsB[best.bMax].origIndex,
  };
}

// ─── Agrégation multi-activités ─────────────────────────────────────────────────

/** Un passage individuel sur un segment récurrent — l'activité courante ou une activité passée. */
export interface SegmentAttempt {
  /** Tracé complet de l'activité (pour l'affichage carte via SegmentMapModal, qui attend le tracé entier + bornes). */
  points: GPXTrackPoint[];
  startIndex: number;
  endIndex: number;
  distance: number; // m
  duration: number;  // s
  avgPace: number;   // s/km
  avgSpeed: number;  // km/h
  avgHR: number | null;
  elevGain: number;  // m
  date: string;      // "YYYY-MM-DD"
  isCurrent: boolean;
}

/** Un segment détecté comme récurrent, avec tous les passages connus triés du plus rapide au plus lent. */
export interface RecurringSegment {
  id: string;
  distance: number; // m — référence (passage courant)
  elevGain: number; // m — référence (passage courant)
  attempts: SegmentAttempt[];
}

/** Source minimale nécessaire pour comparer/agréger une activité — découplé du modèle de stockage cloud. */
export interface SegmentSource {
  points: GPXTrackPoint[];
  date: string;
}

function buildAttempt(points: GPXTrackPoint[], startIndex: number, endIndex: number, date: string, isCurrent: boolean): SegmentAttempt {
  const slice = points.slice(startIndex, endIndex + 1);
  const distance = slice.length > 1 ? slice[slice.length - 1].distFromStart - slice[0].distFromStart : 0;

  const t0 = slice[0]?.time, t1 = slice[slice.length - 1]?.time;
  let duration: number;
  if (t0 && t1) {
    duration = (t1.getTime() - t0.getTime()) / 1000;
  } else {
    const speeds = slice.map(p => p.speed ?? 0).filter(s => s > 0);
    const meanSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    duration = meanSpeed > 0 ? distance / meanSpeed : 0;
  }

  const hrPts = slice.filter(p => p.hr !== null);
  const avgHR = hrPts.length > 0 ? Math.round(hrPts.reduce((a, p) => a + p.hr!, 0) / hrPts.length) : null;

  let elevGain = 0;
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1].ele, cur = slice[i].ele;
    if (prev !== null && cur !== null && cur > prev) elevGain += cur - prev;
  }

  return {
    points, startIndex, endIndex, distance, duration,
    avgPace: distance > 0 ? duration / (distance / 1000) : 0,
    avgSpeed: duration > 0 ? (distance / duration) * 3.6 : 0,
    avgHR, elevGain, date, isCurrent,
  };
}

/**
 * Compare l'activité courante à une liste de candidates et regroupe les correspondances
 * en segments récurrents. Un seul (le plus long) corridor commun est retenu par paire —
 * une activité qui repasse deux fois par le même tronçon (boucle) ne produira qu'un match.
 */
export function detectRecurringSegments(current: SegmentSource, others: SegmentSource[]): RecurringSegment[] {
  const matches = others
    .map(other => ({ other, match: findLongestMatch(current.points, other.points) }))
    .filter((x): x is { other: SegmentSource; match: MatchResult } => x.match !== null);

  if (matches.length === 0) return [];

  // Regroupe les correspondances dont la plage côté activité courante se chevauche fortement
  // (même tronçon détecté via plusieurs candidates) en un seul RecurringSegment. La plage de
  // référence d'un groupe est FIXÉE au premier match qui l'a créé (le plus long, cf. tri
  // ci-dessous) et n'est plus jamais élargie ensuite — sinon un chaînage progressif (A~B, B~C,
  // C~D...) peut regrouper des tronçons de longueurs très différentes qui ne se recouvrent pas
  // vraiment entre eux (bug observé : un passage de 700m agrégé avec des passages de 18km).
  const sortedMatches = [...matches].sort((a, b) => (b.match.aEnd - b.match.aStart) - (a.match.aEnd - a.match.aStart));
  interface Group { aStart: number; aEnd: number; items: typeof matches; }
  const groups: Group[] = [];
  for (const item of sortedMatches) {
    const { aStart, aEnd } = item.match;
    const g = groups.find(g => {
      const overlap = Math.min(aEnd, g.aEnd) - Math.max(aStart, g.aStart);
      const shorter = Math.min(aEnd - aStart, g.aEnd - g.aStart);
      return overlap > 0 && shorter > 0 && overlap / shorter > 0.5;
    });
    if (g) {
      g.items.push(item);
    } else {
      groups.push({ aStart, aEnd, items: [item] });
    }
  }

  return groups.map((g, idx) => {
    const currentAttempt = buildAttempt(current.points, g.aStart, g.aEnd, current.date, true);
    const otherAttempts = g.items.map(item =>
      buildAttempt(item.other.points, item.match.bStart, item.match.bEnd, item.other.date, false)
    );
    const attempts = [currentAttempt, ...otherAttempts].sort((a, b) => a.duration - b.duration);
    return { id: `seg-${idx}`, distance: currentAttempt.distance, elevGain: currentAttempt.elevGain, attempts };
  });
}

// ─── Segments définis manuellement ──────────────────────────────────────────────
//
// À la différence de la détection automatique (qui découvre des tronçons récurrents en
// comparant l'activité courante à l'historique), un segment manuel a une géométrie de
// référence FIXE, choisie une fois par l'utilisateur (deux clics sur la carte) et persistée.
// Comparer une activité à ce segment est donc un matching à sens unique (référence → candidate),
// pas une découverte par regroupement — beaucoup plus simple, voir matchStoredSegment ci-dessous.

/** Géométrie + métadonnées calculées à la création d'un segment manuel, prêtes à persister. */
export interface SegmentGeometry {
  points: GeoPoint[];
  distance: number; // m
  elevGain: number; // m
  fingerprint: string[];
}

/** Construit la géométrie de référence d'un segment manuel à partir d'une plage [startIndex, endIndex] de l'activité où il a été défini. */
export function buildSegmentGeometry(points: GPXTrackPoint[], startIndex: number, endIndex: number): SegmentGeometry {
  const slice = points.slice(startIndex, endIndex + 1);
  const geoPoints: GeoPoint[] = slice.map(p => ({ lat: p.lat, lon: p.lon, distFromStart: p.distFromStart }));
  const distance = slice.length > 1 ? slice[slice.length - 1].distFromStart - slice[0].distFromStart : 0;
  let elevGain = 0;
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1].ele, cur = slice[i].ele;
    if (prev !== null && cur !== null && cur > prev) elevGain += cur - prev;
  }
  return { points: geoPoints, distance, elevGain, fingerprint: computeFingerprint(geoPoints) };
}

/**
 * Compare une activité (courante ou historique) à la géométrie de référence d'un segment manuel.
 * Le seuil de distance minimale s'adapte à la longueur du segment (60% de sa distance, au moins
 * 100m) — les segments courts définis à la main ne doivent pas être rejetés par le seuil global
 * de 300m utilisé pour la détection automatique.
 */
export function matchStoredSegment(
  refPoints: GeoPoint[], refDistance: number, candidate: SegmentSource, isCurrent = false,
): SegmentAttempt | null {
  const minDistanceM = Math.max(100, refDistance * 0.6);
  const match = findLongestMatch(refPoints, candidate.points, minDistanceM);
  if (!match) return null;
  return buildAttempt(candidate.points, match.bStart, match.bEnd, candidate.date, isCurrent);
}

/** Parse un fichier brut (GPX texte ou FIT binaire) en points enrichis — utilisé pour reconstruire une activité historique le temps du matching. */
export async function parseActivityRawToPoints(raw: string | ArrayBuffer, fileName: string): Promise<GPXTrackPoint[]> {
  if (fileName.toLowerCase().endsWith('.fit') && raw instanceof ArrayBuffer) {
    const { parseFIT } = await import('./fitParser');
    const activity = await parseFIT(raw, fileName.replace(/\.fit$/i, ''));
    return activity.points;
  }
  return parseGPX(raw as string, fileName.replace(/\.[^/.]+$/, '')).points;
}
