import React, { useEffect, useRef } from "react";
import L from "leaflet";
import { X, ChevronLeft, ChevronRight, Loader2, MapPin, Layers } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useBasemap } from "../hooks/useBasemap";
import { BASEMAPS } from "../utils/basemaps";
import type { GPXTrackPoint } from "../utils/gpxCore";
import type { SegmentPickerHandle } from "../hooks/useSegmentPicker";

interface SegmentPickerMapModalProps {
  points: GPXTrackPoint[];
  picker: SegmentPickerHandle;
  name: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  saving: boolean;
}

/** Distance en pixels écran en dessous de laquelle un clic est considéré comme visant le tracé — mêmes seuil qu'ActivityMap. */
const CLICK_THRESHOLD_PX = 30;

/**
 * Grande carte Leaflet dédiée à la sélection précise du départ/arrivée d'un segment manuel — plus
 * grande que la carte du dashboard (730×450px, imprécise pour cliquer finement) et avec des flèches
 * de réglage fin (±1 point) une fois un point posé. Demande de Greg (2026-08-28), suite à l'enquête
 * sur un segment dont le point de départ incluait trop d'approche avant la côte elle-même.
 */
export const SegmentPickerMapModal: React.FC<SegmentPickerMapModalProps> = ({
  points, picker, name, onNameChange, onSave, saving,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const fullLineRef = useRef<L.Polyline | null>(null);
  const segLineRef = useRef<L.Polyline | null>(null);
  const startMarkerRef = useRef<L.CircleMarker | null>(null);
  const endMarkerRef = useRef<L.CircleMarker | null>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>(true);
  const maxIndex = points.length - 1;
  const { basemapDef, basemapId, setBasemapId, tile, tracestrackKey, setTracestrackKey } = useBasemap();

  // Initialisation de la carte (une seule fois) — clic = point le plus proche, comme ActivityMap.
  useEffect(() => {
    if (!mapRef.current || leafletRef.current || points.length === 0) return;

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";

    const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true });
    leafletRef.current = map;
    // Fond de carte ajouté par l'effet dédié ci-dessous (dépend de `tile`) — voir useBasemap.ts.

    fullLineRef.current = L.polyline(points.map(p => [p.lat, p.lon] as [number, number]), {
      color: isDark ? "#475569" : "#94a3b8", weight: 3, opacity: 0.7,
    }).addTo(map);
    map.fitBounds(fullLineRef.current.getBounds(), { padding: [30, 30] });

    const searchStep = Math.max(1, Math.floor(points.length / 800));
    map.on("click", (e: L.LeafletMouseEvent) => {
      const ml = e.latlng;
      let minDist = Infinity, closestIdx = 0;
      for (let i = 0; i < points.length; i += searchStep) {
        const d = ml.distanceTo(L.latLng(points[i].lat, points[i].lon));
        if (d < minDist) { minDist = d; closestIdx = i; }
      }
      const mousePx = map.latLngToContainerPoint(ml);
      const closestPx = map.latLngToContainerPoint(L.latLng(points[closestIdx].lat, points[closestIdx].lon));
      if (Math.hypot(mousePx.x - closestPx.x, mousePx.y - closestPx.y) < CLICK_THRESHOLD_PX) {
        picker.handleClick(closestIdx);
      }
    });

    return () => { map.remove(); leafletRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // Bascule de fond de carte sans reconstruire toute la carte.
  useEffect(() => {
    const map = leafletRef.current;
    if (!map) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    tileLayerRef.current = L.tileLayer(tile.url, {
      attribution: tile.attribution,
      // Voir ActivityMap.tsx : ne pas passer `undefined` explicitement (écraserait le défaut Leaflet).
      subdomains: tile.subdomains ?? 'abc',
      maxZoom: tile.maxZoom,
    }).addTo(map);
  }, [tile]);

  // Marqueurs départ/arrivée + segment surligné — reconstruits à chaque changement de sélection.
  useEffect(() => {
    const map = leafletRef.current;
    if (!map) return;

    if (startMarkerRef.current) { map.removeLayer(startMarkerRef.current); startMarkerRef.current = null; }
    if (endMarkerRef.current) { map.removeLayer(endMarkerRef.current); endMarkerRef.current = null; }
    if (segLineRef.current) { map.removeLayer(segLineRef.current); segLineRef.current = null; }

    if (picker.start !== null) {
      const p = points[picker.start];
      startMarkerRef.current = L.circleMarker([p.lat, p.lon], {
        radius: 9, fillColor: "#22c55e", color: "#fff", weight: 2, fillOpacity: 1,
      }).addTo(map).bindTooltip("Départ", { permanent: false, direction: "top" });
    }
    if (picker.end !== null) {
      const p = points[picker.end];
      endMarkerRef.current = L.circleMarker([p.lat, p.lon], {
        radius: 9, fillColor: "#ef4444", color: "#fff", weight: 2, fillOpacity: 1,
      }).addTo(map).bindTooltip("Arrivée", { permanent: false, direction: "top" });
    }
    if (picker.start !== null && picker.end !== null) {
      const seg = points.slice(picker.start, picker.end + 1);
      segLineRef.current = L.polyline(seg.map(p => [p.lat, p.lon] as [number, number]), {
        color: "#4f46e5", weight: 5, opacity: 0.95,
      }).addTo(map);
    }
  }, [points, picker.start, picker.end]);

  // Fermeture (Échap) — annule la sélection en cours, comme le bouton "Annuler".
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") picker.reset(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [picker]);

  const stage = picker.stage;
  const hint =
    stage === "pick-start" ? "Clique le point de départ du segment sur la carte."
    : stage === "pick-end" ? "Clique maintenant le point d'arrivée."
    : "Affine si besoin avec les flèches, puis nomme et enregistre ton segment.";

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) picker.reset(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sélection du segment sur la carte"
        tabIndex={-1}
        style={{
          background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
          borderRadius: "var(--radius-lg)", width: "min(1200px, 96vw)", height: "min(820px, 92vh)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "0 25px 50px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: "0.75rem",
          padding: "0.85rem 1.25rem", borderBottom: "1px solid var(--border-color)",
        }}>
          <MapPin size={18} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
              Définir un segment
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--accent-primary)", fontWeight: 600, marginTop: "0.1rem" }}>
              {hint}
            </div>
          </div>
          {/* Sélecteur de fond de carte (Rues/Relief/Cyclisme) */}
          <div style={{
            display: "flex", alignItems: "center", gap: "2px", flexShrink: 0,
            backgroundColor: "var(--bg-primary)", padding: "3px",
            borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)",
          }}>
            <Layers size={13} style={{ color: "var(--text-tertiary)", marginLeft: "0.3rem" }} />
            {BASEMAPS.map(bm => (
              <button
                key={bm.id}
                type="button"
                onClick={() => setBasemapId(bm.id)}
                title={`Fond de carte : ${bm.label}`}
                style={{
                  padding: "0.25rem 0.6rem", fontSize: "0.78rem",
                  borderRadius: "calc(var(--radius-sm) - 2px)", border: "none",
                  backgroundColor: basemapId === bm.id ? "var(--accent-primary)" : "transparent",
                  color: basemapId === bm.id ? "#ffffff" : "var(--text-secondary)",
                  cursor: "pointer", fontWeight: basemapId === bm.id ? 700 : 400,
                  whiteSpace: "nowrap",
                }}
              >
                {bm.label}
              </button>
            ))}
          </div>
          {/* Clé API Tracestrack — nécessaire uniquement pour le fond "Relief", stockée en local */}
          {basemapDef.requiresKey && !tracestrackKey && (
            <input
              type="text"
              placeholder="Clé API Tracestrack"
              onBlur={e => { if (e.target.value.trim()) setTracestrackKey(e.target.value.trim()); }}
              onKeyDown={e => { if (e.key === "Enter") setTracestrackKey(e.currentTarget.value.trim()); }}
              style={{
                padding: "0.3rem 0.6rem", fontSize: "0.78rem", minWidth: "9rem", flexShrink: 0,
                borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)",
                background: "var(--bg-primary)", color: "var(--text-primary)",
              }}
            />
          )}
          <button
            onClick={() => picker.reset()}
            title="Annuler"
            aria-label="Annuler la sélection"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-tertiary)", padding: "0.25rem",
              display: "flex", alignItems: "center", borderRadius: "var(--radius-sm)",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Flèches de réglage fin — visibles dès qu'un point correspondant est posé. */}
        {(picker.start !== null || picker.end !== null) && (
          <div style={{
            display: "flex", gap: "1.5rem", flexWrap: "wrap",
            padding: "0.6rem 1.25rem", borderBottom: "1px solid var(--border-color)",
            background: "var(--bg-primary)",
          }}>
            {picker.start !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#22c55e" }}>Départ</span>
                <button type="button" onClick={() => picker.nudgeStart(-1, maxIndex)}
                  title="Reculer le départ d'un point" aria-label="Reculer le point de départ"
                  style={{ padding: "0.3rem", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", cursor: "pointer", display: "flex" }}>
                  <ChevronLeft size={15} />
                </button>
                <button type="button" onClick={() => picker.nudgeStart(1, maxIndex)}
                  title="Avancer le départ d'un point" aria-label="Avancer le point de départ"
                  style={{ padding: "0.3rem", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", cursor: "pointer", display: "flex" }}>
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
            {picker.end !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#ef4444" }}>Arrivée</span>
                <button type="button" onClick={() => picker.nudgeEnd(-1, maxIndex)}
                  title="Reculer l'arrivée d'un point" aria-label="Reculer le point d'arrivée"
                  style={{ padding: "0.3rem", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", cursor: "pointer", display: "flex" }}>
                  <ChevronLeft size={15} />
                </button>
                <button type="button" onClick={() => picker.nudgeEnd(1, maxIndex)}
                  title="Avancer l'arrivée d'un point" aria-label="Avancer le point d'arrivée"
                  style={{ padding: "0.3rem", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", cursor: "pointer", display: "flex" }}>
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        )}

        <div ref={mapRef} style={{ flex: 1, minHeight: 0 }} />

        {stage === "ready" && (
          <div style={{
            display: "flex", gap: "0.5rem", padding: "0.85rem 1.25rem",
            borderTop: "1px solid var(--border-color)", flexWrap: "wrap", alignItems: "center",
          }}>
            <input
              value={name}
              onChange={e => onNameChange(e.target.value)}
              placeholder="Nom du segment"
              autoFocus
              style={{
                flex: 1, minWidth: "10rem", padding: "0.5rem 0.75rem", fontSize: "0.9rem",
                borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)",
                background: "var(--bg-primary)", color: "var(--text-primary)",
              }}
            />
            <button type="button" className="btn btn-outline" onClick={onSave} disabled={!name.trim() || saving}
              style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}>
              {saving ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : "Enregistrer"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
