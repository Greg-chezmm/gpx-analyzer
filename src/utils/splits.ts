import type { GPXActivity } from './gpxCore';

// Generate split times (kilometers by kilometer analysis)
export interface GPXSplit {
  number: number;
  distance: number; // meters
  duration: number; // seconds
  elevationGain: number; // meters
  elevationLoss: number; // meters
  avgSpeed: number; // m/s
  avgPace: number; // seconds per km
  avgGAP: number | null;  // Grade Adjusted Pace — s/km
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgCadence: number | null;
  avgPower: number | null;
  avgTemp: number | null;
  avgGrade: number | null;
  maxSpeed: number;
  minElevation: number | null;
  maxElevation: number | null;
  cumulativeDistance: number;
  cumulativeElevationGain: number;
  ef: number | null; // Efficiency Factor = avgSpeed×1000/avgHR
}

// ─── GAP — Grade Adjusted Pace ───────────────────────────────────────────────

// Minetti et al. 2002 metabolic cost on slopes
function metabolicCost(grade: number): number {
  const i = Math.max(-0.45, Math.min(0.45, grade / 100));
  return 155.4*i**5 - 30.4*i**4 - 43.3*i**3 + 46.3*i**2 + 19.5*i + 3.6;
}
const FLAT_COST = metabolicCost(0); // 3.6 J/kg/m on flat

export function gapFactor(grade: number): number {
  const cost = metabolicCost(grade);
  return cost > 0 ? FLAT_COST / cost : 1;
}

export function calculateSplits(activity: GPXActivity, splitDistance = 1000): GPXSplit[] {
  const splits: GPXSplit[] = [];
  const points = activity.points;
  if (points.length === 0) return [];

  let splitNum = 1;
  let splitStartTime = points[0].time;
  let splitStartDist = 0;

  let splitEleGain = 0;
  let splitEleLoss = 0;

  let hrSum = 0;
  let hrCount = 0;
  let hrMax = 0;

  let cadSum = 0;
  let cadCount = 0;

  let powerSum = 0;
  let powerCount = 0;

  let tempSum = 0;
  let tempCount = 0;

  let gradeSum = 0;
  let gradeCount = 0;
  let gapSpeedSum = 0;
  let gapSpeedCount = 0;
  let efSpeedSum = 0;
  let efHrSum = 0;
  let efCount = 0;
  let splitMaxSpeed = 0;
  let splitMinEle: number | null = null;
  let splitMaxEle: number | null = null;

  let cumulativeDist = 0;
  let cumulativeEleGain = 0;

  let currentKmTarget = splitDistance;

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    const prev = points[i - 1];

    // Accumulate elevation changes in this split
    if (pt.ele !== null && prev.ele !== null) {
      const eleDiff = pt.ele - prev.ele;
      if (Math.abs(eleDiff) > 0.25) {
        if (eleDiff > 0) {
          splitEleGain += eleDiff;
        } else {
          splitEleLoss += Math.abs(eleDiff);
        }
      }
    }

    if (pt.hr !== null) {
      hrSum += pt.hr;
      hrCount++;
      if (pt.hr > hrMax) hrMax = pt.hr;
    }

    if (pt.cad !== null) {
      cadSum += pt.cad;
      cadCount++;
    }

    if (pt.power !== null) {
      powerSum += pt.power;
      powerCount++;
    }

    if (pt.temp !== null) {
      tempSum += pt.temp;
      tempCount++;
    }

    // Track grade
    if (pt.grade !== null && pt.grade !== 0) {
      gradeSum += pt.grade;
      gradeCount++;
    }

    // GAP: accumulate grade-adjusted speed per point
    if (pt.speed !== null && pt.speed > 0 && pt.grade !== null) {
      const gf = gapFactor(pt.grade);
      gapSpeedSum += pt.speed * gf;
      gapSpeedCount++;
    }

    // Efficiency Factor: speed / HR
    if (pt.speed !== null && pt.speed > 0 && pt.hr !== null && pt.hr > 0) {
      efSpeedSum += pt.speed;
      efHrSum += pt.hr;
      efCount++;
    }

    // Track max speed per split
    if (pt.speed !== null && pt.speed > splitMaxSpeed) {
      splitMaxSpeed = pt.speed;
    }

    // Track min/max elevation per split
    if (pt.ele !== null) {
      if (splitMinEle === null || pt.ele < splitMinEle) splitMinEle = pt.ele;
      if (splitMaxEle === null || pt.ele > splitMaxEle) splitMaxEle = pt.ele;
    }

    // Check if we passed the kilometer target or it's the last point
    if (pt.distFromStart >= currentKmTarget || i === points.length - 1) {
      const distCovered = pt.distFromStart - splitStartDist;

      let duration = 0;
      if (pt.time && splitStartTime) {
        duration = (pt.time.getTime() - splitStartTime.getTime()) / 1000;
      } else {
        duration = distCovered / (activity.avgSpeed || 4);
      }

      const avgSpeed = duration > 0 ? distCovered / duration : 0;
      const avgPace = avgSpeed > 0 ? 1000 / avgSpeed : 0;

      cumulativeDist += distCovered;
      cumulativeEleGain += splitEleGain;

      splits.push({
        number: splitNum,
        distance: distCovered,
        duration,
        elevationGain: Math.round(splitEleGain * 10) / 10,
        elevationLoss: Math.round(splitEleLoss * 10) / 10,
        avgSpeed,
        avgPace,
        avgHeartRate: hrCount > 0 ? Math.round(hrSum / hrCount) : null,
        maxHeartRate: hrCount > 0 ? hrMax : null,
        avgCadence: cadCount > 0 ? Math.round(cadSum / cadCount) : null,
        avgPower: powerCount > 0 ? Math.round(powerSum / powerCount) : null,
        avgTemp: tempCount > 0 ? Math.round((tempSum / tempCount) * 10) / 10 : null,
        avgGrade: gradeCount > 0 ? Math.round((gradeSum / gradeCount) * 10) / 10 : null,
        avgGAP: gapSpeedCount > 0 ? Math.round(1000 / (gapSpeedSum / gapSpeedCount)) : null,
        ef: efCount > 0 ? Math.round((efSpeedSum / efCount) * 1000 / (efHrSum / efCount) * 100) / 100 : null,
        maxSpeed: splitMaxSpeed,
        minElevation: splitMinEle !== null ? Math.round(splitMinEle * 10) / 10 : null,
        maxElevation: splitMaxEle !== null ? Math.round(splitMaxEle * 10) / 10 : null,
        cumulativeDistance: Math.round(cumulativeDist),
        cumulativeElevationGain: Math.round(cumulativeEleGain * 10) / 10,
      });

      // Reset for next split
      splitNum++;
      splitStartDist = pt.distFromStart;
      splitStartTime = pt.time;
      splitEleGain = 0;
      splitEleLoss = 0;
      hrSum = 0;
      hrCount = 0;
      hrMax = 0;
      cadSum = 0;
      cadCount = 0;
      powerSum = 0;
      powerCount = 0;
      tempSum = 0;
      tempCount = 0;
      gradeSum = 0;
      gradeCount = 0;
      gapSpeedSum = 0;
      gapSpeedCount = 0;
      efSpeedSum = 0;
      efHrSum = 0;
      efCount = 0;
      splitMaxSpeed = 0;
      splitMinEle = null;
      splitMaxEle = null;

      currentKmTarget += splitDistance;
    }
  }

  return splits;
}
