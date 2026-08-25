import React, { useEffect, useRef } from "react";
import L from "leaflet";
import { X } from "lucide-react";

/** Seules lat/lon sont utilisées ici — un GPXTrackPoint[] ou un CachedSegmentAttempt.points[] conviennent tous les deux. */
interface MapPoint { lat: number; lon: number; }

interface SegmentMapModalProps {
  /** Points du tracé complet (fond de carte gris) */
  points: MapPoint[];
  /** Index de début du segment coloré dans points[] */
  startIndex: number;
  /** Index de fin du segment coloré dans points[] */
  endIndex: number;
  /** Couleur de la polyligne du segment */
  segmentColor: string;
  /** Libellé du marqueur de début (défaut : "Début") */
  startLabel?: string;
  /** Libellé du marqueur de fin (défaut : "Fin") */
  endLabel?: string;
  /** Icône affichée à gauche du titre */
  icon: React.ReactNode;
  /** Première ligne du header */
  title: React.ReactNode;
  /** Ligne de métriques sous le titre */
  subtitle: React.ReactNode;
  onClose: () => void;
}

/**
 * Modale générique affichant un segment coloré sur la carte Leaflet.
 * Réutilisée par ClimbMapModal, IntervalMapModal et HillRepeatMapModal.
 */
export const SegmentMapModal: React.FC<SegmentMapModalProps> = ({
  points,
  startIndex,
  endIndex,
  segmentColor,
  startLabel = "Début",
  endLabel = "Fin",
  icon,
  title,
  subtitle,
  onClose,
}) => {
  const mapRef    = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<L.Map | null>(null);

  // Initialisation de la carte Leaflet (s'exécute une seule fois)
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const tileUrl = isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

    const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true });
    leafletRef.current = map;
    L.tileLayer(tileUrl, { attribution: "© CARTO", maxZoom: 19 }).addTo(map);

    // Tracé complet en gris fin (contexte géographique)
    if (points.length > 1) {
      const fullLatLngs = points.map(p => [p.lat, p.lon] as [number, number]);
      L.polyline(fullLatLngs, {
        color: isDark ? "#475569" : "#94a3b8",
        weight: 2,
        opacity: 0.6,
      }).addTo(map);
    }

    // Segment mis en valeur
    const segPoints = points.slice(startIndex, endIndex + 1);
    if (segPoints.length > 1) {
      const segLatLngs = segPoints.map(p => [p.lat, p.lon] as [number, number]);
      const polyline = L.polyline(segLatLngs, {
        color: segmentColor,
        weight: 5,
        opacity: 0.95,
      }).addTo(map);

      const startPt = segPoints[0];
      L.circleMarker([startPt.lat, startPt.lon], {
        radius: 7, fillColor: "#22c55e", color: "#fff", weight: 2, fillOpacity: 1,
      }).addTo(map).bindTooltip(startLabel, { permanent: false, direction: "top" });

      const endPt = segPoints[segPoints.length - 1];
      L.circleMarker([endPt.lat, endPt.lon], {
        radius: 7, fillColor: "#ef4444", color: "#fff", weight: 2, fillOpacity: 1,
      }).addTo(map).bindTooltip(endLabel, { permanent: false, direction: "top" });

      map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
    }

    return () => { map.remove(); leafletRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fermeture au clavier (Échap)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-lg)", width: "min(680px, 100%)",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        overflow: "hidden", boxShadow: "0 25px 50px rgba(0,0,0,0.35)",
      }}>
        {/* En-tête : icône, titre, métriques, bouton fermer */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.75rem",
          padding: "1rem 1.25rem", borderBottom: "1px solid var(--border-color)",
        }}>
          <span style={{ flexShrink: 0 }}>{icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
              {title}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
              {subtitle}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-tertiary)", padding: "0.25rem",
              display: "flex", alignItems: "center", borderRadius: "var(--radius-sm)",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Carte Leaflet */}
        <div ref={mapRef} style={{ flex: 1, minHeight: "380px" }} />
      </div>
    </div>
  );
};
