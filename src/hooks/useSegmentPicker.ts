import { useState, useCallback } from 'react';

export type PickerStage = 'idle' | 'pick-start' | 'pick-end' | 'ready';

export interface SegmentPickerHandle {
  stage: PickerStage;
  start: number | null;
  end: number | null;
  /** Arme la sélection : le prochain clic sur la carte fixe le point de départ. */
  begin: () => void;
  /** Reçoit l'index de point cliqué sur la carte (voir ActivityMap.onPointClick). */
  handleClick: (index: number) => void;
  /** Annule la sélection en cours ou termine après enregistrement/abandon du formulaire de nommage. */
  reset: () => void;
  /** Déplace le point de départ de `delta` index (borné à [0, end-1] une fois la fin fixée, sinon
   * [0, maxIndex]) — permet d'affiner la sélection point par point (voir SegmentPickerMapModal). */
  nudgeStart: (delta: number, maxIndex: number) => void;
  /** Déplace le point d'arrivée de `delta` index (borné à [start+1, maxIndex]). */
  nudgeEnd: (delta: number, maxIndex: number) => void;
}

interface PickerState { stage: PickerStage; start: number | null; end: number | null; }
const IDLE_STATE: PickerState = { stage: 'idle', start: null, end: null };

/** État de la sélection manuelle de segment : deux clics sur la carte (début, fin), voir ActivityMap + StoredSegments. */
export function useSegmentPicker(): SegmentPickerHandle {
  const [state, setState] = useState<PickerState>(IDLE_STATE);

  const begin = useCallback(() => setState({ stage: 'pick-start', start: null, end: null }), []);
  const reset = useCallback(() => setState(IDLE_STATE), []);

  const handleClick = useCallback((index: number) => {
    setState(s => {
      if (s.stage === 'pick-start') return { stage: 'pick-end', start: index, end: null };
      if (s.stage === 'pick-end') {
        if (s.start === null || index === s.start) return s; // clic ignoré (même point)
        return { stage: 'ready', start: Math.min(s.start, index), end: Math.max(s.start, index) };
      }
      return s;
    });
  }, []);

  const nudgeStart = useCallback((delta: number, maxIndex: number) => {
    setState(s => {
      if (s.start === null) return s;
      const upperBound = s.end !== null ? s.end - 1 : maxIndex;
      const next = Math.max(0, Math.min(upperBound, s.start + delta));
      return next === s.start ? s : { ...s, start: next };
    });
  }, []);

  const nudgeEnd = useCallback((delta: number, maxIndex: number) => {
    setState(s => {
      if (s.end === null) return s;
      const lowerBound = s.start !== null ? s.start + 1 : 0;
      const next = Math.max(lowerBound, Math.min(maxIndex, s.end + delta));
      return next === s.end ? s : { ...s, end: next };
    });
  }, []);

  return { ...state, begin, handleClick, reset, nudgeStart, nudgeEnd };
}
