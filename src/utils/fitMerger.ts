import type { GPXActivity, GPXTrackPoint } from './gpxCore';
import { calculateDistance } from './gpxCore';
import { computeTrackStats } from './trackProcessing';
import type { GPXInterval } from './intervals';

export interface MergeInfo {
  gapSeconds: number;  // temps de pause entre les deux fichiers
  gapMeters: number;   // distance GPS entre fin fichier 1 et début fichier 2
}

export function mergeActivities(
  first: GPXActivity,
  second: GPXActivity,
): { activity: GPXActivity; info: MergeInfo } {
  // Tri chronologique — le fichier qui commence plus tôt est "a"
  const [a, b] = (
    first.startTime && second.startTime && second.startTime < first.startTime
  ) ? [second, first] : [first, second];

  const aLast  = a.points[a.points.length - 1];
  const bFirst = b.points[0];

  const gapMeters = (aLast && bFirst)
    ? calculateDistance(aLast.lat, aLast.lon, bFirst.lat, bFirst.lon)
    : 0;
  const gapSeconds = (aLast?.time && bFirst?.time)
    ? Math.max(0, (bFirst.time.getTime() - aLast.time.getTime()) / 1000)
    : 0;

  // Décaler distFromStart des points du fichier B
  const distOffset = (aLast?.distFromStart ?? 0) + gapMeters;
  const bPoints: GPXTrackPoint[] = b.points.map(p => ({
    ...p,
    distFromStart: p.distFromStart + distOffset,
  }));

  const mergedPoints = [...a.points, ...bPoints];
  const totalDist = mergedPoints[mergedPoints.length - 1].distFromStart;

  // Stats vitesse/durée depuis les points fusionnés
  // Note: computeTrackStats ignore les intervalles > 30s entre points consécutifs
  // pour movingTime → le gap de redémarrage montre ne pollue pas le temps de mouvement
  const stats = computeTrackStats(mergedPoints, totalDist);

  // Moyennes FC / cadence / puissance / température depuis les points
  const avgOf = <K extends keyof GPXTrackPoint>(key: K) => {
    const vals = mergedPoints.map(p => p[key] as number | null).filter((v): v is number => v !== null);
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const maxOf = <K extends keyof GPXTrackPoint>(key: K) => {
    const vals = mergedPoints.map(p => p[key] as number | null).filter((v): v is number => v !== null);
    return vals.length > 0 ? Math.max(...vals) : null;
  };

  // FitSummary : conserver celui du fichier de plus longue durée
  const longerFile = a.totalDuration >= b.totalDuration ? a : b;
  const fitSummary = longerFile.fitSummary;

  // FitLaps : concaténer, décaler les index de points du fichier B
  const aLen = a.points.length;
  const allLaps: GPXInterval[] = [
    ...(a.fitLaps ?? []),
    ...(b.fitLaps ?? []).map(lap => ({
      ...lap,
      startPointIndex: lap.startPointIndex + aLen,
      endPointIndex:   lap.endPointIndex   + aLen,
    })),
  ];

  const activity: GPXActivity = {
    name:           `${a.name} (fusionné)`,
    startTime:      stats.startTime,
    endTime:        stats.endTime,
    points:         mergedPoints,
    totalDistance:  totalDist,
    totalDuration:  stats.totalDuration,
    movingTime:     stats.movingTime,
    avgSpeed:       stats.avgSpeed,
    maxSpeed:       stats.maxSpeed,
    avgPace:        stats.avgPace,
    elevationGain:  Math.round(a.elevationGain + b.elevationGain),
    elevationLoss:  Math.round(a.elevationLoss + b.elevationLoss),
    avgHeartRate:   avgOf('hr') !== null ? Math.round(avgOf('hr')!) : null,
    maxHeartRate:   maxOf('hr'),
    avgCadence:     avgOf('cad') !== null ? Math.round(avgOf('cad')!) : null,
    maxCadence:     maxOf('cad'),
    avgPower:       avgOf('power') !== null ? Math.round(avgOf('power')!) : null,
    maxPower:       maxOf('power'),
    avgTemp:        avgOf('temp') !== null ? Math.round(avgOf('temp')! * 10) / 10 : null,
    activityType:   a.activityType,
    dataQuality: {
      hrCoverage:   Math.min(a.dataQuality.hrCoverage,   b.dataQuality.hrCoverage),
      elevCoverage: Math.min(a.dataQuality.elevCoverage, b.dataQuality.elevCoverage),
      elevOutliers: a.dataQuality.elevOutliers + b.dataQuality.elevOutliers,
      gapCount:     a.dataQuality.gapCount + b.dataQuality.gapCount,
      longestGap:   Math.max(a.dataQuality.longestGap,   b.dataQuality.longestGap),
      gpsDropped:   a.dataQuality.gpsDropped + b.dataQuality.gpsDropped,
    },
    fitSummary,
    fitLaps:        allLaps.length > 0 ? allLaps : undefined,
  };

  return { activity, info: { gapSeconds, gapMeters } };
}
