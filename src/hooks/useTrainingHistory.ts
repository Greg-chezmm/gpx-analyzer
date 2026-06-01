import { useState, useCallback } from 'react';

export interface TrainingEntry {
  date: string;    // YYYY-MM-DD
  trimp: number;   // Edwards TRIMP
  name: string;
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
      // Deduplicate: same date + same name = same activity
      if (prev.some(e => e.date === entry.date && e.name === entry.name)) return prev;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - MAX_DAYS);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const next = [...prev.filter(e => e.date >= cutoffStr), entry]
        .sort((a, b) => a.date.localeCompare(b.date));
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(KEY);
    setHistory([]);
  }, []);

  return { history, addEntry, clearHistory };
}
