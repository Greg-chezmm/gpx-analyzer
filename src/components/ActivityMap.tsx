import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { GPXTrackPoint } from "../utils/gpxParser";
import { MapPin } from "lucide-react";

// Correction des icônes Leaflet : le bundler Vite ne résout pas _getIconUrl correctement
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

type ColorMode = 'none' | 'speed' | 'hr' | 'grade';

interface ActivityMapProps {
  points: GPXTrackPoint[];
  hoveredPointIndex: number | null;
  onHoverPointChange?: (index: number | null) => void;
  hasHeartRate?: boolean;
}

/** Interpolation linéaire scalaire entre a et b. */
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

/** Interpolation linéaire RGB entre deux couleurs, retourne une string "rgb(…)". */
function lerpRgb(a: [number,number,number], b: [number,number,number], t: number): string {
  return `rgb(${Math.round(lerp(a[0],b[0],t))},${Math.round(lerp(a[1],b[1],t))},${Math.round(lerp(a[2],b[2],t))})`;
}

/**
 * Mappe une valeur normalisée [0, 1] sur un dégradé bleu → vert → jaune → rouge.
 * Utilisé pour les modes vitesse et FC.
 */
function valueToColor(t: number): string {
  t = Math.max(0, Math.min(1, t));
  const stops: [number, number, number][] = [
    [59, 130, 246],   // bleu = lent / FC basse
    [16, 185, 129],   // vert
    [251, 191, 36],   // jaune
    [239, 68, 68],    // rouge = rapide / FC haute
  ];
  const n = stops.length - 1;
  const pos = t * n;
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, n);
  return lerpRgb(stops[lo], stops[hi], pos - lo);
}

/**
 * Mappe une pente en % sur une échelle divergente bleu (descente) → gris (plat) → rouge (montée).
 * Plage [-20 %, +20 %] → [0, 1] avec 0,5 = plat.
 */
function gradeToColor(grade: number): string {
  const t = Math.max(0, Math.min(1, (grade + 20) / 40));
  const gray: [number,number,number] = [148, 163, 184];
  if (t < 0.5) return lerpRgb([59, 130, 246], gray, t / 0.5);
  return lerpRgb(gray, [239, 68, 68], (t - 0.5) / 0.5);
}

/**
 * Carte Leaflet interactive du parcours — affiche le tracé coloré par vitesse, FC ou pente,
 * les marqueurs kilométriques, et synchronise le point survolé avec les autres composants.
 */
export const ActivityMap: React.FC<ActivityMapProps> = ({
  points,
  hoveredPointIndex,
  onHoverPointChange,
  hasHeartRate = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<L.Map | null>(null);
  const polylineRef     = useRef<L.Polyline | null>(null);
  const colorSegmentsRef = useRef<L.Polyline[]>([]);
  const hoverMarkerRef  = useRef<L.Marker | null>(null);
  const kmMarkersRef    = useRef<L.Marker[]>([]);
  // Ref pour éviter de recapturer onHoverPointChange dans les listeners Leaflet
  const onHoverRef = useRef(onHoverPointChange);
  const [colorMode, setColorMode] = useState<ColorMode>('none');

  useEffect(() => { onHoverRef.current = onHoverPointChange; }, [onHoverPointChange]);

  // Initialisation de la carte — s'exécute à chaque chargement d'activité
  useEffect(() => {
    if (!mapContainerRef.current || points.length === 0) return;

    // Destruction de la carte précédente si elle existe
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const startPt = points[0];
    const map = L.map(mapContainerRef.current, { zoomControl: true, scrollWheelZoom: true })
      .setView([startPt.lat, startPt.lon], 13);
    mapRef.current = map;

    // Fond de carte CartoDB Voyager (léger, adapté aux tracés sportifs)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);

    map.fitBounds(
      L.latLngBounds(points.map(p => [p.lat, p.lon] as [number, number])),
      { padding: [30, 30] }
    );

    // Marqueurs de départ (vert) et d'arrivée (rouge)
    L.circleMarker([startPt.lat, startPt.lon], {
      radius: 7, fillColor: "#10b981", color: "#ffffff", weight: 2, fillOpacity: 1,
    }).addTo(map).bindTooltip("Départ", { permanent: false, direction: "top", className: "map-tooltip" });

    const endPt = points[points.length - 1];
    L.circleMarker([endPt.lat, endPt.lon], {
      radius: 7, fillColor: "#e11d48", color: "#ffffff", weight: 2, fillOpacity: 1,
    }).addTo(map).bindTooltip("Arrivée", { permanent: false, direction: "top", className: "map-tooltip" });

    // Marqueurs kilométriques : pas adaptatif selon la distance totale
    kmMarkersRef.current = [];
    const totalKm = Math.floor(points[points.length - 1].distFromStart / 1000);
    // Pas de 1 km jusqu'à 20 km, 5 km jusqu'à 100 km, puis 10 km
    const kmStep = totalKm <= 20 ? 1 : totalKm <= 100 ? 5 : 10;
    for (let km = kmStep; km <= totalKm; km += kmStep) {
      let ptIdx = -1;
      for (let i = 0; i < points.length; i++) {
        if (points[i].distFromStart >= km * 1000) { ptIdx = i; break; }
      }
      if (ptIdx < 0) continue;
      const pt = points[ptIdx];
      kmMarkersRef.current.push(
        L.marker([pt.lat, pt.lon], {
          icon: L.divIcon({
            className: '',
            html: `<div style="width:20px;height:20px;border-radius:50%;background:#4f46e5;color:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);line-height:1">${km}</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          }),
          interactive: false,
          zIndexOffset: 100,
        }).addTo(map)
      );
    }

    // Marqueur de survol — position mise à jour par l'effet dédié ci-dessous
    hoverMarkerRef.current = L.marker([startPt.lat, startPt.lon], {
      icon: L.divIcon({
        className: "custom-div-icon",
        html: '<div class="map-marker-pulse"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      }),
      zIndexOffset: 1000,
    });

    // Détection du point le plus proche au survol de la carte
    // Sous-échantillonnage par pas pour limiter le coût de la boucle sur grands GPX
    const searchStep = Math.max(1, Math.floor(points.length / 500));
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      if (!onHoverRef.current) return;
      const ml = e.latlng;
      let minDist = Infinity;
      let closestIdx = 0;
      for (let i = 0; i < points.length; i += searchStep) {
        const d = ml.distanceTo(L.latLng(points[i].lat, points[i].lon));
        if (d < minDist) { minDist = d; closestIdx = i; }
      }
      const mousePx   = map.latLngToContainerPoint(ml);
      const closestPx = map.latLngToContainerPoint(L.latLng(points[closestIdx].lat, points[closestIdx].lon));
      // Seuil de 30 px : en dehors du tracé, on ne surligne rien
      onHoverRef.current(Math.hypot(mousePx.x - closestPx.x, mousePx.y - closestPx.y) < 30 ? closestIdx : null);
    });
    map.on('mouseout', () => { if (onHoverRef.current) onHoverRef.current(null); });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [points]);

  // Rendu du tracé — reconstruit uniquement quand le mode de couleur change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;

    if (polylineRef.current) { map.removeLayer(polylineRef.current); polylineRef.current = null; }
    colorSegmentsRef.current.forEach(s => map.removeLayer(s));
    colorSegmentsRef.current = [];

    if (colorMode === 'none') {
      // Tracé uniforme (couleur accent)
      polylineRef.current = L.polyline(
        points.map(p => [p.lat, p.lon] as [number, number]),
        { color: "#4f46e5", weight: 5, opacity: 0.85, lineJoin: "round" }
      ).addTo(map);
      return;
    }

    // Sous-échantillonnage pour limiter le nombre de segments Canvas (max ~400)
    const stride = Math.max(1, Math.floor(points.length / 400));
    const sampled: GPXTrackPoint[] = [];
    for (let i = 0; i < points.length; i += stride) sampled.push(points[i]);
    if (sampled[sampled.length - 1] !== points[points.length - 1]) sampled.push(points[points.length - 1]);

    const renderer = L.canvas({ padding: 0.1 });
    const segs: L.Polyline[] = [];

    if (colorMode === 'grade') {
      for (let i = 1; i < sampled.length; i++) {
        const prev = sampled[i - 1];
        const curr = sampled[i];
        segs.push(
          L.polyline([[prev.lat, prev.lon], [curr.lat, curr.lon]], {
            color: gradeToColor(curr.grade ?? 0), weight: 5, opacity: 0.9, renderer,
          }).addTo(map)
        );
      }
    } else {
      // Normalisation min-max sur les valeurs non nulles
      const vals = sampled.map(p => colorMode === 'speed' ? (p.speed ?? 0) : (p.hr ?? 0));
      const validVals = vals.filter(v => v > 0);
      const minV = validVals.reduce((m, v) => v < m ? v : m, Infinity);
      const maxV = validVals.reduce((m, v) => v > m ? v : m, -Infinity);

      for (let i = 1; i < sampled.length; i++) {
        const prev = sampled[i - 1];
        const curr = sampled[i];
        const val = colorMode === 'speed' ? (curr.speed ?? 0) : (curr.hr ?? 0);
        const t = maxV > minV ? (val - minV) / (maxV - minV) : 0.5;
        segs.push(
          L.polyline([[prev.lat, prev.lon], [curr.lat, curr.lon]], {
            color: valueToColor(t), weight: 5, opacity: 0.9, renderer,
          }).addTo(map)
        );
      }
    }

    colorSegmentsRef.current = segs;
  }, [points, colorMode]);

  // Synchronisation du marqueur de survol avec hoveredPointIndex
  useEffect(() => {
    const map    = mapRef.current;
    const marker = hoverMarkerRef.current;
    if (!map || !marker || points.length === 0) return;

    if (hoveredPointIndex === null) {
      if (map.hasLayer(marker)) map.removeLayer(marker);
      return;
    }
    const pt = points[hoveredPointIndex];
    if (!pt) return;
    marker.setLatLng([pt.lat, pt.lon]);
    if (!map.hasLayer(marker)) marker.addTo(map);

    // Recadrage automatique si le point sort du viewport
    const bounds = map.getBounds();
    if (!bounds.contains(L.latLng(pt.lat, pt.lon))) map.panTo([pt.lat, pt.lon]);
  }, [hoveredPointIndex, points]);

  /** Recentre la carte pour afficher l'ensemble du tracé. */
  const handleRecenter = () => {
    if (!mapRef.current || points.length === 0) return;
    mapRef.current.fitBounds(
      L.latLngBounds(points.map(p => [p.lat, p.lon] as [number, number])),
      { padding: [30, 30] }
    );
  };

  const COLOR_MODES: { id: ColorMode; label: string; available: boolean }[] = [
    { id: 'none',  label: 'Tracé',       available: true },
    { id: 'speed', label: '⚡ Vitesse',  available: true },
    { id: 'hr',    label: '❤️ Cardio',  available: hasHeartRate },
    { id: 'grade', label: '⛰️ Pente',   available: true },
  ];

  return (
    <div className="card animate-slide-up" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="panel-header" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <h3 className="panel-title">
          <MapPin size={18} style={{ color: "var(--accent-primary)" }} />
          <span>📍 Carte Interactive du Parcours</span>
        </h3>
        <div className="panel-actions" style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* Sélecteur de mode de couleur du tracé */}
          <div style={{
            display: "flex", gap: "2px",
            backgroundColor: "var(--bg-primary)",
            padding: "3px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-color)",
          }}>
            {COLOR_MODES.filter(m => m.available).map(mode => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setColorMode(mode.id)}
                style={{
                  padding: "0.25rem 0.65rem",
                  fontSize: "0.78rem",
                  borderRadius: "calc(var(--radius-sm) - 2px)",
                  border: "none",
                  backgroundColor: colorMode === mode.id ? "var(--accent-primary)" : "transparent",
                  color: colorMode === mode.id ? "#ffffff" : "var(--text-secondary)",
                  cursor: "pointer",
                  fontWeight: colorMode === mode.id ? 700 : 400,
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-outline"
            style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}
            onClick={handleRecenter}
          >
            Recentrer
          </button>
        </div>
      </div>

      {/* Barre de légende du dégradé de couleur */}
      {colorMode !== 'none' && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.6rem",
          padding: "0.35rem 0 0.15rem",
          fontSize: "0.75rem", color: "var(--text-secondary)",
        }}>
          {colorMode === 'grade' ? (
            <>
              <span style={{ fontWeight: 600, color: "#60a5fa" }}>Descente</span>
              <div style={{
                flex: 1, height: "7px", borderRadius: "4px",
                background: "linear-gradient(to right, rgb(59,130,246), rgb(148,163,184), rgb(239,68,68))",
              }} />
              <span style={{ fontWeight: 600, color: "#ef4444" }}>Montée</span>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 600 }}>{colorMode === 'speed' ? 'Lent' : 'FC basse'}</span>
              <div style={{
                flex: 1, height: "7px", borderRadius: "4px",
                background: "linear-gradient(to right, rgb(59,130,246), rgb(16,185,129), rgb(251,191,36), rgb(239,68,68))",
              }} />
              <span style={{ fontWeight: 600 }}>{colorMode === 'speed' ? 'Rapide' : 'FC élevée'}</span>
            </>
          )}
        </div>
      )}

      <div className="map-wrapper" ref={mapContainerRef} />
    </div>
  );
};
