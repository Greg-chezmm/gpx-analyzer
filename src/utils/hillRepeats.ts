import type { GPXActivity, GPXTrackPoint } from './gpxCore';
import type { ClimbSegment } from './climbs';

/** Une répétition individuelle de côte au sein d'une série. */
export interface HillRepetition {
  repIndex: number;
  startIndex: number;
  endIndex: number;
  distance: number;   // m
  elevGain: number;   // m
  duration: number;   // s
  avgPace: number;    // s/km
  avgGAP: number | null; // s/km — allure ajustée à la pente (Minetti), voir splits.ts calcAvgGAP
  avgHR: number | null;
  vam: number;        // m/h
  recovery: { duration: number; distance: number } | null;
}

/** Groupe de répétitions similaires sur la même côte, avec statistiques agrégées et indice de fatigue. */
export interface HillRepeatSeries {
  id: number;
  repCount: number;
  avgElevGain: number;  // m
  avgDistance: number;  // m
  avgGrade: number;     // %
  avgPace: number;      // s/km
  avgGAP: number | null; // s/km — moyenne des allures GAP valides des répétitions
  bestPace: number;     // s/km (le plus bas = le plus rapide)
  avgHR: number | null;
  avgVAM: number;       // m/h
  fatiguePct: number | null; // positif = fin plus lente que début
  reps: HillRepetition[];
}

/** Calcule la distance Haversine (m) entre deux points GPS — copie locale pour éviter la dépendance circulaire avec gpxCore. */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlam = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

type EnrichedClimb = ClimbSegment & { idx: number };

/** Vérifie si deux montées sont suffisamment similaires pour appartenir à la même série de répétitions (D+ ±30%, distance ±35%, départ à moins de 250 m). */
function areSimilar(a: EnrichedClimb, b: EnrichedClimb, pts: GPXTrackPoint[]): boolean {
  // Forme similaire : D+ ±30% et distance ±35%
  if (Math.min(a.elevGain, b.elevGain) / Math.max(a.elevGain, b.elevGain) < 0.70) return false;
  if (Math.min(a.distance, b.distance) / Math.max(a.distance, b.distance) < 0.65) return false;

  // Les points de départ doivent être à moins de 250 m l'un de l'autre
  const ptA = pts[a.startIndex];
  const ptB = pts[b.startIndex];
  if (ptA && ptB && ptA.lat && ptB.lat) {
    if (haversine(ptA.lat, ptA.lon, ptB.lat, ptB.lon) > 250) return false;
  }
  return true;
}

/**
 * Détecte les séries de répétitions de côte dans une activité via Union-Find sur les montées similaires.
 * Nécessite au moins 2 montées détectées. Calcule l'indice de fatigue (allure dernières vs premières rép.) si ≥4 répétitions.
 */
export function detectHillRepeats(
  climbs: ClimbSegment[],
  activity: GPXActivity,
): HillRepeatSeries[] {
  if (climbs.length < 2) return [];
  const pts = activity.points;

  const enriched: EnrichedClimb[] = climbs.map((c, idx) => ({ ...c, idx }));

  // Union-Find pour regrouper les montées similaires
  const parent = enriched.map((_, i) => i);
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };

  for (let i = 0; i < enriched.length; i++) {
    for (let j = i + 1; j < enriched.length; j++) {
      if (areSimilar(enriched[i], enriched[j], pts)) union(i, j);
    }
  }

  // Regrouper par cluster
  const clusters = new Map<number, EnrichedClimb[]>();
  for (let i = 0; i < enriched.length; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(enriched[i]);
  }

  const series: HillRepeatSeries[] = [];
  let seriesId = 0;

  for (const cluster of clusters.values()) {
    if (cluster.length < 2) continue;
    cluster.sort((a, b) => a.startIndex - b.startIndex);

    const reps: HillRepetition[] = cluster.map((c, repIdx) => {
      // Récupération = points entre la fin de cette montée et le début de la suivante
      const next = cluster[repIdx + 1];
      let recovery: { duration: number; distance: number } | null = null;
      if (next) {
        const recPts = pts.slice(c.endIndex, next.startIndex + 1);
        const recDist = recPts.length > 1
          ? recPts[recPts.length - 1].distFromStart - recPts[0].distFromStart
          : 0;
        let recDur: number;
        if (recPts[0]?.time && recPts[recPts.length - 1]?.time) {
          recDur = (recPts[recPts.length - 1].time!.getTime() - recPts[0].time!.getTime()) / 1000;
        } else {
          const avgSpd = recPts.map(p => p.speed ?? 0).filter(s => s > 0);
          const mean = avgSpd.length > 0 ? avgSpd.reduce((a, b) => a + b, 0) / avgSpd.length : 1;
          recDur = mean > 0 ? Math.abs(recDist) / mean : 0;
        }
        recovery = { duration: Math.max(0, recDur), distance: Math.abs(recDist) };
      }

      const segPts = pts.slice(c.startIndex, c.endIndex + 1);
      const hrPts = segPts.filter(p => p.hr !== null);
      const avgHR = hrPts.length > 0 ? hrPts.reduce((a, p) => a + p.hr!, 0) / hrPts.length : null;

      return {
        repIndex: repIdx,
        startIndex: c.startIndex,
        endIndex: c.endIndex,
        distance: c.distance,
        elevGain: c.elevGain,
        duration: c.duration,
        avgPace: c.avgPace,
        avgGAP: c.avgGAP,
        avgHR: avgHR !== null ? Math.round(avgHR) : null,
        vam: c.vam,
        recovery,
      };
    });

    const validPaces = reps.map(r => r.avgPace).filter(p => p > 0);
    const avgPace = validPaces.reduce((a, b) => a + b, 0) / validPaces.length;
    const validGAPs = reps.map(r => r.avgGAP).filter((g): g is number => g !== null);
    const avgGAP = validGAPs.length > 0 ? Math.round(validGAPs.reduce((a, b) => a + b, 0) / validGAPs.length) : null;
    const avgElevGain = reps.reduce((a, r) => a + r.elevGain, 0) / reps.length;
    const avgDistance = reps.reduce((a, r) => a + r.distance, 0) / reps.length;
    const hrReps = reps.filter(r => r.avgHR !== null);
    const avgHR = hrReps.length > 0 ? Math.round(hrReps.reduce((a, r) => a + r.avgHR!, 0) / hrReps.length) : null;

    // Fatigue : allure moyenne des N dernières rép. vs N premières (nécessite ≥4 répétitions)
    // fatiguePct > 0 → l'athlète ralentit en fin de série
    let fatiguePct: number | null = null;
    if (reps.length >= 4) {
      const n = Math.min(3, Math.floor(reps.length / 2));
      const firstAvg = reps.slice(0, n).reduce((a, r) => a + r.avgPace, 0) / n;
      const lastAvg = reps.slice(-n).reduce((a, r) => a + r.avgPace, 0) / n;
      if (firstAvg > 0) fatiguePct = ((lastAvg - firstAvg) / firstAvg) * 100;
    }

    series.push({
      id: seriesId++,
      repCount: reps.length,
      avgElevGain: Math.round(avgElevGain),
      avgDistance: Math.round(avgDistance),
      avgGrade: avgDistance > 0 ? Math.round((avgElevGain / avgDistance) * 100 * 10) / 10 : 0,
      avgPace,
      avgGAP,
      bestPace: Math.min(...validPaces),
      avgHR,
      avgVAM: Math.round(reps.reduce((a, r) => a + r.vam, 0) / reps.length),
      fatiguePct: fatiguePct !== null ? Math.round(fatiguePct * 10) / 10 : null,
      reps,
    });
  }

  series.sort((a, b) => a.reps[0].startIndex - b.reps[0].startIndex);
  return series;
}
