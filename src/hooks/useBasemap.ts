import { useState, useEffect, useMemo } from 'react';
import { BASEMAPS, DEFAULT_BASEMAP_ID, getTileConfig, type BasemapDef } from '../utils/basemaps';

const STORAGE_KEY = 'gpx_basemap';
const KEY_STORAGE_KEY = 'gpx_tracestrack_key';

// Clé de build (voir .env.local.example, .github/workflows/deploy.yml) — même mécanisme que
// VITE_FIREBASE_*/VITE_GOOGLE_CLIENT_ID, ces clés publiques n'ont pas besoin de backend pour être
// cachées. Prioritaire sur le champ de réglage local si présente (évite d'avoir à la re-saisir).
const ENV_TRACESTRACK_KEY = import.meta.env.VITE_TRACESTRACK_KEY as string | undefined;

/** Fond de carte choisi par l'utilisateur (Rues/Relief/Cyclisme), persisté en localStorage et partagé
 * entre toutes les cartes Leaflet de l'app (comme useTheme). Gère aussi la clé API Tracestrack
 * (nécessaire pour "Relief") — variable d'environnement de build en priorité, sinon champ de réglage
 * local (utile pour un déploiement sans accès aux secrets GitHub, ex. fork). */
export function useBasemap() {
  const [basemapId, setBasemapId] = useState<BasemapDef['id']>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return BASEMAPS.find(b => b.id === stored)?.id ?? DEFAULT_BASEMAP_ID;
  });
  const [localTracestrackKey, setLocalTracestrackKeyRaw] = useState(() => localStorage.getItem(KEY_STORAGE_KEY) ?? '');

  useEffect(() => { localStorage.setItem(STORAGE_KEY, basemapId); }, [basemapId]);

  const setTracestrackKey = (key: string) => {
    localStorage.setItem(KEY_STORAGE_KEY, key);
    setLocalTracestrackKeyRaw(key);
  };

  const tracestrackKey = ENV_TRACESTRACK_KEY || localTracestrackKey;
  const basemapDef = useMemo(() => BASEMAPS.find(b => b.id === basemapId) ?? BASEMAPS[0], [basemapId]);
  // Mémoïsé : sans ça, un nouvel objet `tile` à chaque rendu (ex. déclenché par le survol de la
  // carte, qui remonte hoveredPointIndex jusqu'ici) fait tourner en boucle l'effet de bascule de
  // fond de carte dans ActivityMap.tsx/SegmentPickerMapModal.tsx (dépendance `[tile]`), rechargeant
  // les tuiles à chaque mouvement de souris — bug réel constaté par Greg (scintillement du fond).
  const tile = useMemo(() => getTileConfig(basemapId, tracestrackKey), [basemapId, tracestrackKey]);

  return { basemapDef, basemapId, setBasemapId, tile, tracestrackKey, setTracestrackKey };
}
