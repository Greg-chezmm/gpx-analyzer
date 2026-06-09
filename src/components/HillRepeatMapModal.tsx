import React, { useEffect, useRef } from "react";
import L from "leaflet";
import { X, Repeat } from "lucide-react";
import type { GPXTrackPoint } from "../utils/gpxParser";
import type { HillRepetition } from "../utils/hillRepeats";
import { formatDuration, formatPace } from "./SplitsTable";

interface HillRepeatMapModalProps {
  rep: HillRepetition;
  seriesId: number;
  points: GPXTrackPoint[];
  onClose: () => void;
}

export const HillRepeatMapModal: React.FC<HillRepeatMapModalProps> = ({
  rep,
  seriesId,
  points,
  onClose,
}) => {
  const mapRef    = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

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

    // Hill repeat segment — thick green
    const segPoints = points.slice(rep.startIndex, rep.endIndex + 1);
    if (segPoints.length > 1) {
      const segLatLngs = segPoints.map(p => [p.lat, p.lon] as [number, number]);
      const polyline = L.polyline(segLatLngs, { color: "#22c55e", weight: 5, opacity: 0.95 }).addTo(map);

      const startPt = segPoints[0];
      L.circleMarker([startPt.lat, startPt.lon], {
        radius: 7, fillColor: "#22c55e", color: "#fff", weight: 2, fillOpacity: 1,
      }).addTo(map).bindTooltip("Départ", { permanent: false, direction: "top" });

      const endPt = segPoints[segPoints.length - 1];
      L.circleMarker([endPt.lat, endPt.lon], {
        radius: 7, fillColor: "#ef4444", color: "#fff", weight: 2, fillOpacity: 1,
      }).addTo(map).bindTooltip("Sommet", { permanent: false, direction: "top" });

      map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
    }

    return () => { map.remove(); leafletRef.current = null; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const distLabel = rep.distance >= 1000
    ? `${(rep.distance / 1000).toFixed(2)} km`
    : `${Math.round(rep.distance)} m`;

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
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1rem 1.25rem", borderBottom: "1px solid var(--border-color)" }}>
          <Repeat size={18} style={{ color: "#22c55e", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
              Série {seriesId + 1} — Répétition #{rep.repIndex + 1}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
              {distLabel} · D+ {Math.round(rep.elevGain)} m · {formatDuration(Math.round(rep.duration))} · {formatPace(rep.avgPace)} /km · VAM {Math.round(rep.vam)} m/h
              {rep.avgHR !== null && ` · FC ${rep.avgHR} bpm`}
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
