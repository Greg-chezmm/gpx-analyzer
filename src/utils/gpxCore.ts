import { enrichPoints, computeTrackStats } from './trackProcessing';

/** Point de tracé GPS enrichi : coordonnées, altitude, FC, cadence, puissance, température, distance, vitesse et pente. */
export interface GPXTrackPoint {
  lat: number;
  lon: number;
  ele: number | null; // meters
  time: Date | null;
  hr: number | null;   // heart rate (bpm)
  cad: number | null;  // cadence (rpm)
  power: number | null; // power (watts)
  temp: number | null;  // temperature (°C)
  distFromStart: number; // meters, accumulated
  speed: number | null;   // m/s (smoothed)
  rawSpeed: number | null; // m/s (raw)
  grade: number | null;   // slope %
}

/** Données de synthèse extraites d'un fichier FIT (montre Garmin/Suunto) : Training Effect, VO2max estimé, récupération, EPOC, ressenti. */
export interface FitSummary {
  trainingEffect: number | null;  // 0–5
  estimatedVO2max: number | null; // mL/kg/min (estimation montre)
  recoveryTimeH: number | null;   // heures
  peakEpoc: number | null;        // mL/kg
  feeling: number | null;         // 1–5
  tss: number | null;             // Training Stress Score natif montre
  timeInHrZone: number[] | null;  // secondes [Z1..Z5], zones % FCmax montre
}

/** Indicateurs de qualité du fichier GPS (couverture FC, altitude, outliers, pauses GPS). */
export interface DataQuality {
  hrCoverage: number;    // % points avec FC (0–100)
  elevCoverage: number;  // % points avec altitude valide (0–100)
  elevOutliers: number;  // points altitude corrigés (spike > 50 m)
  gapCount: number;      // pauses GPS/chrono ≥ 30 s
  longestGap: number;    // durée max d'un gap (secondes)
  gpsDropped: number;    // enregistrements sans GPS valide (FIT only, 0 pour GPX)
}

/** Activité complète analysée : tous les points enrichis, statistiques globales, type d'activité et qualité des données. */
export interface GPXActivity {
  name: string;
  startTime: Date | null;
  endTime: Date | null;
  points: GPXTrackPoint[];
  totalDistance: number;  // meters
  totalDuration: number;  // seconds (elapsed)
  movingTime: number;     // seconds (speed > 0.5 m/s)
  avgSpeed: number;       // m/s
  maxSpeed: number;       // m/s
  avgPace: number;        // seconds per km
  elevationGain: number;  // meters
  elevationLoss: number;  // meters
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  avgPower: number | null;
  maxPower: number | null;
  avgTemp: number | null;
  activityType: 'running' | 'cycling' | 'unknown';
  dataQuality: DataQuality;
  fitSummary?: FitSummary;
  fitLaps?: import('./intervals').GPXInterval[];
}

/**
 * Calcule la distance en mètres entre deux points GPS avec la formule de Haversine.
 * R = 6 371 000 m (rayon terrestre moyen). Précision < 0,3% pour les distances sportives.
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

/** Parse un fichier GPX (XML) et retourne une GPXActivity enrichie avec toutes les métriques calculées. */
export function parseGPX(gpxText: string, defaultName = "Activité sans nom"): GPXActivity {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(gpxText, "application/xml");

  // Check for parsing errors
  const parserError = xmlDoc.getElementsByTagName("parsererror");
  if (parserError.length > 0) {
    throw new Error("Erreur de format GPX : XML invalide.");
  }

  // Get activity name
  let name = defaultName;
  const nameNode = xmlDoc.getElementsByTagName("name")[0];
  if (nameNode && nameNode.textContent) {
    name = nameNode.textContent.trim();
  }

  const trkpts = xmlDoc.getElementsByTagName("trkpt");
  if (trkpts.length === 0) {
    throw new Error("Aucun point de tracé (trkpt) trouvé dans le fichier GPX.");
  }

  const points: GPXTrackPoint[] = [];
  let accumulatedDistance = 0;

  let hrSum = 0;
  let hrCount = 0;
  let maxHr = 0;

  let cadSum = 0;
  let cadCount = 0;
  let maxCad = 0;

  let powerSum = 0;
  let powerCount = 0;
  let maxPowerVal = 0;

  let tempSum = 0;
  let tempCount = 0;

  for (let i = 0; i < trkpts.length; i++) {
    const pt = trkpts[i];
    const lat = parseFloat(pt.getAttribute("lat") || "0");
    const lon = parseFloat(pt.getAttribute("lon") || "0");

    // Parse elevation
    const eleNode = pt.getElementsByTagName("ele")[0];
    const ele = eleNode && eleNode.textContent ? parseFloat(eleNode.textContent) : null;

    // Parse time
    const timeNode = pt.getElementsByTagName("time")[0];
    const time = timeNode && timeNode.textContent ? new Date(timeNode.textContent) : null;

    // Parse heart rate
    let hr: number | null = null;
    const hrNode = pt.getElementsByTagNameNS("*", "hr")[0] || pt.getElementsByTagName("hr")[0];
    if (hrNode && hrNode.textContent) {
      hr = parseInt(hrNode.textContent, 10);
      if (!isNaN(hr)) {
        hrSum += hr;
        hrCount++;
        if (hr > maxHr) maxHr = hr;
      } else {
        hr = null;
      }
    }

    // Parse cadence
    let cad: number | null = null;
    const cadNode = pt.getElementsByTagNameNS("*", "cad")[0] || pt.getElementsByTagName("cad")[0];
    if (cadNode && cadNode.textContent) {
      cad = parseInt(cadNode.textContent, 10);
      if (!isNaN(cad)) {
        cadSum += cad;
        cadCount++;
        if (cad > maxCad) maxCad = cad;
      } else {
        cad = null;
      }
    }

    // Parse power (Watts)
    let power: number | null = null;
    const powerNode = pt.getElementsByTagName("power")[0] || pt.getElementsByTagNameNS("*", "power")[0] || pt.getElementsByTagName("watts")[0];
    if (powerNode && powerNode.textContent) {
      power = parseInt(powerNode.textContent, 10);
      if (!isNaN(power)) {
        powerSum += power;
        powerCount++;
        if (power > maxPowerVal) maxPowerVal = power;
      } else {
        power = null;
      }
    }

    // Parse temperature (°C)
    let temp: number | null = null;
    const tempNode = pt.getElementsByTagName("atemp")[0] || pt.getElementsByTagNameNS("*", "atemp")[0] || pt.getElementsByTagName("temp")[0];
    if (tempNode && tempNode.textContent) {
      temp = parseFloat(tempNode.textContent);
      if (!isNaN(temp)) {
        tempSum += temp;
        tempCount++;
      } else {
        temp = null;
      }
    }

    // Distance calculation (Haversine point-à-point)
    if (i > 0) {
      const prevPt = points[i - 1];
      const distDiff = calculateDistance(prevPt.lat, prevPt.lon, lat, lon);
      accumulatedDistance += distDiff;

      // Elevation gain/loss calculated after smoothing (see below)
    }

    points.push({
      lat,
      lon,
      ele,
      time,
      hr,
      cad,
      power,
      temp,
      distFromStart: accumulatedDistance,
      speed: 0, // calculated next
      rawSpeed: 0, // calculated next
      grade: null, // calculated next
    });
  }

  const { elevationGain, elevationLoss, elevOutliers, elevCoverage } = enrichPoints(points);
  const { startTime, endTime, totalDuration, movingTime, maxSpeed, avgSpeed, avgPace, gapCount, longestGap }
    = computeTrackStats(points, accumulatedDistance);

  // Detect activity type from <type> tag or speed heuristic
  let activityType: 'running' | 'cycling' | 'unknown' = 'unknown';
  const typeNodes = xmlDoc.getElementsByTagName("type");
  for (let t = 0; t < typeNodes.length && activityType === 'unknown'; t++) {
    const typeText = (typeNodes[t].textContent || "").trim().toLowerCase();
    if (!typeText) continue;
    if (/run|course|trail|hik|walk|march|rando/.test(typeText)) {
      activityType = 'running';
    } else if (/cycl|bike|ride|vélo|velo|vtt/.test(typeText)) {
      activityType = 'cycling';
    }
  }
  // Fallback heuristique vitesse : avgSpeed > 4,2 m/s (15 km/h) OU maxSpeed > 9 m/s (32 km/h) → vélo
  if (activityType === 'unknown' && avgSpeed > 0) {
    activityType = (avgSpeed > 4.2 || maxSpeed > 9.0) ? 'cycling' : 'running';
  }

  return {
    name,
    startTime,
    endTime,
    points,
    totalDistance: accumulatedDistance,
    totalDuration,
    movingTime,
    avgSpeed,
    maxSpeed,
    avgPace,
    elevationGain: Math.round(elevationGain * 10) / 10,
    elevationLoss: Math.round(elevationLoss * 10) / 10,
    avgHeartRate: hrCount > 0 ? Math.round(hrSum / hrCount) : null,
    maxHeartRate: hrCount > 0 ? maxHr : null,
    avgCadence: cadCount > 0 ? Math.round(cadSum / cadCount) : null,
    maxCadence: cadCount > 0 ? maxCad : null,
    avgPower: powerCount > 0 ? Math.round(powerSum / powerCount) : null,
    maxPower: powerCount > 0 ? maxPowerVal : null,
    avgTemp: tempCount > 0 ? Math.round((tempSum / tempCount) * 10) / 10 : null,
    activityType,
    dataQuality: {
      hrCoverage:   points.length > 0 ? Math.round(hrCount    / points.length * 100) : 0,
      elevCoverage,
      elevOutliers,
      gapCount,
      longestGap,
      gpsDropped:   0,
    },
  };
}
