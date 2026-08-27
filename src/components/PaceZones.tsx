import React from "react";
import { Gauge } from "lucide-react";
import type { GPXTrackPoint } from "../utils/gpxParser";
import { formatDuration, formatPace } from "../utils/format";

interface PaceZonesProps {
  points: GPXTrackPoint[];
  vma: number;         // km/h
  onVmaChange: (v: number) => void;
}

interface ZoneDef {
  label: string;
  description: string;
  color: string;
  pctMin: number; // % VMA (vitesse maximale aérobie)
  pctMax: number;
}

/** Zones d'allure Z1–Z5 définies en % VMA (vitesse maximale aérobie). */
const ZONES: ZoneDef[] = [
  { label: "Z1", description: "Récupération",           color: "#93c5fd", pctMin: 0,    pctMax: 0.50 },
  { label: "Z2", description: "Endurance fondamentale", color: "#34d399", pctMin: 0.50, pctMax: 0.65 },
  { label: "Z3", description: "Aérobie",                color: "#fbbf24", pctMin: 0.65, pctMax: 0.80 },
  { label: "Z4", description: "Seuil",                  color: "#f97316", pctMin: 0.80, pctMax: 0.90 },
  { label: "Z5", description: "VO2max / Fractionné",    color: "#ef4444", pctMin: 0.90, pctMax: Infinity },
];

/** Convertit une vitesse en m/s en allure formatée "mm:ss" /km. */
function fmtPace(speedMs: number): string {
  if (speedMs <= 0) return "–";
  return formatPace(1000 / speedMs);
}

/** Stepper +/− pour régler la VMA en km/h par paliers de 0,5. */
const Stepper: React.FC<{
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}> = ({ value, min, max, step, onChange }) => {
  const dec = () => { if (value > min) onChange(Math.max(min, parseFloat((value - step).toFixed(1)))); };
  const inc = () => { if (value < max) onChange(Math.min(max, parseFloat((value + step).toFixed(1)))); };
  const btn: React.CSSProperties = {
    width: "32px", height: "32px", border: "none", background: "transparent",
    cursor: "pointer", color: "var(--color-speed)", fontWeight: 800, fontSize: "1.1rem",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>VMA :</span>
      <div style={{
        display: "flex", alignItems: "center",
        border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)",
        background: "var(--color-speed-light)", overflow: "hidden",
      }}>
        <button type="button" onClick={dec} disabled={value <= min} style={btn} aria-label="Diminuer VMA">−</button>
        <span style={{ minWidth: "44px", textAlign: "center", fontSize: "0.95rem", fontWeight: 700, color: "var(--color-speed)", fontFamily: "var(--font-heading)" }}>
          {value.toFixed(1)}
        </span>
        <button type="button" onClick={inc} disabled={value >= max} style={btn} aria-label="Augmenter VMA">+</button>
      </div>
      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>km/h</span>
    </div>
  );
};

/** Affiche les zones d'allure Z1–Z5 en % VMA avec stepper VMA réactif et plages allure /km. */
export const PaceZones: React.FC<PaceZonesProps> = ({ points, vma, onVmaChange }) => {
  // Conversion VMA km/h → m/s pour les comparaisons avec la vitesse GPS
  const vmaMs = vma / 3.6;

  const zoneTime = new Array<number>(ZONES.length).fill(0);

  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    // Filtre les points à l'arrêt (< 0,3 m/s ≈ marche très lente ou pause)
    if (!curr.speed || curr.speed < 0.3) continue;
    if (curr.time === null || prev.time === null) continue;
    const dt = (curr.time.getTime() - prev.time.getTime()) / 1000;
    if (dt <= 0 || dt > 60) continue;
    const avgSpeedMs = ((curr.speed + (prev.speed ?? curr.speed)) / 2);
    const pctVma = avgSpeedMs / vmaMs;
    let zoneIdx = 0;
    for (let j = ZONES.length - 1; j >= 0; j--) {
      if (pctVma >= ZONES[j].pctMin) { zoneIdx = j; break; }
    }
    zoneTime[zoneIdx] += dt;
  }

  const totalTime = zoneTime.reduce((a, b) => a + b, 0);
  if (totalTime === 0) return null;

  return (
    <div className="card animate-slide-up" style={{ width: "100%" }}>
      <div className="panel-header" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <h3 className="panel-title">
          <Gauge size={18} style={{ color: "var(--color-speed)" }} />
          <span>Zones d'allure</span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontWeight: 500 }}>
            · % VMA
          </span>
        </h3>
        <Stepper value={vma} min={10} max={30} step={0.5} onChange={onVmaChange} />
      </div>

      {/* Barre empilée proportionnelle au temps total */}
      <div style={{ display: "flex", height: "18px", borderRadius: "9px", overflow: "hidden", gap: "2px", marginBottom: "1.5rem" }}>
        {ZONES.map((zone, idx) => {
          const pct = (zoneTime[idx] / totalTime) * 100;
          if (pct < 0.3) return null;
          return (
            <div key={zone.label} title={`${zone.label} — ${pct.toFixed(1)}%`} style={{
              width: `${pct}%`, backgroundColor: zone.color, borderRadius: "9px",
              transition: "width 0.5s cubic-bezier(0.4,0,0.2,1)", flexShrink: 0,
            }} />
          );
        })}
      </div>

      {/* Cartes de zone */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: "0.85rem" }}>
        {ZONES.map((zone, idx) => {
          const pct = (zoneTime[idx] / totalTime) * 100;
          const speedMinMs = zone.pctMin * vmaMs;
          const speedMaxMs = zone.pctMax === Infinity ? null : zone.pctMax * vmaMs;

          return (
            <div key={zone.label} style={{
              border: `1px solid ${zone.color}33`, borderRadius: "var(--radius-md)",
              padding: "0.85rem 1rem", background: `${zone.color}0d`,
              display: "flex", flexDirection: "column", gap: "0.35rem",
              opacity: pct < 0.5 ? 0.45 : 1,
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
              {/* Plage allure : inversée car allure rapide = petit s/km → vitesse max de la zone affiché en 1er */}
              <div style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", fontWeight: 500 }}>
                {speedMaxMs === null
                  ? `> ${fmtPace(speedMinMs)} /km`
                  : `${fmtPace(speedMaxMs)} – ${fmtPace(speedMinMs)} /km`}
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
