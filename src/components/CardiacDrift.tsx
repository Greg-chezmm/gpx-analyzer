import React from "react";
import { Activity } from "lucide-react";
import type { CardiacDrift as CardiacDriftData } from "../utils/gpxParser";
import { formatPace } from "./SplitsTable";

interface CardiacDriftProps {
  drift: CardiacDriftData;
}

function driftStyle(d: number): { color: string; label: string; bg: string } {
  if (Math.abs(d) <= 5)  return { color: "#16a34a", label: "Excellent — base aérobie solide", bg: "#f0fdf4" };
  if (Math.abs(d) <= 10) return { color: "#d97706", label: "Acceptable — léger drift cardiaque", bg: "#fffbeb" };
  return                        { color: "#dc2626", label: "Dérive marquée — allure trop élevée ou fatigue", bg: "#fef2f2" };
}

export const CardiacDrift: React.FC<CardiacDriftProps> = ({ drift }) => {
  const ds = driftStyle(drift.decoupling);

  return (
    <div className="card animate-slide-up">
      <div className="panel-header">
        <h3 className="panel-title">
          <Activity size={18} style={{ color: "#a78bfa" }} />
          <span>Dérive Cardiaque &amp; Efficacité Aérobie</span>
        </h3>
        {/* Decoupling badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.35rem 0.85rem", borderRadius: "var(--radius-full)",
          backgroundColor: ds.bg, border: `1px solid ${ds.color}44`,
          fontSize: "0.82rem", fontWeight: 700, color: ds.color,
        }}>
          {drift.decoupling > 0 ? "↑" : "↓"} {Math.abs(drift.decoupling).toFixed(1)}% dérive
        </div>
      </div>

      <p style={{ fontSize: "0.82rem", color: ds.color, fontWeight: 600, marginBottom: "1rem" }}>
        {ds.label}
      </p>

      {/* Two halves comparison */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
        {[
          { label: "1ʳᵉ moitié", ef: drift.ef1, hr: drift.avgHR1, pace: drift.avgPace1 },
          { label: "2ᵉ moitié",  ef: drift.ef2, hr: drift.avgHR2, pace: drift.avgPace2 },
        ].map((half, i) => {
          const isWorse = i === 1 && drift.ef2 < drift.ef1;
          return (
            <div key={i} style={{
              padding: "1rem", borderRadius: "var(--radius-md)",
              border: `1px solid ${isWorse ? "#fecaca" : "var(--border-color)"}`,
              background: isWorse ? "#fef2f2" : "var(--bg-secondary)",
            }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-tertiary)", marginBottom: "0.5rem" }}>
                {half.label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                  <span style={{ color: "var(--text-secondary)" }}>EF</span>
                  <strong style={{ color: "#fbbf24", fontFamily: "var(--font-heading)" }}>{half.ef.toFixed(2)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                  <span style={{ color: "var(--text-secondary)" }}>FC moy.</span>
                  <span style={{ color: "var(--color-hr)", fontWeight: 600 }}>{half.hr} bpm</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Allure moy.</span>
                  <span style={{ fontWeight: 600 }}>{formatPace(half.pace)} /km</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* EF overall */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0.65rem 1rem", borderRadius: "var(--radius-md)",
        border: "1px solid #fbbf2433", background: "#fbbf240d",
      }}>
        <div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", fontWeight: 600 }}>
            EF global de la séance
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "2px" }}>
            Vitesse (m/s) × 1000 ÷ FC — plus c'est élevé, meilleure est l'efficacité
          </div>
        </div>
        <div style={{
          fontFamily: "var(--font-heading)", fontWeight: 800,
          fontSize: "1.6rem", color: "#fbbf24",
        }}>
          {drift.efOverall.toFixed(2)}
        </div>
      </div>
    </div>
  );
};
