import { useState } from "react";

export interface RaceGoalConfig {
  date: string;                          // YYYY-MM-DD
  activityType: 'running' | 'cycling';
  distanceKm: number;
  name: string;
}

const KEY = "gpx_race_goal";

function load(): RaceGoalConfig | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as RaceGoalConfig) : null;
  } catch {
    return null;
  }
}

/** Objectif course courant — persisté en localStorage, utilisé pour la projection TSB (voir raceGoal.ts). */
export function useRaceGoal() {
  const [goal, setGoalRaw] = useState<RaceGoalConfig | null>(load);

  const setGoal = (g: RaceGoalConfig | null) => {
    if (g) localStorage.setItem(KEY, JSON.stringify(g));
    else localStorage.removeItem(KEY);
    setGoalRaw(g);
  };

  return { goal, setGoal };
}
