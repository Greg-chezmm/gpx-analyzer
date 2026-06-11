// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — fit-file-parser has no official TS types
import FitParser from 'fit-file-parser';
import type { GPXActivity, GPXTrackPoint, FitSummary } from './gpxCore';
import { calculateDistance } from './gpxCore';
import { enrichPoints, computeTrackStats } from './trackProcessing';
import type { GPXInterval } from './intervals';

// ─── Internal FIT types ──────────────────────────────────────────────────────

interface FitRecord {
  timestamp?: Date;
  position_lat?: number | null;
  position_long?: number | null;
  altitude?: number | null;
  enhanced_altitude?: number | null;
  heart_rate?: number | null;
  cadence?: number | null;
  power?: number | null;
  temperature?: number | null;
  speed?: number | null;
  enhanced_speed?: number | null;
}

interface FitSession {
  sport?: string;
  sub_sport?: string;
  start_time?: Date;
  total_elapsed_time?: number;
  total_distance?: number;
  total_training_effect?: number;
  estimated_vo2_max?: number;
  recovery_time?: number;
  peak_epoc?: number;
  feeling?: number;
  training_stress_score?: number;
  time_in_hr_zone?: number[];
}

interface FitLap {
  timestamp?: Date;
  start_time?: Date;
  total_elapsed_time?: number;
  total_distance?: number;
  avg_speed?: number;
  max_speed?: number;
  avg_heart_rate?: number | null;
  max_heart_rate?: number | null;
  avg_cadence?: number | null;
  avg_power?: number | null;
  max_power?: number | null;
  total_ascent?: number | null;
  total_descent?: number | null;
  lap_trigger?: string;
  event?: string;
}

interface FitData {
  records?: FitRecord[];
  sessions?: FitSession[];
  laps?: FitLap[];
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function parseFIT(buffer: ArrayBuffer, defaultName = "Activité FIT"): Promise<GPXActivity> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = new (FitParser as any)({
      force: true,
      speedUnit: 'm/s',
      lengthUnit: 'm',
      temperatureUnit: 'celsius',
      elapsedRecordField: true,
      mode: 'list',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parser.parse(buffer, (error: Error | null, data: any) => {
      if (error) {
        reject(new Error(`Fichier FIT invalide : ${error.message}`));
        return;
      }
      try {
        resolve(fitDataToActivity(data as FitData, defaultName));
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Erreur de traitement FIT.'));
      }
    });
  });
}

// ─── FIT laps → GPXInterval[] ─────────────────────────────────────────────────
// Only laps triggered by fitness_equipment (structured workout) or manual (lap button).
// Autolap (distance/time) produces many identical laps and is intentionally excluded.

const STRUCTURED_TRIGGERS = new Set(['fitness_equipment', 'manual']);

function closestPointIndex(points: GPXTrackPoint[], time: Date): number {
  const target = time.getTime();
  let best = 0, bestDiff = Infinity;
  for (let i = 0; i < points.length; i++) {
    const t = points[i].time?.getTime();
    if (t == null) continue;
    const diff = Math.abs(t - target);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
}

function fitLapsToIntervals(laps: FitLap[], points: GPXTrackPoint[]): GPXInterval[] | null {
  const meaningful = laps.filter(l =>
    STRUCTURED_TRIGGERS.has(l.lap_trigger ?? '') &&
    (l.total_elapsed_time ?? 0) > 10 &&
    (l.total_distance ?? 0) > 50 &&
    l.start_time != null &&
    l.timestamp != null
  );

  if (meaningful.length < 2) return null;

  // Classify effort vs recovery by HR (universally applicable: high HR = effort)
  const hrs = meaningful.map(l => l.avg_heart_rate ?? null).filter((h): h is number => h !== null);
  const medianHR = hrs.length > 0
    ? [...hrs].sort((a, b) => a - b)[Math.floor(hrs.length / 2)]
    : null;

  const intervals: GPXInterval[] = [];
  let effortNum = 0, recoveryNum = 0;

  for (let i = 0; i < meaningful.length; i++) {
    const lap = meaningful[i];
    const hr = lap.avg_heart_rate ?? null;

    let type: 'effort' | 'recovery';
    if (medianHR !== null && hr !== null) {
      type = hr >= medianHR ? 'effort' : 'recovery';
    } else {
      // No HR data — alternate starting with effort
      type = i % 2 === 0 ? 'effort' : 'recovery';
    }

    const dur = lap.total_elapsed_time ?? 0;
    const dist = lap.total_distance ?? 0;
    const avgSpd = dur > 0 && dist > 0 ? dist / dur : (lap.avg_speed ?? 0);
    const num = type === 'effort' ? ++effortNum : ++recoveryNum;

    intervals.push({
      number: num,
      type,
      startTime: lap.start_time!,
      endTime: lap.timestamp!,
      duration: dur,
      distance: dist,
      avgSpeed: avgSpd,
      maxSpeed: lap.max_speed ?? 0,
      avgPace: avgSpd > 0 ? 1000 / avgSpd : 0,
      avgHeartRate: hr,
      maxHeartRate: lap.max_heart_rate ?? null,
      avgCadence: lap.avg_cadence ?? null,
      avgPower: lap.avg_power ?? null,
      totalAscent: lap.total_ascent ?? null,
      totalDescent: lap.total_descent ?? null,
      startPointIndex: closestPointIndex(points, lap.start_time!),
      endPointIndex: closestPointIndex(points, lap.timestamp!),
    });
  }

  return intervals.length >= 2 ? intervals : null;
}

// ─── Conversion FIT → GPXActivity ─────────────────────────────────────────────
// Note: smoothing and grade logic mirrors parseGPX in gpxCore.ts intentionally —
// both formats must produce identical GPXActivity shapes for downstream components.

// Returns true for plausible GPS coordinates in degrees.
// Rejects: null, (0,0) = Gulf of Guinea (pre-lock), out-of-range (unconverted semicircles).
function isValidGPS(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

function fitDataToActivity(data: FitData, name: string): GPXActivity {
  const records = (data.records ?? []).filter(r => r.timestamp != null);

  if (records.length === 0) {
    throw new Error('Aucun point de tracé trouvé dans ce fichier FIT.');
  }

  // ── Aggregate stats from ALL records (HR, cadence, power, temp) ─────────
  // Records before GPS lock have HR but no coordinates. We compute aggregate
  // stats here so that avgHeartRate / maxHeartRate reflect the full session.
  let hrSum = 0, hrCount = 0, maxHr = 0;
  let cadSum = 0, cadCount = 0, maxCad = 0;
  let powerSum = 0, powerCount = 0, maxPower = 0;
  let tempSum = 0, tempCount = 0;

  for (const r of records) {
    const hr  = r.heart_rate != null && r.heart_rate > 0 ? r.heart_rate : null;
    const cad = r.cadence    != null && r.cadence    > 0 ? r.cadence    : null;
    const pwr = r.power      != null && r.power      > 0 ? r.power      : null;
    const tmp = r.temperature ?? null;
    if (hr  !== null) { hrSum    += hr;  hrCount++;    if (hr  > maxHr)    maxHr    = hr;  }
    if (cad !== null) { cadSum   += cad; cadCount++;   if (cad > maxCad)   maxCad   = cad; }
    if (pwr !== null) { powerSum += pwr; powerCount++; if (pwr > maxPower) maxPower = pwr; }
    if (tmp !== null) { tempSum  += tmp; tempCount++;                                       }
  }

  // ── Track points — GPS-valid records only ─────────────────────────────────
  // Records without GPS (before satellite lock, brief outages) are excluded:
  // including them would corrupt distance (jump to 0°,0°) and speed values.
  // The HR zone calculation in HeartRateZones.tsx integrates time between
  // consecutive points; with GPS-only the pre-lock period (~20-60 s) is absent,
  // but the resulting zone error is <1% for typical 1h+ activities.
  const gpsRecords = records.filter(r => isValidGPS(r.position_lat, r.position_long));
  const gpsDropped = records.length - gpsRecords.length;

  if (gpsRecords.length === 0) {
    throw new Error('Aucune coordonnée GPS valide dans ce fichier FIT (activité intérieure ?).');
  }

  const points: GPXTrackPoint[] = [];
  let accumulatedDistance = 0;

  for (let i = 0; i < gpsRecords.length; i++) {
    const r   = gpsRecords[i];
    const lat = r.position_lat  as number;
    const lon = r.position_long as number;
    const ele = r.enhanced_altitude ?? r.altitude ?? null;
    const time = r.timestamp ?? null;
    const hr  = r.heart_rate != null && r.heart_rate > 0 ? r.heart_rate : null;
    const cad = r.cadence    != null && r.cadence    > 0 ? r.cadence    : null;
    const pwr = r.power      != null && r.power      > 0 ? r.power      : null;
    const tmp = r.temperature ?? null;

    if (i > 0) {
      accumulatedDistance += calculateDistance(
        points[i - 1].lat, points[i - 1].lon, lat, lon,
      );
    }

    points.push({
      lat, lon, ele, time,
      hr, cad, power: pwr, temp: tmp,
      distFromStart: accumulatedDistance,
      speed: 0, rawSpeed: 0, grade: null,
    });
  }

  const { elevationGain, elevationLoss, elevOutliers, elevCoverage } = enrichPoints(points);
  const { startTime, endTime, totalDuration, movingTime, maxSpeed, avgSpeed, avgPace, gapCount, longestGap }
    = computeTrackStats(points, accumulatedDistance);

  // ── Activity type — FIT sport field is explicit, fallback to speed ─────────
  const session = data.sessions?.[0];
  const sport    = (session?.sport     ?? '').toLowerCase();
  const subSport = (session?.sub_sport ?? '').toLowerCase();
  let activityType: GPXActivity['activityType'] = 'unknown';

  if (/run|trail|walk|hike/.test(sport) || /run|trail|walk/.test(subSport)) {
    activityType = 'running';
  } else if (/cycl|bike|ride|velo|vélo/.test(sport) || /cycl|bike|ride/.test(subSport)) {
    activityType = 'cycling';
  } else if (avgSpeed > 6.9) {
    activityType = 'cycling';
  } else if (avgSpeed > 0) {
    activityType = 'running';
  }

  // ── FIT laps — intervals de séance structurée ou bouton lap ─────────────────
  const fitLaps = fitLapsToIntervals(data.laps ?? [], points) ?? undefined;

  // ── FIT session summary — données propriétaires montre ──────────────────────
  const fitSummary: FitSummary | undefined = session ? {
    trainingEffect:  session.total_training_effect  ?? null,
    estimatedVO2max: session.estimated_vo2_max      ?? null,
    recoveryTimeH:   session.recovery_time != null
      ? Math.round(session.recovery_time / 3600 * 2) / 2  // arrondi à 0.5h
      : null,
    peakEpoc:        session.peak_epoc != null
      ? Math.round(session.peak_epoc * 10) / 10
      : null,
    feeling:         session.feeling     ?? null,
    tss:             session.training_stress_score ?? null,
    timeInHrZone:    Array.isArray(session.time_in_hr_zone) ? session.time_in_hr_zone : null,
  } : undefined;

  return {
    name,
    startTime,
    endTime,
    points,
    totalDistance:  accumulatedDistance,
    totalDuration,
    movingTime,
    avgSpeed,
    maxSpeed,
    avgPace,
    elevationGain:  Math.round(elevationGain  * 10) / 10,
    elevationLoss:  Math.round(elevationLoss  * 10) / 10,
    avgHeartRate:   hrCount    > 0 ? Math.round(hrSum    / hrCount)    : null,
    maxHeartRate:   hrCount    > 0 ? maxHr                             : null,
    avgCadence:     cadCount   > 0 ? Math.round(cadSum   / cadCount)   : null,
    maxCadence:     cadCount   > 0 ? maxCad                            : null,
    avgPower:       powerCount > 0 ? Math.round(powerSum / powerCount) : null,
    maxPower:       powerCount > 0 ? maxPower                          : null,
    avgTemp:        tempCount  > 0 ? Math.round((tempSum / tempCount) * 10) / 10 : null,
    activityType,
    dataQuality: {
      hrCoverage:   records.length > 0 ? Math.round(hrCount / records.length * 100) : 0,
      elevCoverage,
      elevOutliers,
      gapCount,
      longestGap,
      gpsDropped,
    },
    fitSummary,
    fitLaps,
  };
}
