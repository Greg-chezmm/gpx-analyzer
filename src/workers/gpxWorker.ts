/// <reference lib="webworker" />
import { parseGPX } from '../utils/gpxParser';

self.onmessage = (e: MessageEvent<{ gpxText: string; name: string }>) => {
  try {
    const activity = parseGPX(e.data.gpxText, e.data.name);
    self.postMessage({ ok: true, activity });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : 'Erreur de parsing GPX' });
  }
};
