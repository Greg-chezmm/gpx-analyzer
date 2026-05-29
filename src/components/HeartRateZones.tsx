import React from "react";
import { Heart } from "lucide-react";
import type { GPXTrackPoint } from "../utils/gpxParser";
import { karvonenBounds } from "../utils/gpxParser";
import { formatDuration } from "./SplitsTable";

interface HeartRateZonesProps {
  points: GPXTrackPoint[];
  fcMax: number;
  fcRest: number;
  onFcMaxChange: (v: number) => void;
  onFcRestChange: (v: number) => void;
}

interface ZoneDefinition {
  label: string;
  description: string;
  color: string;
  pctMin: number; // % of FC reserve (Karvonen)
  pctMax: number;
}

const ZONES: ZoneDefinition[] = [
  { label: "Z1", description: "Récupération",  color: "#60a5fa", pctMin: 0,    pctMax: 0.60 },
  { label: "Z2", description: "Endurance",      color: "#34d399", pctMin: 0.60, pctMax: 0.70 },
  { label: "Z3", description: "Aérobie",        color: "#fbbf24", pctMin: 0.70, pctMax: 0.80 },
  { label: "Z4", description: "Seuil",          color: "#f97316", pctMin: 0.80, pctMax: 0.90 },
  { label: "Z5", description: "Max / VO2max",   color: "#ef4444", pctMin: 0.90, pctMax: Infinity },
];

function getZoneIndex(hr: number, bounds: number[]): number {
  // bounds = [z1min, z2min, z3min, z4min, z5min] (Karvonen)
  if (hr >= bounds[4]) return 4;
  if (hr >= bounds[3]) return 3;
  if (hr >= bounds[2]) return 2;
  if (hr >= bounds[1]) return 1;
  return 0;
}

const NumberInput: React.FC<{
  id: string; label: string; value: number; min: number; max: number; unit: string;
  color: string; colorLight: string; onChange: (v: number) => void;
}> = ({ id, label, value, min, max, unit, color, colorLight, onChange }) => {
  const dec = () => { if (value > min) onChange(value - 1); };
  const inc = () => { if (value < max) onChange(value + 1); };
  const btnStyle: React.CSSProperties = {
    width: "32px", height: "32px", border: "none", background: "transparent",
    cursor: "pointer", color, fontWeight: 800, fontSize: "1.1rem", lineHeight: 1,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <label htmlFor={id} style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
        {label}
      </label>
      <div style={{
        display: "flex", alignItems: "center",
        border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)",
        background: colorLight, overflow: "hidden",
      }}>
        <button type="button" onClick={dec} disabled={value <= min} style={btnStyle} aria-label={`Diminuer ${label}`}>−</button>
        <span id={id} style={{
          minWidth: "44px", textAlign: "center",
          fontSize: "0.95rem", fontWeight: 700, color,
          fontFamily: "var(--font-heading)",
        }}>
          {value}
        </span>
        <button type="button" onClick={inc} disabled={value >= max} style={btnStyle} aria-label={`Augmenter ${label}`}>+</button>
      </div>
      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{unit}</span>
    </div>
  );
};

export const HeartRateZones: React.FC<HeartRateZonesProps> = ({
  points, fcMax, fcRest, onFcMaxChange, onFcRestChange,
}) => {
  const bounds = karvonenBounds(fcMax, fcRest);
  const reserve = fcMax - fcRest;

  const zoneTime = new Array<number>(ZONES.length).fill(0);
  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    if (curr.hr === null || prev.hr === null) continue;
    if (curr.time === null || prev.time === null) continue;
    const dt = (curr.time.getTime() - prev.time.getTime()) / 1000;
    if (dt <= 0 || dt > 60) continue;
    zoneTime[getZoneIndex((curr.hr + prev.hr) / 2, bounds)] += dt;
  }

  const totalTime = zoneTime.reduce((a, b) => a + b, 0);
  if (totalTime === 0) return null;

  return (
    <div className="card animate-slide-up" style={{ width: "100%" }}>
      <div className="panel-header" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <h3 className="panel-title">
          <Heart size={18} style={{ color: "var(--color-hr)" }} />
          <span>Zones de Fréquence Cardiaque</span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontWeight: 500 }}>
            · méthode Karvonen
          </span>
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <NumberInput
            id="fcmax-input" label="FC max :" value={fcMax} min={100} max={230} unit="bpm"
            color="var(--color-hr)" colorLight="var(--color-hr-light)"
            onChange={onFcMaxChange}
          />
          <NumberInput
            id="fcrest-input" label="FC repos :" value={fcRest} min={30} max={100} unit="bpm"
            color="#a78bfa" colorLight="#f5f3ff"
            onChange={onFcRestChange}
          />
          <span style={{ fontSize: "0.78rem", color: "var(--text-tertiary)" }}>
            Réserve : {reserve} bpm
          </span>
        </div>
      </div>

      {/* Stacked proportional bar */}
      <div style={{ display: "flex", height: "18px", borderRadius: "9px", overflow: "hidden", gap: "2px", marginBottom: "1.5rem" }}>
        {ZONES.map((zone, idx) => {
          const pct = totalTime > 0 ? (zoneTime[idx] / totalTime) * 100 : 0;
          if (pct < 0.3) return null;
          return (
            <div key={zone.label} title={`${zone.label} — ${pct.toFixed(1)}%`} style={{
              width: `${pct}%`, backgroundColor: zone.color, borderRadius: "9px",
              transition: "width 0.5s cubic-bezier(0.4,0,0.2,1)", flexShrink: 0,
            }} />
          );
        })}
      </div>

      {/* Zone cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: "0.85rem" }}>
        {ZONES.map((zone, idx) => {
          const pct = totalTime > 0 ? (zoneTime[idx] / totalTime) * 100 : 0;
          const bpmMin = bounds[idx];
          const bpmMax = idx < 4 ? bounds[idx + 1] : null;

          return (
            <div key={zone.label} style={{
              border: `1px solid ${zone.color}33`, borderRadius: "var(--radius-md)",
              padding: "0.85rem 1rem", background: `${zone.color}0d`,
              display: "flex", flexDirection: "column", gap: "0.35rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: zone.color, flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                  {zone.label}
                </span>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                  — {zone.description}
                </span>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", fontWeight: 500 }}>
                {bpmMax === null ? `> ${bpmMin} bpm` : `${bpmMin} – ${bpmMax} bpm`}
              </div>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.4rem", color: zone.color, lineHeight: 1.1 }}>
                {pct.toFixed(1)}
                <span style={{ fontSize: "0.9rem", fontWeight: 600, marginLeft: "1px" }}>%</span>
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 500, fontFeatureSettings: '"tnum"' }}>
                {formatDuration(zoneTime[idx])}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
