import React, { useEffect, useRef } from "react";
import L from "leaflet";
import { X, Zap } from "lucide-react";
import type { GPXTrackPoint } from "../utils/gpxParser";
import type { GPXInterval } from "../utils/intervals";
import { formatDuration, formatPace } from "./SplitsTable";

interface IntervalMapModalProps {
  interval: GPXInterval;
  intervalIndex: number;
  points: GPXTrackPoint[];
  onClose: () => void;
}

export const IntervalMapModal: React.FC<IntervalMapModalProps> = ({
  interval,
  intervalIndex,
  points,
  onClose,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (leafletRef.current) return;

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const tileUrl = isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

    const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true });
    leafletRef.current = map;

    L.tileLayer(tileUrl, { attribution: "© CARTO", maxZoom: 19 }).addTo(map);

    // Full track — thin gray
    if (points.length > 1) {
      const fullLatLngs = points.map(p => [p.lat, p.lon] as [number, number]);
      L.polyline(fullLatLngs, { color: isDark ? "#475569" : "#94a3b8", weight: 2, opacity: 0.6 }).addTo(map);
    }

    // Interval segment — thick orange
    const segPoints = points.slice(interval.startPointIndex, interval.endPointIndex + 1);
    if (segPoints.length > 1) {
      const segLatLngs = segPoints.map(p => [p.lat, p.lon] as [number, number]);
      const polyline = L.polyline(segLatLngs, { color: "#f97316", weight: 5, opacity: 0.95 }).addTo(map);

      const startPt = segPoints[0];
      L.circleMarker([startPt.lat, startPt.lon], {
        radius: 7, fillColor: "#22c55e", color: "#fff", weight: 2, fillOpacity: 1,
      }).addTo(map).bindTooltip("Début", { permanent: false, direction: "top" });

      const endPt = segPoints[segPoints.length - 1];
      L.circleMarker([endPt.lat, endPt.lon], {
        radius: 7, fillColor: "#ef4444", color: "#fff", weight: 2, fillOpacity: 1,
      }).addTo(map).bindTooltip("Fin", { permanent: false, direction: "top" });

      map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
    }

    return () => { map.remove(); leafletRef.current = null; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const distLabel = interval.distance >= 1000
    ? `${(interval.distance / 1000).toFixed(2)} km`
    : `${Math.round(interval.distance)} m`;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1rem 1.25rem", borderBottom: "1px solid var(--border-color)" }}>
          <Zap size={18} style={{ color: "#f97316", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
              Effort #{intervalIndex + 1} — <span style={{ color: "#f97316" }}>Fractionné</span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
              {distLabel} · {formatDuration(interval.duration)} · {formatPace(interval.avgPace)} /km
              {interval.avgHeartRate != null && ` · FC ${interval.avgHeartRate} bpm`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: "0.25rem", display: "flex", alignItems: "center", borderRadius: "var(--radius-sm)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Map */}
        <div ref={mapRef} style={{ flex: 1, minHeight: "380px" }} />
      </div>
    </div>
  );
};
