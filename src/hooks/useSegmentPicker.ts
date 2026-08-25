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

  return { ...state, begin, handleClick, reset };
}
