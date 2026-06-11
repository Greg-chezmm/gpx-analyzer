import React from "react";
import { Wind } from "lucide-react";
import type { VO2maxEstimate as VO2maxData } from "../utils/gpxParser";

interface VO2maxEstimateProps {
  estimate: VO2maxData;
}

interface VO2Level { label: string; color: string; min: number; max: number }

/** Niveaux VO2max en mL/kg/min, de faible à élite (barème adulte tous genres). */
const VO2_LEVELS: VO2Level[] = [
  { label: "Faible",   color: "#ef4444", min: 0,  max: 30 },
  { label: "Moyen",    color: "#f97316", min: 30, max: 40 },
  { label: "Correct",  color: "#fbbf24", min: 40, max: 50 },
  { label: "Bon",      color: "#34d399", min: 50, max: 60 },
  { label: "Très bon", color: "#60a5fa", min: 60, max: 70 },
  { label: "Élite",    color: "#a78bfa", min: 70, max: 100 },
];

/** Retourne le niveau VO2max correspondant à la valeur, ou le dernier par défaut. */
function getLevel(value: number): VO2Level {
  return VO2_LEVELS.find(l => value >= l.min && value < l.max) ?? VO2_LEVELS[VO2_LEVELS.length - 1];
}

const CONFIDENCE_LABELS = {
  high:   { label: "Élevée",  color: "#34d399" },
  medium: { label: "Moyenne", color: "#fbbf24" },
  low:    { label: "Faible",  color: "#f97316" },
};

/** Affiche l'estimation VO2max sous-maximale avec barre de niveaux et indicateur de fiabilité. */
export const VO2maxEstimate: React.FC<VO2maxEstimateProps> = ({ estimate }) => {
  const level = getLevel(estimate.value);
  // 80 mL/kg/min comme plafond d'affichage de la jauge (au-delà = élite absolu)
  const MAX_DISPLAY = 80;
  const gaugePercent = Math.min(100, (estimate.value / MAX_DISPLAY) * 100);
  const confidence = CONFIDENCE_LABELS[estimate.confidence];

  return (
    <div className="card animate-slide-up">
      <div className="panel-header">
        <h3 className="panel-title">
          <Wind size={18} style={{ color: "#60a5fa" }} />
          <span>Estimation VO2max</span>
        </h3>
        <div style={{
          padding: "0.3rem 0.85rem", borderRadius: "var(--radius-full)",
          backgroundColor: `${confidence.color}18`, border: `1px solid ${confidence.color}44`,
          fontSize: "0.78rem", fontWeight: 700, color: confidence.color,
        }}>
          Fiabilité {confidence.label}
        </div>
      </div>

      {/* Valeur principale */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: "1.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: "3.5rem", color: level.color, lineHeight: 1 }}>
            {estimate.value}
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>mL/kg/min</div>
        </div>
        <div style={{ paddingBottom: "0.5rem" }}>
          <div style={{
            display: "inline-block", padding: "0.3rem 0.85rem",
            borderRadius: "var(--radius-full)",
            backgroundColor: `${level.color}18`, border: `1px solid ${level.color}44`,
            fontSize: "1rem", fontWeight: 800, color: level.color,
          }}>
            {level.label}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.4rem" }}>
            Vitesse moy. : {estimate.speedKmh} km/h · HRR moy. : {estimate.hrrPct}%
          </div>
        </div>
      </div>

      {/* Barre de niveaux colorée avec curseur triangulaire */}
      <div style={{ marginBottom: "0.5rem" }}>
        <div style={{ display: "flex", height: "10px", borderRadius: "5px", overflow: "hidden", marginBottom: "0.4rem" }}>
          {VO2_LEVELS.map(l => (
            <div key={l.label} style={{
              flex: l.max - l.min, background: l.color, opacity: 0.35,
            }} />
          ))}
        </div>
        {/* Triangle curseur positionné en % sur la barre */}
        <div style={{ position: "relative", height: "12px" }}>
          <div style={{
            position: "absolute", left: `${gaugePercent}%`, transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
            borderBottom: `7px solid ${level.color}`,
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

      {/* Méthode : ACSM sous-maximale terrain plat, filtre HRR ≥ 55% pour exclure les segments peu sollicités */}
      <div style={{ fontSize: "0.71rem", color: "var(--text-tertiary)", borderTop: "1px solid var(--border-color)", paddingTop: "0.6rem", marginTop: "0.25rem" }}>
        Méthode sous-maximale : ACSM terrain plat (HRR ≥ 55%) + Karvonen · Segment le plus stable : {estimate.windowMin} min
      </div>
    </div>
  );
};
