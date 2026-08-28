/** Un fond de carte sélectionnable — voir useBasemap.ts. */
export interface BasemapDef {
  id: 'street' | 'topo' | 'cycle';
  label: string;
  /** Nécessite une clé API fournie par l'utilisateur (voir useBasemap.ts) pour charger ses tuiles. */
  requiresKey?: boolean;
}

/**
 * Fonds de carte disponibles — CARTO (utilisé auparavant) exige désormais une clé API sur son offre
 * gratuite (2026-08-28). "Cyclisme" (CyclOSM) et "Rues" (OSM France) sont gratuits sans clé ;
 * "Relief" (Tracestrack Topo, demande de Greg) nécessite une clé API gratuite sur inscription
 * (tracestrack.com), stockée localement (voir useBasemap.ts), jamais committée dans le code.
 */
export const BASEMAPS: BasemapDef[] = [
  { id: 'street', label: 'Rues' },
  { id: 'topo', label: 'Relief', requiresKey: true },
  { id: 'cycle', label: 'Cyclisme' },
];

export const DEFAULT_BASEMAP_ID: BasemapDef['id'] = 'street';

export interface TileConfig {
  url: string;
  subdomains?: string;
  maxZoom: number;
  attribution: string;
}

/**
 * Construit la config de tuiles Leaflet pour un fond de carte donné. `tracestrackKey` n'est utilisé
 * que pour "Relief" — ignoré pour les autres. URL Tracestrack confirmée par Greg (2026-08-28) via son
 * tableau de bord — noter le format `.webp` (pas `.png`).
 */
export function getTileConfig(id: BasemapDef['id'], tracestrackKey: string): TileConfig {
  switch (id) {
    case 'cycle':
      return {
        url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        subdomains: 'abc', maxZoom: 20,
        attribution: '&copy; CyclOSM | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      };
    case 'topo':
      return {
        url: `https://tile.tracestrack.com/topo_fr/{z}/{x}/{y}.webp?key=${tracestrackKey}`,
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.tracestrack.com">Tracestrack</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      };
    case 'street':
    default:
      return {
        url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
        subdomains: 'abc', maxZoom: 19,
        attribution: '&copy; OpenStreetMap France | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      };
  }
}
