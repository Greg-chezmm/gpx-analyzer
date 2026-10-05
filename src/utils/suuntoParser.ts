import type { GPXActivity } from './gpxCore';
import type { GPXInterval } from './intervals';
import { calcAvgGAP } from './splits';
import { closestPointIndex, largestGapThreshold } from './fitParser';

// ─── Suunto JSON Windows → GPXInterval[] ──────────────────────────────────────
// Le JSON exporté par l'app Suunto (DeviceLog.Windows) contient TOUS les laps
// réels de la montre (boutons manuels + séance structurée), avec distance/durée
// précises — contrairement au .fit qui ne retient parfois qu'un sous-ensemble
// (ex. un seul lap "manual" couvrant 25 min quand la montre a pourtant vu
// 39 appuis sur le bouton lap). Utilisé pour enrichir une activité FIT/GPX déjà
// chargée : voir App.tsx handleLoadSuuntoLaps.

interface SuuntoWindow {
  Type?: string;            // 'Lap' | 'Interval' | 'Activity' | 'Move'
  IntervalType?: string | null;
  Duration?: number;        // secondes (temps actif, hors pause)
  Distance?: number;        // mètres
  Ascent?: number;
  Descent?: number;
  Speed?: [{ Avg?: number; Max?: number }];
  HR?: [{ Avg?: number; Max?: number }];
  Cadence?: [{ Avg?: number }];
  Power?: [{ Avg?: number }];
}

interface SuuntoWindowEntry {
  Window: SuuntoWindow;
  TimeISO8601: string; // horodatage de FIN du segment
}

export function parseSuuntoLapsFromJSON(jsonText: string, activity: GPXActivity): GPXInterval[] | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error('Fichier JSON invalide.');
  }

  const windows = data?.DeviceLog?.Windows as SuuntoWindowEntry[] | undefined;
  if (!Array.isArray(windows)) {
    throw new Error("Format JSON Suunto non reconnu (clé 'DeviceLog.Windows' manquante).");
  }

  // ── Vérifie que ce JSON correspond bien à l'activité chargée (pas une autre séance) ──
  // On compare l'heure de départ (tolérance large pour le fuseau/arrondi) et la distance
  // totale (tolérance pour la dérive GPS vs distance montre) rapportées par le Header.
  const header = data?.DeviceLog?.Header;
  const jsonStart = header?.DateTime ? new Date(header.DateTime).getTime() : null;
  const jsonDistance = typeof header?.Distance === 'number' ? header.Distance : null;

  if (jsonStart != null && activity.startTime) {
    const diffMin = Math.abs(jsonStart - activity.startTime.getTime()) / 60000;
    if (diffMin > 10) {
      throw new Error(
        `Ce fichier JSON ne correspond pas à l'activité chargée : l'heure de départ diffère de ${Math.round(diffMin)} min. Vérifie que c'est bien le JSON de la même séance.`
      );
    }
  }
  if (jsonDistance != null && activity.totalDistance > 0) {
    const ratio = jsonDistance / activity.totalDistance;
    if (ratio < 0.8 || ratio > 1.2) {
      throw new Error(
        `Ce fichier JSON ne correspond pas à l'activité chargée : distance totale très différente (${Math.round(jsonDistance)} m contre ${Math.round(activity.totalDistance)} m). Vérifie que c'est bien le JSON de la même séance.`
      );
    }
  }

  const points = activity.points;

  const parsed = windows
    .map(item => {
      const w = item?.Window;
      const end = item?.TimeISO8601 ? new Date(item.TimeISO8601).getTime() : NaN;
      return w && !isNaN(end) ? { w, end, duration: w.Duration ?? 0, type: w.Type ?? '' } : null;
    })
    .filter((e): e is { w: SuuntoWindow; end: number; duration: number; type: string } => e != null)
    .filter(e => e.duration > 0);

  // L'app Suunto affiche exactement les fenêtres de type "Lap" (boutons manuels + étapes
  // courtes), dans l'ordre, sans aucune déduplication — y compris les laps dégénérés
  // (0 m, durées aberrantes dues à des glitchs de la montre, visibles aussi dans l'app).
  // "Interval" est une vue parallèle (résumé de séance structurée) que l'app ne montre
  // jamais comme lap ; on ne s'en sert qu'en absence totale de lap "Lap" exploitable.
  const lapsOnly = parsed.filter(e => e.type === 'Lap');
  const kept = lapsOnly.length >= 2 ? lapsOnly : parsed.filter(e => e.type === 'Interval');
  if (kept.length < 2) return null;

  const laps = kept.map(e => {
    const w = e.w;
    const end = e.end;
    const duration = e.duration;
    const distance = w.Distance ?? 0;
    const avgSpeed = w.Speed?.[0]?.Avg ?? (duration > 0 ? distance / duration : 0);
    const maxSpeed = w.Speed?.[0]?.Max ?? avgSpeed;
    const hrAvg = w.HR?.[0]?.Avg;
    const hrMax = w.HR?.[0]?.Max;
    const cad = w.Cadence?.[0]?.Avg;
    const pwr = w.Power?.[0]?.Avg;
    return {
      startTime: new Date(end - duration * 1000),
      endTime: new Date(end),
      duration,
      distance,
      avgSpeed,
      maxSpeed,
      // Cadence JSON en pas/s (une jambe) → ×60 pour obtenir le même repère "demi-pas/min"
      // que le reste de l'appli (cadenceDisplay ×2 donnera bien la cadence totale en ppm).
      avgCadence: cad != null ? Math.round(cad * 60) : null,
      avgHeartRate: hrAvg != null ? Math.round(hrAvg * 60) : null,
      maxHeartRate: hrMax != null ? Math.round(hrMax * 60) : null,
      avgPower: pwr != null ? Math.round(pwr) : null,
      totalAscent: w.Ascent ?? null,
      totalDescent: w.Descent ?? null,
    };
  });

  // Classification effort/récup par vitesse (même logique que fitLapsToIntervals) —
  // l'utilisateur peut corriger chaque lap ensuite via le bouton de bascule dans IntervalAnalysis.
  const threshold = largestGapThreshold(laps.map(l => l.avgSpeed));

  // Numéro global séquentiel (1, 2, 3…), pas un compteur séparé par type — comme la montre.
  const intervals: GPXInterval[] = laps.map((l, i) => {
    const type: 'effort' | 'recovery' = l.avgSpeed >= threshold ? 'effort' : 'recovery';
    const number = i + 1;
    const startIdx = closestPointIndex(points, l.startTime);
    const endIdx = closestPointIndex(points, l.endTime);
    return {
      number,
      type,
      startTime: l.startTime,
      endTime: l.endTime,
      duration: l.duration,
      distance: l.distance,
      avgSpeed: l.avgSpeed,
      maxSpeed: l.maxSpeed,
      avgPace: l.avgSpeed > 0 ? 1000 / l.avgSpeed : 0,
      avgGAP: calcAvgGAP(points.slice(startIdx, endIdx + 1)),
      avgHeartRate: l.avgHeartRate,
      maxHeartRate: l.maxHeartRate,
      avgCadence: l.avgCadence,
      avgPower: l.avgPower,
      totalAscent: l.totalAscent,
      totalDescent: l.totalDescent,
      startPointIndex: startIdx,
      endPointIndex: endIdx,
    };
  });

  return intervals.length >= 2 ? intervals : null;
}
