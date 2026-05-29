import React, { useEffect, useRef } from "react";
import L from "leaflet";
import { X, Mountain } from "lucide-react";
import type { GPXTrackPoint, ClimbSegment } from "../utils/gpxParser";
import { CLIMB_CATEGORIES } from "../utils/gpxParser";
import { formatDuration, formatPace } from "./SplitsTable";

interface ClimbMapModalProps {
  climb: ClimbSegment;
  climbIndex: number;
  points: GPXTrackPoint[];
  onClose: () => void;
}

export const ClimbMapModal: React.FC<ClimbMapModalProps> = ({
  climb,
  climbIndex,
  points,
  onClose,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<L.Map | null>(null);
  const def = CLIMB_CATEGORIES[climb.category];

  useEffect(() => {
    if (!mapRef.current) return;
    if (leafletRef.current) return;

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const tileUrl = isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

    const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true });
    leafletRef.current = map;

    L.tileLayer(tileUrl, {
      attribution: "© CARTO",
      maxZoom: 19,
    }).addTo(map);

    // Full track — thin gray
    if (points.length > 1) {
      const fullLatLngs = points.map(p => [p.lat, p.lon] as [number, number]);
      L.polyline(fullLatLngs, { color: isDark ? "#475569" : "#94a3b8", weight: 2, opacity: 0.6 }).addTo(map);
    }

    // Climb segment — thick colored
    const segPoints = points.slice(climb.startIndex, climb.endIndex + 1);
    if (segPoints.length > 1) {
      const segLatLngs = segPoints.map(p => [p.lat, p.lon] as [number, number]);
      const polyline = L.polyline(segLatLngs, { color: def.color, weight: 5, opacity: 0.95 }).addTo(map);

      // Start marker
      const startPt = segPoints[0];
      L.circleMarker([startPt.lat, startPt.lon], {
        radius: 7,
        fillColor: "#22c55e",
        color: "#fff",
        weight: 2,
        fillOpacity: 1,
      }).addTo(map).bindTooltip("Début", { permanent: false, direction: "top" });

      // End marker
      const endPt = segPoints[segPoints.length - 1];
      L.circleMarker([endPt.lat, endPt.lon], {
        radius: 7,
        fillColor: "#ef4444",
        color: "#fff",
        weight: 2,
        fillOpacity: 1,
      }).addTo(map).bindTooltip("Fin", { permanent: false, direction: "top" });

      map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
    }

    return () => {
      map.remove();
      leafletRef.current = null;
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: "var(--radius-lg)",
          width: "min(680px, 100%)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 50px rgba(0,0,0,0.35)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <Mountain size={18} style={{ color: def.color, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
              Montée #{climbIndex + 1} —{" "}
              <span style={{ color: def.color }}>{def.label}</span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
              {climb.distance >= 1000
                ? `${(climb.distance / 1000).toFixed(2)} km`
                : `${climb.distance} m`}{" "}
              · D+ {climb.elevGain} m · Pente moy. {climb.avgGrade.toFixed(1)}%
              {climb.avgPace > 0 && ` · ${formatPace(climb.avgPace)} /km`}
              {climb.duration > 0 && ` · ${formatDuration(climb.duration)}`}
              {climb.vam > 0 && ` · VAM ${climb.vam} m/h`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-tertiary)",
              padding: "0.25rem",
              display: "flex",
              alignItems: "center",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Map */}
        <div
          ref={mapRef}
          style={{ flex: 1, minHeight: "380px" }}
        />
      </div>
    </div>
  );
};
