import React, { useEffect, useRef } from "react";
import L from "leaflet";
import { X } from "lucide-react";
import type { SegmentPointRun } from "../utils/segments";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface MapPoint { lat: number; lon: number }

interface Props {
  points: SegmentPointRun[];
  /** Tracé complet de l'activité comparée, affiché en fond (contexte géographique) — voir demande Greg. */
  activityPoints: MapPoint[];
  segmentName: string;
  /** Chiffres bruts de couverture/fragmentation (voir StoredSegmentMatchDebug) — utile même quand le
   * segment est retenu : 100% de points appariés n'implique pas que le corridor gagnant soit continu. */
  extraInfo?: string;
  onClose: () => void;
}

// Une couleur distincte par corridor (run) — au-delà, on boucle. Rouge réservé aux points sans
// aucune correspondance (runIndex null).
const RUN_COLORS = ["#22c55e", "#f97316", "#3b82f6", "#a855f7", "#eab308", "#06b6d4", "#ec4899"];
const NO_MATCH_COLOR = "#ef4444";

/**
 * Carte de diagnostic : colore chaque point rééchantillonné du segment selon le corridor (run) auquel
 * il a été rattaché par `computeRuns` (rouge si aucune correspondance), avec le tracé complet de
 * l'activité comparée en fond — révèle où le suivi de continuité fragmente le passage en plusieurs
 * runs séparés, même quand chaque point pris individuellement matche (voir debugSegmentPointRuns).
 */
export const SegmentMatchDebugMapModal: React.FC<Props> = ({ points, activityPoints, segmentName, extraInfo, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<L.Map | null>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    if (!mapRef.current || leafletRef.current || points.length === 0) return;

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const tileUrl = isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

    const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true });
    leafletRef.current = map;
    L.tileLayer(tileUrl, { attribution: "© CARTO", maxZoom: 19 }).addTo(map);

    // Tracé complet de l'activité comparée, en fond (contexte géographique)
    if (activityPoints.length > 1) {
      L.polyline(activityPoints.map(p => [p.lat, p.lon] as [number, number]), {
        color: isDark ? "#334155" : "#cbd5e1", weight: 3, opacity: 0.7,
      }).addTo(map);
    }

    // Ligne fine reliant les points rééchantillonnés du segment dans l'ordre
    L.polyline(points.map(p => [p.lat, p.lon] as [number, number]), {
      color: isDark ? "#475569" : "#94a3b8", weight: 2, opacity: 0.6,
    }).addTo(map);

    for (const p of points) {
      L.circleMarker([p.lat, p.lon], {
        radius: 5,
        fillColor: p.runIndex === null ? NO_MATCH_COLOR : RUN_COLORS[p.runIndex % RUN_COLORS.length],
        color: "#fff", weight: 1, fillOpacity: 0.9,
      }).addTo(map);
    }

    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [30, 30] });

    return () => { map.remove(); leafletRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const matchedCount = points.filter(p => p.runIndex !== null).length;
  const runCount = new Set(points.map(p => p.runIndex).filter((r): r is number => r !== null)).size;

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Diagnostic — ${segmentName}`}
        tabIndex={-1}
        style={{
          background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
          borderRadius: "var(--radius-lg)", width: "min(680px, 100%)",
          maxHeight: "90vh", display: "flex", flexDirection: "column",
          overflow: "hidden", boxShadow: "0 25px 50px rgba(0,0,0,0.35)",
        }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "0.75rem",
          padding: "1rem 1.25rem", borderBottom: "1px solid var(--border-color)",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
              Diagnostic — {segmentName}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
              <span style={{ fontWeight: 700 }}>{matchedCount} point{matchedCount > 1 ? "s" : ""} apparié{matchedCount > 1 ? "s" : ""}</span>
              {" · "}
              <span style={{ color: NO_MATCH_COLOR, fontWeight: 700 }}>{points.length - matchedCount} non apparié{points.length - matchedCount > 1 ? "s" : ""}</span>
              {" sur "}{points.length}
              {" · "}
              <span style={{ fontWeight: 700 }}>{runCount} corridor{runCount > 1 ? "s" : ""}</span>
              {runCount > 1 && (
                <span> (une couleur par corridor — un même passage ne devrait former qu'un seul corridor)</span>
              )}
            </div>
            {extraInfo && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.15rem" }}>
                {extraInfo}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            title="Fermer"
            aria-label="Fermer"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-tertiary)", padding: "0.25rem",
              display: "flex", alignItems: "center", borderRadius: "var(--radius-sm)",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div ref={mapRef} style={{ flex: 1, minHeight: "380px" }} />
      </div>
    </div>
  );
};
