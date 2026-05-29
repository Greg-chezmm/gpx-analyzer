/// <reference lib="webworker" />

import { parseGPX } from '../utils/gpxCore';
import { parseFIT } from '../utils/fitParser';

interface WorkerRequest {
  data: string | ArrayBuffer;
  name: string;
  isFit: boolean;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { data, name, isFit } = e.data;
  try {
    const activity = isFit && data instanceof ArrayBuffer
      ? await parseFIT(data, name)
      : parseGPX(data as string, name);
    self.postMessage({ ok: true, activity });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : 'Erreur de parsing.' });
  }
};
