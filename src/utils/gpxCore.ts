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
}

// Calculate distance between two GPS coordinates using Haversine formula
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
  let elevationGain = 0;
  let elevationLoss = 0;

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

    // Distance calculation
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

  // Smooth elevation with a symmetric moving average before accumulating gain.
  // Required for DEM-corrected GPX (Strava exports): each point changes by < 0.25m
  // but real terrain accumulates over thousands of meters. A naive per-point threshold
  // would filter out nearly all of those small steps, massively under-counting gain.
  const rawEleSnap = points.map(p => p.ele);
  const ELE_WIN = 5; // points each side → 11-point window
  for (let i = 0; i < points.length; i++) {
    if (rawEleSnap[i] === null) continue;
    const lo = Math.max(0, i - ELE_WIN);
    const hi = Math.min(points.length - 1, i + ELE_WIN);
    let sum = 0, cnt = 0;
    for (let j = lo; j <= hi; j++) {
      if (rawEleSnap[j] !== null) { sum += rawEleSnap[j]!; cnt++; }
    }
    points[i].ele = cnt > 0 ? sum / cnt : rawEleSnap[i];
  }

  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    if (curr.ele !== null && prev.ele !== null) {
      const diff = curr.ele - prev.ele;
      if (diff > 0) elevationGain += diff;
      else elevationLoss += Math.abs(diff);
    }
  }

  // Calculate speeds and grade between points
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];

    if (i === 0) {
      curr.speed = 0;
      curr.rawSpeed = 0;
      continue;
    }

    const prev = points[i - 1];
    const distDiff = curr.distFromStart - prev.distFromStart;

    // Time difference
    let timeDiff = 0;
    if (curr.time && prev.time) {
      timeDiff = (curr.time.getTime() - prev.time.getTime()) / 1000; // seconds
    }

    // Speed (m/s)
    let rawSpeed = 0;
    if (timeDiff > 0 && distDiff > 0) {
      rawSpeed = distDiff / timeDiff;
    }
    curr.rawSpeed = rawSpeed;

    // Grade computed later with a windowed approach (see below)
  }

  // Smooth speeds using a moving average window to filter out GPS speed spikes
  const windowSize = 5;
  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      points[i].speed = 0;
      continue;
    }

    let sum = 0;
    let count = 0;
    const startIdx = Math.max(0, i - Math.floor(windowSize / 2));
    const endIdx = Math.min(points.length - 1, i + Math.floor(windowSize / 2));

    for (let j = startIdx; j <= endIdx; j++) {
      if (points[j].rawSpeed !== null) {
        sum += points[j].rawSpeed!;
        count++;
      }
    }

    points[i].speed = count > 0 ? sum / count : 0;
  }

  // Grade: distance-based window (target ±30 m each side = ~60 m total).
  // Fixed-point windows break when GPS records densely (slow hiking, pauses) —
  // ±4 points may cover only 5 m, turning any residual elevation error into 50%+ noise.
  // A 60 m window stays stable regardless of recording frequency.
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

  // Calculate global statistics
  const firstPt = points[0];
  const lastPt = points[points.length - 1];

  const startTime = firstPt.time;
  const endTime = lastPt.time;

  // Total elapsed duration in seconds
  const totalDuration = startTime && endTime ? (endTime.getTime() - startTime.getTime()) / 1000 : 0;

  // Moving time: ignore time gaps where speed is below 0.5 m/s (1.8 km/h)
  let movingTime = 0;
  let maxSpeed = 0;
  let movingSpeedSum = 0;
  let movingPointsCount = 0;

  for (let i = 1; i < points.length; i++) {
    const curr = points[i];
    const prev = points[i - 1];

    let timeDiff = 0;
    if (curr.time && prev.time) {
      timeDiff = (curr.time.getTime() - prev.time.getTime()) / 1000;
    }

    if (timeDiff > 0 && timeDiff < 30) { // filter out long pause durations
      const spd = curr.speed || 0;
      if (spd > 0.5) {
        movingTime += timeDiff;
        movingSpeedSum += spd * timeDiff; // weighted speed
        movingPointsCount += timeDiff;
      }
    }

    if (curr.speed && curr.speed > maxSpeed) {
      maxSpeed = curr.speed;
    }
  }

  // Fallback for moving time if time wasn't parsed properly
  if (movingTime === 0 || !startTime) {
    movingTime = totalDuration || (accumulatedDistance / 4); // assume 4 m/s average if no times
  }

  // Average speed in moving time
  const avgSpeed = movingTime > 0 ? (movingPointsCount > 0 ? movingSpeedSum / movingPointsCount : accumulatedDistance / movingTime) : 0;

  // Pace in seconds per kilometer (e.g. 5:30/km)
  const avgPace = avgSpeed > 0 ? 1000 / avgSpeed : 0;

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
  // Fallback: speed-based detection (> ~25 km/h = cycling)
  if (activityType === 'unknown' && avgSpeed > 0) {
    activityType = avgSpeed > 6.9 ? 'cycling' : 'running';
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
  };
}
