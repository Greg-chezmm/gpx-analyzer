import { calculateDistance, parseGPX, type GPXTrackPoint } from './gpxCore';

/** Forme géométrique minimale requise pour le matching — un GPXTrackPoint la satisfait déjà (structural typing). */
export interface GeoPoint { lat: number; lon: number; distFromStart: number; }

// ─── Empreinte géographique — pré-filtrage bon marché entre activités ──────────
//
// Un geohash (précision 7 ≈ cellule de 150m x 150m) est calculé pour des points
// échantillonnés tous les ~25m le long du tracé. Comparer deux empreintes (simple
// intersection d'ensembles) coûte quasi rien et évite de télécharger/parser le
// fichier complet de chaque activité de l'historique avant de savoir si elle vaut
// le coup d'être comparée finement (voir useStoredSegmentScan.ts).

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
interface Run { aStart: number; aEnd: number; bMin: number; bMax: number; dist: number; }

/**
 * Rééchantillonnage + appariement point-à-point (tolérance ~30m + cap cohérent à ±55° pour ignorer
 * un aller-retour sur le même chemin) entre deux tracés, puis découpage en "runs" (plages
 * globalement croissantes côté B, tolérant de petits trous GPS jusqu'à MAX_GAP_POINTS points
 * consécutifs non appariés). Un trou plus grand qu'un aller-retour normal (ex. une boucle ajoutée
 * au milieu du trajet, un dropout GPS) termine un run et en démarre un nouveau — c'est pour ça
 * qu'un même trajet réel peut produire PLUSIEURS runs distincts, voir computeTotalCoverage.
 */
function computeRuns(pointsA: GeoPoint[], pointsB: GeoPoint[]): { rsA: ResampledPoint[]; rsB: ResampledPoint[]; runs: Run[] } | null {
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

  return { rsA, rsB, runs };
}

/**
 * Trouve le plus long corridor commun UNIQUE entre deux tracés (un seul run contigu) — utilisé pour
 * un segment manuel, où le passage doit être continu par définition (une montée n'est pas coupable
 * en deux morceaux séparés par un détour).
 */
function findLongestMatch(pointsA: GeoPoint[], pointsB: GeoPoint[], minDistanceM = MIN_SEGMENT_DISTANCE_M): MatchResult | null {
  const computed = computeRuns(pointsA, pointsB);
  if (!computed) return null;
  const { rsA, rsB, runs } = computed;

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

// Distance minimale d'UN run pour être compté dans une comparaison de trajet complet — bien plus
// bas que pour un segment, car ici on additionne PLUSIEURS runs : un détour au milieu du trajet
// (boucle ajoutée, coupure GPS) peut légitimement fragmenter le même trajet réel en plusieurs bouts.
const MIN_ROUTE_RUN_DISTANCE_M = 2 * RESAMPLE_STEP_M;

/**
 * Additionne la distance de TOUS les runs trouvés entre deux tracés (pas seulement le plus long) —
 * contrairement à findLongestMatch, on accepte qu'un même trajet réel soit fragmenté en plusieurs
 * morceaux par un détour ponctuel (boucle ajoutée, coupure GPS) sans perdre la couverture des
 * portions avant/après ce détour. Utilisé par matchFullRoute (comparaison de trajets complets).
 */
function computeTotalCoverage(pointsA: GeoPoint[], pointsB: GeoPoint[]): { distA: number; distB: number } | null {
  const computed = computeRuns(pointsA, pointsB);
  if (!computed) return null;
  const { rsB, runs } = computed;

  const valid = runs.filter(r => r.dist >= MIN_ROUTE_RUN_DISTANCE_M);
  if (valid.length === 0) return null;

  const distA = valid.reduce((s, r) => s + r.dist, 0);
  const distB = valid.reduce((s, r) => s + (rsB[r.bMax].dist - rsB[r.bMin].dist), 0);
  return { distA, distB };
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

/** Source minimale nécessaire pour comparer/agréger une activité — découplé du modèle de stockage cloud. */
export interface SegmentSource {
  points: GPXTrackPoint[];
  date: string;
}

/**
 * Version allégée d'un passage, persistable sur Firestore : géométrie déjà découpée (juste le
 * sous-tracé du passage, pas l'activité complète comme SegmentAttempt.points), sans les champs
 * volumineux (ele/hr/time/etc de tous les points). Sert à la fois de cache de leaderboard (top 10
 * persisté par segment, voir StoredSegment.attempts) et de format d'affichage unifié — la carte
 * (SegmentMapModal) n'a jamais eu besoin de plus que lat/lon.
 */
export interface CachedSegmentAttempt {
  points: { lat: number; lon: number }[];
  date: string;
  duration: number;
  avgPace: number;
  avgSpeed: number;
  avgHR: number | null;
  distance: number;
  elevGain: number;
  isCurrent: boolean;
}

/** Convertit un passage calculé en direct (référence à l'activité complète) en format cache/affichage léger. */
export function toCachedAttempt(a: SegmentAttempt): CachedSegmentAttempt {
  const slice = a.points.slice(a.startIndex, a.endIndex + 1);
  return {
    points: slice.map(p => ({ lat: p.lat, lon: p.lon })),
    date: a.date, duration: a.duration, avgPace: a.avgPace, avgSpeed: a.avgSpeed,
    avgHR: a.avgHR, distance: a.distance, elevGain: a.elevGain, isCurrent: a.isCurrent,
  };
}

/** Construit un passage à partir d'une plage [startIndex, endIndex] de points — partagé par le matching segment et trajet complet. */
export function buildAttempt(points: GPXTrackPoint[], startIndex: number, endIndex: number, date: string, isCurrent: boolean): SegmentAttempt {
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

// ─── Segments définis manuellement ──────────────────────────────────────────────
//
// Un segment a une géométrie de référence FIXE, choisie une fois par l'utilisateur (deux clics
// sur la carte ou le graphique) et persistée sur Firestore. Comparer une activité à ce segment
// est un matching à sens unique (référence → candidate), voir matchStoredSegment ci-dessous.

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

// ─── Comparaison de trajets complets ─────────────────────────────────────────────
//
// À la différence d'un segment (un tronçon choisi, comparaison à sens unique), on cherche ici si
// une activité passée suit sensiblement le MÊME trajet complet que l'activité courante, dans le
// MÊME sens de parcours (le cap ±55° de findLongestMatch exclut déjà les allers-retours/sens
// inverse — comportement voulu). Seuil calibré empiriquement (2026-08-26, données réelles Greg) :
// - Un même trajet interrompu par un court détour (ex. boucle de 500m ajoutée sur un total de
//   18,7km) donne ~97% de recouvrement une fois les runs additionnés (voir computeTotalCoverage) —
//   doit matcher.
// - Une variante "rallongée" du même trajet de base (~4km de plus sur ~22km, nommée différemment
//   par l'utilisateur) donne ~80-82% de recouvrement côté long trajet — NE doit PAS matcher, c'est
//   une variante distincte, pas juste une petite variation du même trajet.
// 90% sépare correctement ces deux cas. Bien au-dessus du seuil pathologique (25% pour une boucle
// 2 fois plus longue contenant une boucle courte) qu'on veut aussi exclure.
const FULL_ROUTE_COVERAGE = 0.9;

/**
 * Compare deux trajets complets parcourus dans le même sens ; retourne le passage correspondant
 * (l'activité `candidate` en entier — une fois confirmé qu'il s'agit du même trajet, ses propres
 * stats sont plus parlantes qu'une sous-plage) si la couverture cumulée (somme de tous les runs
 * trouvés, voir computeTotalCoverage) atteint au moins `FULL_ROUTE_COVERAGE` de la distance totale
 * des DEUX activités, sinon `null`. Le seuil est appliqué symétriquement pour éviter les faux
 * positifs "sous-trajet". Additionner plusieurs runs (plutôt que le seul plus long) est nécessaire
 * pour ne pas rater un trajet par ailleurs identique, mais interrompu par un détour ponctuel
 * (boucle ajoutée, coupure GPS) — sinon un même trajet réel peut apparaître fragmenté en deux
 * moitiés dont aucune ne dépasse le seuil individuellement.
 */
export function matchFullRoute(current: SegmentSource, candidate: SegmentSource, isCurrent = false): SegmentAttempt | null {
  const totalCurrent = current.points[current.points.length - 1]?.distFromStart ?? 0;
  const totalCandidate = candidate.points[candidate.points.length - 1]?.distFromStart ?? 0;
  if (totalCurrent <= 0 || totalCandidate <= 0) return null;

  const coverage = computeTotalCoverage(current.points, candidate.points);
  if (!coverage) return null;
  if (coverage.distA / totalCurrent < FULL_ROUTE_COVERAGE) return null;
  if (coverage.distB / totalCandidate < FULL_ROUTE_COVERAGE) return null;

  return buildAttempt(candidate.points, 0, candidate.points.length - 1, candidate.date, isCurrent);
}

/** Diagnostic d'une comparaison de trajet — pourquoi une candidate a (ou n'a pas) été retenue. */
export interface RouteCoverageDebug {
  /** Au moins un run a été trouvé, même si la couverture cumulée ne passe pas le seuil ensuite. */
  found: boolean;
  coverageCurrent: number;   // 0-1
  coverageCandidate: number; // 0-1
}

/**
 * Rejoue la comparaison et retourne les taux de couverture cumulée bruts — utilisé pour comprendre
 * pourquoi une candidate qui semblait plausible (même distance, empreinte proche) n'a finalement
 * pas matché : aucun corridor commun du tout (found=false) ou recouvrement réel mais sous le seuil
 * (found=true, ex. un vrai détour partiel plutôt qu'une simple fragmentation GPS).
 */
export function debugRouteCoverage(current: SegmentSource, candidate: SegmentSource): RouteCoverageDebug {
  const totalCurrent = current.points[current.points.length - 1]?.distFromStart ?? 0;
  const totalCandidate = candidate.points[candidate.points.length - 1]?.distFromStart ?? 0;
  if (totalCurrent <= 0 || totalCandidate <= 0) return { found: false, coverageCurrent: 0, coverageCandidate: 0 };

  const coverage = computeTotalCoverage(current.points, candidate.points);
  if (!coverage) return { found: false, coverageCurrent: 0, coverageCandidate: 0 };
  return { found: true, coverageCurrent: coverage.distA / totalCurrent, coverageCandidate: coverage.distB / totalCandidate };
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
