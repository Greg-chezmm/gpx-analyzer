import { useState, useCallback, useEffect } from 'react';
import {
  fetchStoredSegments, createStoredSegment, deleteStoredSegment, updateStoredSegmentAttempts,
  type StoredSegment,
} from '../utils/firestoreStorage';
import type { CachedSegmentAttempt } from '../utils/segments';

export interface StoredSegmentsHandle {
  segments: StoredSegment[];
  loading: boolean;
  create: (segment: Omit<StoredSegment, 'id'>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Persiste le classement en cache d'un segment et met à jour l'état local sans re-fetch complet. */
  updateAttempts: (id: string, attempts: CachedSegmentAttempt[], lastFullScanAt?: string) => Promise<void>;
}

/** Liste + CRUD des segments définis manuellement par l'utilisateur (Firestore, `users/{uid}/segments`). */
export function useStoredSegments(uid: string | null): StoredSegmentsHandle {
  const [segments, setSegments] = useState<StoredSegment[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!uid) { setSegments([]); return; }
    setLoading(true);
    try {
      setSegments(await fetchStoredSegments(uid));
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (segment: Omit<StoredSegment, 'id'>) => {
    if (!uid) return;
    await createStoredSegment(uid, segment);
    await refresh();
  }, [uid, refresh]);

  const remove = useCallback(async (id: string) => {
    if (!uid) return;
    await deleteStoredSegment(uid, id);
    await refresh();
  }, [uid, refresh]);

  const updateAttempts = useCallback(async (id: string, attempts: CachedSegmentAttempt[], lastFullScanAt?: string) => {
    if (!uid) return;
    await updateStoredSegmentAttempts(uid, id, attempts, lastFullScanAt);
    setSegments(prev => prev.map(s => s.id === id ? { ...s, attempts, ...(lastFullScanAt ? { lastFullScanAt } : {}) } : s));
  }, [uid]);

  return { segments, loading, create, remove, updateAttempts };
}
