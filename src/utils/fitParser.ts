// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — fit-file-parser has no official TS types
import FitParser from 'fit-file-parser';
import type { GPXActivity, GPXTrackPoint } from './gpxCore';
import { calculateDistance } from './gpxCore';

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
}

interface FitData {
  records?: FitRecord[];
  sessions?: FitSession[];
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

  // ── Elevation smoothing — 11-point symmetric moving average ───────────────
  const rawEle = points.map(p => p.ele);
  const ELE_WIN = 5;
  for (let i = 0; i < points.length; i++) {
    if (rawEle[i] === null) continue;
    const lo = Math.max(0, i - ELE_WIN);
    const hi = Math.min(points.length - 1, i + ELE_WIN);
    let sum = 0, cnt = 0;
    for (let j = lo; j <= hi; j++) {
      if (rawEle[j] !== null) { sum += rawEle[j]!; cnt++; }
    }
    points[i].ele = cnt > 0 ? sum / cnt : rawEle[i];
  }

  let elevationGain = 0, elevationLoss = 0;
  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    if (curr.ele !== null && prev.ele !== null) {
      const diff = curr.ele - prev.ele;
      if (diff > 0) elevationGain += diff;
      else elevationLoss += Math.abs(diff);
    }
  }

  // ── Raw speed from time deltas ────────────────────────────────────────────
  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    const distDiff = curr.distFromStart - prev.distFromStart;
    let timeDiff = 0;
    if (curr.time && prev.time) timeDiff = (curr.time.getTime() - prev.time.getTime()) / 1000;
    curr.rawSpeed = timeDiff > 0 && distDiff > 0 ? distDiff / timeDiff : 0;
  }

  // Speed smoothing — 5-point moving average
  const SPD_WIN = 5;
  for (let i = 0; i < points.length; i++) {
    const lo = Math.max(0, i - Math.floor(SPD_WIN / 2));
    const hi = Math.min(points.length - 1, i + Math.floor(SPD_WIN / 2));
    let sum = 0, count = 0;
    for (let j = lo; j <= hi; j++) {
      if (points[j].rawSpeed !== null) { sum += points[j].rawSpeed!; count++; }
    }
    points[i].speed = count > 0 ? sum / count : 0;
  }
  points[0].speed = 0;

  // ── Grade — 60 m distance window ──────────────────────────────────────────
  const GRADE_TARGET_M = 30;
  for (let i = 0; i < points.length; i++) {
    const base = points[i].distFromStart;
    let lo = i, hi = i;
    while (lo > 0 && base - points[lo - 1].distFromStart < GRADE_TARGET_M) lo--;
    while (hi < points.length - 1 && points[hi + 1].distFromStart - base < GRADE_TARGET_M) hi++;
    const hDist = points[hi].distFromStart - points[lo].distFromStart;
    if (hDist >= 10 && points[hi].ele !== null && points[lo].ele !== null) {
      points[i].grade = Math.round(((points[hi].ele! - points[lo].ele!) / hDist) * 1000) / 10;
    } else {
      points[i].grade = 0;
    }
  }

  // ── Global statistics ──────────────────────────────────────────────────────
  const startTime = points[0].time;
  const endTime   = points[points.length - 1].time;
  const totalDuration = startTime && endTime
    ? (endTime.getTime() - startTime.getTime()) / 1000 : 0;

  let movingTime = 0, maxSpeed = 0, movingSpeedSum = 0, movingPointsCount = 0;
  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    let timeDiff = 0;
    if (curr.time && prev.time) timeDiff = (curr.time.getTime() - prev.time.getTime()) / 1000;
    if (timeDiff > 0 && timeDiff < 30) {
      const spd = curr.speed ?? 0;
      if (spd > 0.5) {
        movingTime       += timeDiff;
        movingSpeedSum   += spd * timeDiff;
        movingPointsCount += timeDiff;
      }
    }
    if ((curr.speed ?? 0) > maxSpeed) maxSpeed = curr.speed ?? 0;
  }
  if (movingTime === 0 || !startTime) movingTime = totalDuration || accumulatedDistance / 4;

  const avgSpeed = movingTime > 0
    ? (movingPointsCount > 0 ? movingSpeedSum / movingPointsCount : accumulatedDistance / movingTime)
    : 0;
  const avgPace = avgSpeed > 0 ? 1000 / avgSpeed : 0;

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
  };
}
