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
// Un point rééchantillonné de A avance normalement d'environ 1 cran de B à chaque pas (même pas de
// rééchantillonnage des deux côtés) — un saut en avant bien plus grand signale que l'appariement a
// "sauté" vers un endroit du candidat déjà loin dans son propre parcours (carrefour/quartier
// recroisé), pas une continuité réelle du même passage.
const MAX_FORWARD_JUMP_POINTS = 5;
const MIN_SEGMENT_DISTANCE_M = 300;
const GRID_CELL_DEG = 0.005; // ~550m — bucket de pré-filtrage spatial pour le matching

interface ResampledPoint { lat: number; lon: number; dist: number; origIndex: number; }

/**
 * Rééchantillonne un tracé à distance cumulée fixe, en conservant l'index d'origine pour retrouver
 * les bornes exactes ensuite. `phase` ancre la grille d'échantillonnage sur une distance de référence
 * commune (généralement le premier point du tracé A) plutôt que sur 0 — sans ça, un segment qui
 * démarre à une distance arbitraire dans l'activité (pas un multiple rond du pas) produit une grille
 * décalée de quelques mètres par rapport à celle de l'activité complète ; sur une ligne droite ça ne
 * change rien, mais près d'un virage en épingle serré, ce décalage peut faire tomber le point
 * échantillonné juste avant ou juste après l'épingle côté A vs côté B, donnant un cap local très
 * différent pour ce qui est pourtant le même point physique — fragmentant la comparaison inutilement.
 */
function resampleByDistance(points: GeoPoint[], stepMeters: number, phase = 0): ResampledPoint[] {
  const out: ResampledPoint[] = [];
  if (points.length === 0) return out;
  const start = points[0].distFromStart;
  let nextDist = start - (((start - phase) % stepMeters + stepMeters) % stepMeters);
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
 * Rééchantillonne les deux tracés (même pas, même phase) et apparie chaque point de A au point de B
 * le plus cohérent avec la progression en cours (-1 si aucun) — factorisé entre `computeRuns` et
 * `debugSegmentPointMatches` (visualisation carte des points non appariés).
 *
 * Le choix du "meilleur" candidat B ne se limite pas à la plus courte distance géométrique : sur un
 * virage en épingle serré, deux jambes parallèles proches (ex. l'aller et le retour d'un grand lacet)
 * peuvent chacune satisfaire corridor+cap pour un même point de A, et la plus proche des deux peut
 * basculer d'un point à l'autre — ce ping-pong fragmente artificiellement le passage en une multitude
 * de micro-runs sous le seuil minimal (`MIN_ROUTE_RUN_DISTANCE_M`), même si CHAQUE point pris
 * individuellement trouve bien une correspondance (bug réel constaté : 100% des points appariés
 * individuellement, mais seulement ~40% de couverture cumulée après reconstruction des runs). Une
 * pénalité de progression (`PROGRESS_PENALTY_M_PER_POINT`) favorise le candidat qui continue le run
 * en cours plutôt que le plus proche dans l'absolu, sans empêcher un vrai redémarrage après un trou.
 */
const PROGRESS_PENALTY_M_PER_POINT = 4;

// Plafond dur sur l'écart d'index par rapport à `expectedB` — au-delà, un candidat n'est même pas
// considéré, quels que soient corridor/cap. Sans ça, la pénalité de progression ne fait que
// départager entre candidats déjà valides : si le VRAI point de continuité est rejeté par le filtre
// corridor/cap (ex. inversion brutale de direction au sommet d'une épingle), le seul candidat restant
// peut être un point géographiquement proche mais très loin dans le tracé candidat (ex. la descente
// d'un aller-retour qui repasse près de ce même endroit) — bug réel constaté : 4 points au sommet
// d'un lacet appariés à un endroit à ~1199m de distance le long du candidat, coupant le corridor en
// deux au lieu de laisser ces quelques points sans correspondance (tolérés par MAX_GAP_POINTS).
const MAX_PROGRESS_GAP_POINTS = 10;

// Si `expectedB` reste sans le moindre candidat valide pendant plusieurs points d'affilée, l'ancre
// elle-même est probablement fausse (ex. le tout premier point du segment, i=0, où il n'existe encore
// aucune continuité pour départager une ambiguïté géométrique locale, s'est accroché au mauvais
// endroit) — sans réinitialisation, le plafond dur ci-dessus bloque alors TOUS les points suivants
// dans une fenêtre proche de cette ancre erronée, avec 0% de couverture au lieu de "juste" quelques
// points perdus (bug réel constaté : une activité valide, 0/25 points appariés). Après plusieurs
// échecs consécutifs, on relâche l'ancrage pour permettre une recherche globale au point suivant.
const MAX_PROGRESS_MISS_STREAK = 5;

function computeMatchIndices(pointsA: GeoPoint[], pointsB: GeoPoint[]): { rsA: ResampledPoint[]; rsB: ResampledPoint[]; matchB: number[] } | null {
  // Pas de rééchantillonnage adaptatif à la longueur de A (la référence, généralement la plus
  // courte pour un segment manuel) — avec le pas fixe de 20m, un segment de ~60-80m produit moins
  // de 5 points rééchantillonnés et échoue à se faire correspondre à lui-même (bug réel constaté :
  // segment créé mais invisible même sur l'activité d'origine). Reste à 20m pour les tracés longs
  // (trajets complets), inchangé.
  const spanA = pointsA.length > 1 ? pointsA[pointsA.length - 1].distFromStart - pointsA[0].distFromStart : 0;
  const stepMeters = spanA > 0 ? Math.min(RESAMPLE_STEP_M, Math.max(2, spanA / 10)) : RESAMPLE_STEP_M;

  // Même phase des deux côtés (ancrée sur le premier point de A) — voir le commentaire de resampleByDistance.
  const phase = pointsA[0]?.distFromStart ?? 0;
  const rsA = resampleByDistance(pointsA, stepMeters, phase);
  const rsB = resampleByDistance(pointsB, stepMeters, phase);
  if (rsA.length < 5 || rsB.length < 5) return null;

  const bearA = localBearings(rsA);
  const bearB = localBearings(rsB);
  const gridB = buildGridIndex(rsB);

  const matchB: number[] = [];
  let expectedB: number | null = null;
  let missStreak = 0;
  for (let i = 0; i < rsA.length; i++) {
    const pa = rsA[i];
    let best = -1, bestScore = Infinity;
    for (const j of neighborIndices(gridB, pa.lat, pa.lon)) {
      const pb = rsB[j];
      const d = calculateDistance(pa.lat, pa.lon, pb.lat, pb.lon);
      if (d >= CORRIDOR_TOLERANCE_M) continue;
      if (angleDiff(bearA[i], bearB[j]) >= DIRECTION_TOLERANCE_DEG) continue;
      const progressGap = expectedB !== null ? Math.abs(j - expectedB) : 0;
      if (expectedB !== null && progressGap > MAX_PROGRESS_GAP_POINTS) continue;
      const score = d + progressGap * PROGRESS_PENALTY_M_PER_POINT;
      if (score < bestScore) { bestScore = score; best = j; }
    }
    matchB.push(best);
    if (best >= 0) {
      expectedB = best + 1;
      missStreak = 0;
    } else if (expectedB !== null) {
      missStreak++;
      if (missStreak > MAX_PROGRESS_MISS_STREAK) expectedB = null;
    }
  }

  return { rsA, rsB, matchB };
}

function computeRuns(pointsA: GeoPoint[], pointsB: GeoPoint[]): { rsA: ResampledPoint[]; rsB: ResampledPoint[]; runs: Run[] } | null {
  const computed = computeMatchIndices(pointsA, pointsB);
  if (!computed) return null;
  const { rsA, rsB, matchB } = computed;

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
    } else if (b >= cur.bLast - 2 && b <= cur.bLast + MAX_FORWARD_JUMP_POINTS) {
      cur.aEnd = i; cur.bLast = b; cur.bMin = Math.min(cur.bMin, b); cur.bMax = Math.max(cur.bMax, b); cur.gaps = 0;
    } else {
      // Un saut en avant trop grand (ex. le candidat repasse par un carrefour/quartier déjà visité
      // bien plus tôt dans son propre parcours) n'est pas non plus une continuité valide — sans cette
      // borne, seuls les reculs étaient rejetés, laissant un run s'étendre arbitrairement loin sur le
      // candidat tant que l'appariement ne recule jamais (bug réel : segment de 544m rapportant des
      // "passages" de plusieurs km).
      flush();
      cur = { aStart: i, aEnd: i, bLast: b, bMin: b, bMax: b, gaps: 0 };
    }
  }
  flush();

  return { rsA, rsB, runs };
}

/** Un point rééchantillonné du segment de référence, avec le numéro du corridor (run) auquel il appartient — pour visualisation. */
export interface SegmentPointRun { lat: number; lon: number; runIndex: number | null }

/**
 * Rejoue la reconstruction des corridors (`computeRuns`) et retourne, pour chaque point rééchantillonné
 * du segment, le numéro du run auquel il a été rattaché (null si aucun) — contrairement à
 * `debugSegmentPointMatches` (juste "a une correspondance ou non"), révèle où le suivi de continuité
 * fragmente le passage en plusieurs runs séparés, même quand chaque point pris individuellement matche.
 */
export function debugSegmentPointRuns(refPoints: GeoPoint[], candidatePoints: GeoPoint[]): SegmentPointRun[] {
  const computed = computeRuns(refPoints, candidatePoints);
  if (!computed) return [];
  const { rsA, runs } = computed;
  const runIndexByA: (number | null)[] = new Array(rsA.length).fill(null);
  runs.forEach((run, idx) => {
    for (let i = run.aStart; i <= run.aEnd; i++) runIndexByA[i] = idx;
  });
  return rsA.map((p, i) => ({ lat: p.lat, lon: p.lon, runIndex: runIndexByA[i] }));
}

// Distance minimale d'UN run pour être compté dans une comparaison fragmentée (trajet complet OU
// segment manuel) — bien plus bas que le seuil global, car on additionne PLUSIEURS runs : un détour
// ponctuel (boucle ajoutée, coupure GPS) ou une géométrie en lacets (montée en épingles) peut
// légitimement fragmenter un même passage réel en plusieurs bouts sans que ce soit un vrai détour.
const MIN_ROUTE_RUN_DISTANCE_M = 2 * RESAMPLE_STEP_M;

// Écart maximal (le long du tracé candidat, en mètres) toléré entre deux runs pour les considérer
// comme le MÊME passage fragmenté (ex. lacets d'une montée) plutôt que deux coïncidences
// géométriques distinctes ailleurs sur une activité plus longue. Volontairement petit : un vrai
// passage fragmenté par sa propre géométrie reste très localisé (quelques dizaines de mètres),
// contrairement à des correspondances éparpillées sur plusieurs centaines de mètres/km.
const MAX_SEGMENT_CLUSTER_GAP_M = 150;

// Contrairement à MIN_ROUTE_RUN_DISTANCE_M (utilisé pour computeTotalCoverage), un run individuel
// n'a pas besoin d'être significatif pour compter dans le regroupement d'un segment manuel — même un
// fragment d'un seul point (~20m) près d'un virage serré fait partie du même passage réel une fois
// regroupé par proximité (MAX_SEGMENT_CLUSTER_GAP_M). Le exigeait 40m par run AVANT regroupement
// rejetait ces petits fragments avant même qu'ils puissent se recoller, perdant de la couverture
// réelle malgré des points individuellement bien appariés (voir debugSegmentPointMatches).
const MIN_SEGMENT_RUN_DISTANCE_M = 0;

interface ClusterResult { dist: number; aStart: number; aEnd: number; bMin: number; bMax: number; runCount: number }
interface ClusterGroups { clusters: ClusterResult[]; runGapsM: number[] }

/**
 * Regroupe les runs valides par proximité le long du tracé candidat (voir `MAX_SEGMENT_CLUSTER_GAP_M`)
 * — retourne tous les groupes formés (pas seulement le meilleur) ainsi que les écarts entre runs
 * consécutifs triés, pour permettre un diagnostic détaillé (voir `debugStoredSegmentMatch`).
 *
 * La couverture d'un groupe est mesurée par son ÉTENDUE côté référence (du premier au dernier point
 * du groupe), pas par la somme des runs qui le composent — sommer les runs individuels exclut
 * implicitement les micro-trous entre eux (quelques points sans correspondance nette, par ex. tout
 * près d'un virage) même quand la quasi-totalité des points du segment sont par ailleurs bien
 * appariés (voir debugSegmentPointMatches) : un segment avec 3 petits trous de 20m chacun perdait
 * ainsi 60m de couverture "gratuitement", alors que ces trous font clairement partie du même passage.
 */
function groupSegmentRuns(runs: Run[], rsA: ResampledPoint[], rsB: ResampledPoint[]): ClusterGroups {
  const valid = runs.filter(r => r.dist >= MIN_SEGMENT_RUN_DISTANCE_M);
  if (valid.length === 0) return { clusters: [], runGapsM: [] };

  const sorted = [...valid].sort((a, b) => a.bMin - b.bMin);
  const runGapsM = sorted.slice(1).map((r, i) => rsB[r.bMin].dist - rsB[sorted[i].bMax].dist);

  const groups: Run[][] = [sorted.slice(0, 1)];
  for (let i = 1; i < sorted.length; i++) {
    const prevCluster = groups[groups.length - 1];
    const prevMax = Math.max(...prevCluster.map(r => r.bMax));
    const gapM = rsB[sorted[i].bMin].dist - rsB[prevMax].dist;
    if (gapM <= MAX_SEGMENT_CLUSTER_GAP_M) prevCluster.push(sorted[i]);
    else groups.push([sorted[i]]);
  }

  const clusters = groups.map(cluster => {
    const aStart = Math.min(...cluster.map(r => r.aStart));
    const aEnd = Math.max(...cluster.map(r => r.aEnd));
    return {
      dist: rsA[aEnd].dist - rsA[aStart].dist,
      aStart, aEnd,
      bMin: Math.min(...cluster.map(r => r.bMin)),
      bMax: Math.max(...cluster.map(r => r.bMax)),
      runCount: cluster.length,
    };
  });
  return { clusters, runGapsM };
}

/**
 * Retourne le groupe de corridors le mieux couvert (voir `groupSegmentRuns`) — factorisé entre
 * `findLongestMatch` et `debugStoredSegmentMatch` pour rester cohérents.
 */
function bestSegmentCluster(runs: Run[], rsA: ResampledPoint[], rsB: ResampledPoint[]): ClusterResult | null {
  const { clusters } = groupSegmentRuns(runs, rsA, rsB);
  if (clusters.length === 0) return null;
  return clusters.reduce((a, b) => (b.dist > a.dist ? b : a));
}

/**
 * Trouve le meilleur passage entre deux tracés — voir `bestSegmentCluster`. Nécessaire depuis la
 * découverte qu'une montée en lacets serrés peut faire diverger le suivi d'index (`computeRuns`)
 * même en comparant un tracé à lui-même, fragmentant un même passage réel en plusieurs runs proches
 * dont aucun individuellement n'atteint le seuil — mais additionner TOUS les runs sans tenir compte
 * de leur proximité (comme pour un trajet complet, voir `computeTotalCoverage`) recolle aussi à tort
 * des coïncidences géométriques éparpillées sur toute une activité plus longue : d'où le regroupement
 * par proximité plutôt qu'une simple somme globale.
 */
function findLongestMatch(pointsA: GeoPoint[], pointsB: GeoPoint[], minDistanceM = MIN_SEGMENT_DISTANCE_M): MatchResult | null {
  const computed = computeRuns(pointsA, pointsB);
  if (!computed) return null;
  const { rsA, rsB, runs } = computed;

  const best = bestSegmentCluster(runs, rsA, rsB);
  if (!best || best.dist < minDistanceM) return null;

  return {
    aStart: rsA[best.aStart].origIndex,
    aEnd: rsA[best.aEnd].origIndex,
    bStart: rsB[best.bMin].origIndex,
    bEnd: rsB[best.bMax].origIndex,
  };
}

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
  name: string;
  isCurrent: boolean;
}

/** Source minimale nécessaire pour comparer/agréger une activité — découplé du modèle de stockage cloud. */
export interface SegmentSource {
  points: GPXTrackPoint[];
  date: string;
  name: string;
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
  name: string;
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
    date: a.date, name: a.name, duration: a.duration, avgPace: a.avgPace, avgSpeed: a.avgSpeed,
    avgHR: a.avgHR, distance: a.distance, elevGain: a.elevGain, isCurrent: a.isCurrent,
  };
}

/** Construit un passage à partir d'une plage [startIndex, endIndex] de points — partagé par le matching segment et trajet complet. */
export function buildAttempt(points: GPXTrackPoint[], startIndex: number, endIndex: number, date: string, name: string, isCurrent: boolean): SegmentAttempt {
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
    avgHR, elevGain, date, name, isCurrent,
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
 * Seuil de distance minimale pour qu'un segment manuel soit considéré comme retrouvé : 90% de sa
 * longueur, au moins 100m — sauf que pour un segment plus court que ~125m, ce plancher de 100m
 * dépasserait sa propre longueur totale, rendant la correspondance mathématiquement impossible
 * (même en le comparant à lui-même). Plafonné à 95% de sa propre longueur pour rester atteignable.
 * Relevé de 60% à 90% une fois le bug de fragmentation d'index corrigé (voir MAX_PROGRESS_GAP_POINTS) :
 * un vrai passage complet couvre désormais ~95%+, ce qui permet d'exclure les montées interrompues
 * avant le sommet (cas réel confirmé par Greg : un arrêt aux 3/4 d'un lacet ne doit pas compter comme
 * un passage du segment).
 */
function minSegmentMatchDistance(refDistance: number): number {
  return Math.min(refDistance * 0.95, Math.max(100, refDistance * 0.9));
}

/**
 * Compare une activité (courante ou historique) à la géométrie de référence d'un segment manuel.
 * Le seuil de distance minimale s'adapte à la longueur du segment — les segments courts définis à
 * la main ne doivent pas être rejetés par le seuil global de 300m utilisé pour la détection
 * automatique, voir `minSegmentMatchDistance`.
 */
export function matchStoredSegment(
  refPoints: GeoPoint[], refDistance: number, candidate: SegmentSource, isCurrent = false,
): SegmentAttempt | null {
  const match = findLongestMatch(refPoints, candidate.points, minSegmentMatchDistance(refDistance));
  if (!match) return null;
  return buildAttempt(candidate.points, match.bStart, match.bEnd, candidate.date, candidate.name, isCurrent);
}

/** Nombre maximal de passages recherchés sur une même activité — garde-fou, largement au-dessus de tout fractionné réaliste. */
const MAX_SEGMENT_PASSES = 12;

/**
 * Comme `matchStoredSegment`, mais retourne TOUS les passages valides trouvés sur l'activité, pas
 * seulement le mieux couvert — nécessaire pour détecter les répétitions d'un même segment au sein
 * d'une seule séance (ex. 6 montées de la même côte en fractionné, cas réel signalé par Greg).
 *
 * Une simple lecture de TOUS les clusters de `groupSegmentRuns` en un seul passage ne suffit pas :
 * une côte gravie plusieurs fois a une géométrie QUASI IDENTIQUE à chaque répétition, donc pendant le
 * suivi de continuité (`computeMatchIndices`), après le trou causé par la descente entre deux montées,
 * la recherche peut se "raccrocher" par erreur sur la 1ère montée déjà appariée plutôt que d'avancer
 * vers la suivante (les deux sont à la même position géographique, seule leur position dans le temps
 * du candidat diffère) — un seul passage était alors détecté au lieu de 6, les runs des montées 2 à 6
 * n'existant tout simplement pas dans le résultat de `computeRuns`.
 *
 * Fix : après chaque passage trouvé, ses coordonnées sont neutralisées (hors de portée du corridor)
 * dans une copie de travail du tracé candidat, puis la recherche est relancée depuis zéro — la
 * répétition déjà détectée n'étant plus un candidat possible, la suivante devient sans ambiguïté la
 * meilleure correspondance. Répété jusqu'à épuisement (plus aucun cluster valide) ou `MAX_SEGMENT_PASSES`.
 */
export function matchStoredSegmentAll(
  refPoints: GeoPoint[], refDistance: number, candidate: SegmentSource, isCurrent = false,
): SegmentAttempt[] {
  const requiredM = minSegmentMatchDistance(refDistance);
  const results: SegmentAttempt[] = [];
  const working: GeoPoint[] = candidate.points.map(p => ({ lat: p.lat, lon: p.lon, distFromStart: p.distFromStart }));

  for (let pass = 0; pass < MAX_SEGMENT_PASSES; pass++) {
    const computed = computeRuns(refPoints, working);
    if (!computed) break;
    const { rsA, rsB, runs } = computed;
    const best = bestSegmentCluster(runs, rsA, rsB);
    if (!best || best.dist < requiredM) break;

    const bStartOrig = rsB[best.bMin].origIndex;
    const bEndOrig = rsB[best.bMax].origIndex;
    results.push(buildAttempt(candidate.points, bStartOrig, bEndOrig, candidate.date, candidate.name, isCurrent));

    // Neutralise la plage détectée (+1 point de marge) — coordonnées écartées à un endroit qui ne
    // pourra plus jamais satisfaire la tolérance de corridor (30m), sans décaler les index.
    for (let k = Math.max(0, bStartOrig - 1); k <= Math.min(working.length - 1, bEndOrig + 1); k++) {
      working[k] = { lat: 90, lon: 0, distFromStart: working[k].distFromStart };
    }
  }

  return results.sort((a, b) => a.startIndex - b.startIndex);
}

/** Point le plus proche de `target` dans `points` (recherche exhaustive, sans filtre de cap) — utilisé par le diagnostic uniquement. */
function bruteForceNearest(target: GeoPoint, points: GeoPoint[]): number {
  let best = Infinity;
  for (const p of points) {
    const d = calculateDistance(target.lat, target.lon, p.lat, p.lon);
    if (d < best) best = d;
  }
  return best;
}

/** Diagnostic d'une comparaison segment manuel — pourquoi une activité n'a pas été retenue comme un passage. */
export interface StoredSegmentMatchDebug {
  refPointCount: number;
  candidatePointCount: number;
  /** Couverture du meilleur groupe de corridors proches trouvé (0 si aucun) — voir `bestSegmentCluster`. */
  bestRunM: number;
  /** Longueur minimale requise pour ce segment (voir `minSegmentMatchDistance`). */
  requiredM: number;
  /** Distance (m) du premier/dernier point du segment au point le plus proche de l'activité, recherche
   * exhaustive sans filtre de cap — permet de distinguer "coordonnées éloignées" (bug de données) de
   * "coordonnées proches mais cap/corridor rejeté" (bug d'algorithme). */
  nearestStartM: number;
  nearestEndM: number;
  /** Nombre de corridors valides trouvés (avant regroupement) — voir `groupSegmentRuns`. */
  totalRuns: number;
  /** Nombre de corridors fusionnés dans le meilleur groupe. */
  bestClusterRunCount: number;
  /** Écarts (m) entre corridors valides consécutifs, triés le long du tracé candidat — permet de voir
   * si la perte de couverture vient de plusieurs petits trous ou d'un seul gros trou. */
  runGapsM: number[];
}

/** Rejoue la comparaison d'un segment manuel et retourne les valeurs brutes — utilisé pour comprendre pourquoi un segment n'apparaît pas sur une activité donnée. */
export function debugStoredSegmentMatch(refPoints: GeoPoint[], refDistance: number, candidatePoints: GeoPoint[]): StoredSegmentMatchDebug {
  const requiredM = minSegmentMatchDistance(refDistance);
  const computed = computeRuns(refPoints, candidatePoints);
  const { clusters, runGapsM } = computed ? groupSegmentRuns(computed.runs, computed.rsA, computed.rsB) : { clusters: [], runGapsM: [] };
  const best = clusters.length > 0 ? clusters.reduce((a, b) => (b.dist > a.dist ? b : a)) : null;
  const bestRunM = best?.dist ?? 0;
  const bestClusterRunCount = best?.runCount ?? 0;
  const totalRuns = clusters.reduce((s, c) => s + c.runCount, 0);
  const nearestStartM = refPoints.length > 0 ? bruteForceNearest(refPoints[0], candidatePoints) : Infinity;
  const nearestEndM = refPoints.length > 0 ? bruteForceNearest(refPoints[refPoints.length - 1], candidatePoints) : Infinity;
  return {
    refPointCount: refPoints.length, candidatePointCount: candidatePoints.length,
    bestRunM, requiredM, nearestStartM, nearestEndM,
    totalRuns, bestClusterRunCount, runGapsM: runGapsM.map(g => Math.round(g)),
  };
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

  return buildAttempt(candidate.points, 0, candidate.points.length - 1, candidate.date, candidate.name, isCurrent);
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
