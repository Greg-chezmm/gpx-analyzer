import React from "react";
import { Zap } from "lucide-react";
import type { TRIMPResult } from "../utils/gpxParser";
import { formatDuration } from "./SplitsTable";

interface TrainingLoadProps {
  trimp: TRIMPResult;
}

const ZONE_COLORS = ["#60a5fa", "#34d399", "#fbbf24", "#f97316", "#ef4444"];
const ZONE_LABELS = ["Z1 — Récup.", "Z2 — Endurance", "Z3 — Tempo", "Z4 — Seuil", "Z5 — VO2max"];

/**
 * Retourne la catégorie de charge et sa couleur selon le score Edwards.
 * Seuils empiriques : <50 légère, <100 modérée, <150 élevée, ≥150 très élevée.
 */
function edwardsLevel(score: number): { label: string; color: string } {
  if (score < 50)  return { label: "Légère",     color: "#34d399" };
  if (score < 100) return { label: "Modérée",    color: "#fbbf24" };
  if (score < 150) return { label: "Élevée",     color: "#f97316" };
  return                  { label: "Très élevée", color: "#ef4444" };
}

/**
 * Retourne la durée de récupération recommandée selon le score Edwards.
 * Basé sur les lignes directrices générales d'entraînement en endurance.
 */
function recoveryHours(score: number): string {
  if (score < 50)  return "24h";
  if (score < 100) return "36–48h";
  if (score < 150) return "48–72h";
  return                  "72h ou plus";
}

/** Affiche la charge d'entraînement TRIMP (Edwards pondéré par zone + Banister exponentiel) avec répartition par zone. */
export const TrainingLoad: React.FC<TrainingLoadProps> = ({ trimp }) => {
  const level = edwardsLevel(trimp.edwards);
  const maxZoneMin = Math.max(...trimp.zoneMinutes, 1);
  // Jauge normalisée sur 200 pts (plafond raisonnable pour une séance)
  const gaugePercent = Math.min(100, (trimp.edwards / 200) * 100);

  return (
    <div className="card animate-slide-up">
      <div className="panel-header">
        <h3 className="panel-title">
          <Zap size={18} style={{ color: "#fbbf24" }} />
          <span>Charge d'Entraînement — TRIMP</span>
        </h3>
        <div style={{
          padding: "0.3rem 0.85rem", borderRadius: "var(--radius-full)",
          backgroundColor: `${level.color}18`, border: `1px solid ${level.color}44`,
          fontSize: "0.8rem", fontWeight: 700, color: level.color,
        }}>
          {level.label}
        </div>
      </div>

      {/* Scores : Edwards (zones × coefficients 1–5) et Banister (exponentiel HRR) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
        {/* Edwards */}
        <div style={{ padding: "0.85rem 1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--bg-secondary)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontWeight: 600, marginBottom: "0.25rem" }}>
            TRIMP Edwards
          </div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "2rem", color: level.color, lineHeight: 1 }}>
            {trimp.edwards}
          </div>
          <div style={{ marginTop: "0.5rem", height: "6px", borderRadius: "3px", background: "var(--border-color)", overflow: "hidden" }}>
            <div style={{ width: `${gaugePercent}%`, height: "100%", borderRadius: "3px", background: level.color, transition: "width 0.4s ease" }} />
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginTop: "0.3rem" }}>
            Zones pondérées × 1 → 5 · sur 200
          </div>
        </div>

        {/* Banister + récupération */}
        <div style={{ padding: "0.85rem 1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--bg-secondary)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontWeight: 600, marginBottom: "0.25rem" }}>
            TRIMP Banister
          </div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "2rem", color: "var(--accent-primary)", lineHeight: 1 }}>
            {trimp.banister}
          </div>
          <div style={{ marginTop: "0.6rem", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
            <span style={{ fontWeight: 600 }}>Récupération conseillée :</span>
            <span style={{ color: level.color, fontWeight: 700, marginLeft: "0.4rem" }}>
              {recoveryHours(trimp.edwards)}
            </span>
          </div>
          {/* Formule Banister : durée × HRR × e^(1.92 × HRR), HRR = (FC - FCrepos) / (FCmax - FCrepos) */}
          <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginTop: "0.2rem" }}>
            T × HRR × e^(1.92 × HRR)
          </div>
        </div>
      </div>

      {/* Répartition par zone (barres proportionnelles à la zone la plus longue) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
        {trimp.zoneMinutes.map((minutes, i) => {
          if (minutes === 0) return null;
          const barWidth = (minutes / maxZoneMin) * 100;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ width: "110px", fontSize: "0.75rem", color: ZONE_COLORS[i], fontWeight: 600, flexShrink: 0 }}>
                {ZONE_LABELS[i]}
              </div>
              <div style={{ flex: 1, height: "10px", borderRadius: "5px", background: "var(--border-color)", overflow: "hidden" }}>
                <div style={{ width: `${barWidth}%`, height: "100%", background: ZONE_COLORS[i], borderRadius: "5px", transition: "width 0.4s ease" }} />
              </div>
              <div style={{ width: "48px", fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 600, textAlign: "right", flexShrink: 0 }}>
                {formatDuration(minutes * 60)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
