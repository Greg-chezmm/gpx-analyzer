import { useState } from "react";

/** Correction manuelle d'un temps de référence (ex. 10K/marathon couru sans GPS, ou temps mal calculé). */
export interface ManualBest {
  timeSeconds: number;
  date: string; // YYYY-MM-DD
}

/** Temps manuels par distance standard (clés RUN_DISTANCES : '400m'/'1km'/'5km'/'10km'/'21km'/'42km'). */
export type ManualBests = Record<string, ManualBest>;

const KEY = "gpx_manual_bests";

function load(): ManualBests {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as ManualBests) : {};
  } catch {
    return {};
  }
}

/**
 * Corrections manuelles des meilleurs temps par distance standard — persistées en localStorage,
 * synchronisées avec Firestore (voir App.tsx). Prennent le pas sur le temps auto-calculé depuis
 * l'historique GPX/FIT (voir aggregateBestRunEfforts) quand l'utilisateur ne fait pas confiance à
 * l'estimation automatique (contamination vélo, séance non trackée GPS...).
 */
export function useManualBests() {
  const [manualBests, setManualBestsRaw] = useState<ManualBests>(load);

  const setManualBests = (bests: ManualBests) => {
    localStorage.setItem(KEY, JSON.stringify(bests));
    setManualBestsRaw(bests);
  };

  const setOne = (key: string, best: ManualBest | null) => {
    const next = { ...manualBests };
    if (best) next[key] = best; else delete next[key];
    setManualBests(next);
  };

  return { manualBests, setManualBests, setOne };
}
