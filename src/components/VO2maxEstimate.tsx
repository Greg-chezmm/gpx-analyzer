import React from "react";
import { Wind } from "lucide-react";
import type { VO2maxEstimate as VO2maxData } from "../utils/gpxParser";

interface VO2maxEstimateProps {
  estimate: VO2maxData;
  suuntoVO2max?: number | null;
}

interface VO2Level { label: string; color: string; min: number; max: number }
const VO2_LEVELS: VO2Level[] = [
  { label: "Faible",   color: "#ef4444", min: 0,  max: 30 },
  { label: "Moyen",    color: "#f97316", min: 30, max: 40 },
  { label: "Correct",  color: "#fbbf24", min: 40, max: 50 },
  { label: "Bon",      color: "#34d399", min: 50, max: 60 },
  { label: "Très bon", color: "#60a5fa", min: 60, max: 70 },
  { label: "Élite",    color: "#a78bfa", min: 70, max: 100 },
];

function getLevel(v: number): VO2Level {
  return VO2_LEVELS.find(l => v >= l.min && v < l.max) ?? VO2_LEVELS[VO2_LEVELS.length - 1];
}

const CONFIDENCE_LABELS = {
  high:   { label: "Élevée",  color: "#34d399" },
  medium: { label: "Moyenne", color: "#fbbf24" },
  low:    { label: "Faible",  color: "#f97316" },
};

export const VO2maxEstimate: React.FC<VO2maxEstimateProps> = ({ estimate, suuntoVO2max }) => {
  const lvl = getLevel(estimate.value);
  const MAX_DISPLAY = 80;
  const gaugeW = Math.min(100, (estimate.value / MAX_DISPLAY) * 100);
  const conf = CONFIDENCE_LABELS[estimate.confidence];
  const diff = suuntoVO2max != null ? Math.round((estimate.value - suuntoVO2max) * 10) / 10 : null;

  return (
    <div className="card animate-slide-up">
      <div className="panel-header">
        <h3 className="panel-title">
          <Wind size={18} style={{ color: "#60a5fa" }} />
          <span>Estimation VO2max</span>
        </h3>
        <div style={{
          padding: "0.3rem 0.85rem", borderRadius: "var(--radius-full)",
          backgroundColor: `${conf.color}18`, border: `1px solid ${conf.color}44`,
          fontSize: "0.78rem", fontWeight: 700, color: conf.color,
        }}>
          Fiabilité {conf.label}
        </div>
      </div>

      {/* Main value */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: "1.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: "3.5rem", color: lvl.color, lineHeight: 1 }}>
            {estimate.value}
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>mL/kg/min</div>
        </div>
        <div style={{ paddingBottom: "0.5rem" }}>
          <div style={{
            display: "inline-block", padding: "0.3rem 0.85rem",
            borderRadius: "var(--radius-full)",
            backgroundColor: `${lvl.color}18`, border: `1px solid ${lvl.color}44`,
            fontSize: "1rem", fontWeight: 800, color: lvl.color,
          }}>
            {lvl.label}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.4rem" }}>
            Allure GAP : {estimate.gapSpeedKmh} km/h · HRR moy. : {estimate.hrrPct}%
          </div>
        </div>
        {suuntoVO2max != null && (
          <div style={{ paddingBottom: "0.5rem" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontWeight: 600 }}>Suunto VO2max</div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.75rem", color: "#a78bfa" }}>
              {suuntoVO2max}
            </div>
            {diff !== null && (
              <div style={{ fontSize: "0.78rem", color: diff >= 0 ? "#34d399" : "#f97316", fontWeight: 600 }}>
                {diff >= 0 ? "+" : ""}{diff} vs Suunto
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scale bar */}
      <div style={{ marginBottom: "0.5rem" }}>
        <div style={{ display: "flex", height: "10px", borderRadius: "5px", overflow: "hidden", marginBottom: "0.4rem" }}>
          {VO2_LEVELS.map(l => (
            <div key={l.label} style={{
              flex: l.max - l.min, background: l.color, opacity: 0.35,
            }} />
          ))}
        </div>
        {/* Cursor */}
        <div style={{ position: "relative", height: "12px" }}>
          <div style={{
            position: "absolute", left: `${gaugeW}%`, transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
            borderBottom: `7px solid ${lvl.color}`,
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-tertiary)" }}>
          {VO2_LEVELS.map(l => <span key={l.label}>{l.min}</span>)}
          <span>80+</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", marginTop: "0.2rem" }}>
          {VO2_LEVELS.map(l => <span key={l.label} style={{ color: l.color, fontWeight: 600 }}>{l.label}</span>)}
        </div>
      </div>

      <div style={{ fontSize: "0.71rem", color: "var(--text-tertiary)", borderTop: "1px solid var(--border-color)", paddingTop: "0.6rem", marginTop: "0.25rem" }}>
        Méthode sous-maximale : formule ACSM running + Karvonen HRR · Valeur plus fiable sur effort régulier ≥ 20 min à 50–85% HRR
      </div>
    </div>
  );
};
