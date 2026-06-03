import { useState, useCallback } from 'react';

export interface TrainingEntry {
  date: string;          // YYYY-MM-DD
  trimp: number;         // Edwards TRIMP
  name: string;
  // Optional enriched fields (populated from v2 onwards)
  activityType?: string;
  distance?: number;     // metres
  duration?: number;     // seconds (movingTime)
  elevationGain?: number;
  avgPace?: number;      // s/km
  avgSpeed?: number;     // km/h
  avgHeartRate?: number;
}

const KEY = 'gpx_training_history';
const MAX_DAYS = 180;

function loadHistory(): TrainingEntry[] {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as TrainingEntry[]) : [];
  } catch {
    return [];
  }
}

export function useTrainingHistory() {
  const [history, setHistory] = useState<TrainingEntry[]>(loadHistory);

  const addEntry = useCallback((entry: TrainingEntry) => {
    if (!entry.date || entry.trimp <= 0) return;
    setHistory(prev => {
      // Match by physical identity (duration+distance) when available — stable across renames
      const existingIdx = prev.findIndex(e => {
        if (entry.duration && entry.distance && e.duration && e.distance) {
          return e.date === entry.date &&
                 Math.round(e.duration) === Math.round(entry.duration) &&
                 Math.round(e.distance) === Math.round(entry.distance);
        }
        return e.date === entry.date && e.name === entry.name;
      });
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - MAX_DAYS);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      let next: TrainingEntry[];
      if (existingIdx >= 0) {
        next = [...prev];
        next[existingIdx] = { ...prev[existingIdx], ...entry };
      } else {
        next = [...prev.filter(e => e.date >= cutoffStr), entry];
      }
      next = next.sort((a, b) => a.date.localeCompare(b.date));
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const updateEntry = useCallback((date: string, oldName: string, updates: Partial<TrainingEntry>) => {
    setHistory(prev => {
      const idx = prev.findIndex(e => e.date === date && e.name === oldName);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...updates };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const replaceHistory = useCallback((entries: TrainingEntry[]) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const sorted = [...entries]
      .filter(e => e.date >= cutoffStr)
      .sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem(KEY, JSON.stringify(sorted));
    setHistory(sorted);
  }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(KEY);
    setHistory([]);
  }, []);

  return { history, addEntry, updateEntry, replaceHistory, clearHistory };
}
