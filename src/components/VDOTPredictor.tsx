import React from "react";
import { Target } from "lucide-react";
import type { VO2maxEstimate } from "../utils/gpxParser";
import { computeVDOT } from "../utils/vdot";
import { formatPace, formatDuration } from "./SplitsTable";

/** Couleurs par type d'allure Jack Daniels (E/M/T/I/R). */
const PACE_COLORS: Record<string, string> = {
  E: "#60a5fa",
  M: "#34d399",
  T: "#fbbf24",
  I: "#f97316",
  R: "#ef4444",
};

interface Props {
  estimate: VO2maxEstimate;
}

/**
 * Affiche les prédictions de temps de course et allures d'entraînement calculées
 * via le modèle VDOT de Jack Daniels à partir du VO2max estimé.
 * Non rendu si la fiabilité du VO2max est faible.
 */
export const VDOTPredictor: React.FC<Props> = ({ estimate }) => {
  if (estimate.confidence === "low") return null;

  const { vdot, races, paces } = computeVDOT(estimate.value);

  return (
    <div className="card animate-slide-up">
      <div className="panel-header">
        <h3 className="panel-title">
          <Target size={18} style={{ color: "#a78bfa" }} />
          <span>Prédictions VDOT</span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontWeight: 500 }}>
            · méthode Jack Daniels
          </span>
        </h3>
        <div style={{
          padding: "0.3rem 0.85rem", borderRadius: "var(--radius-full)",
          backgroundColor: "#a78bfa18", border: "1px solid #a78bfa44",
          fontSize: "0.85rem", fontWeight: 800, color: "#a78bfa",
          fontFamily: "var(--font-heading)",
        }}>
          VDOT {Math.round(vdot)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.5rem" }}>

        {/* ── Temps prédits par distance ─────────────────────────────────── */}
        <div>
          <p style={{
            fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)",
            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem",
          }}>
            Temps prédits
          </p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {races.map((race, i) => (
              <div key={race.label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                padding: "0.5rem 0",
                borderBottom: i < races.length - 1 ? "1px solid var(--border-color)" : "none",
              }}>
                <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, minWidth: "70px" }}>
                  {race.label}
                </span>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem" }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, color: "var(--text-primary)", fontSize: "0.95rem" }}>
                    {formatDuration(race.timeS)}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                    {formatPace(race.timeS / (race.distance / 1000))} /km
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Allures d'entraînement E/M/T/I/R ─────────────────────────── */}
        <div>
          <p style={{
            fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)",
            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem",
          }}>
            Allures d'entraînement
          </p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {paces.map((pace, i) => {
              const color = PACE_COLORS[pace.label] ?? "var(--accent-primary)";
              // Si l'écart min/max < 2 s/km, afficher une valeur unique plutôt qu'une plage
              const isSingle = Math.abs(pace.minPaceSecPerKm - pace.maxPaceSecPerKm) < 2;
              const paceStr = isSingle
                ? `${formatPace(pace.minPaceSecPerKm)} /km`
                : `${formatPace(pace.minPaceSecPerKm)} – ${formatPace(pace.maxPaceSecPerKm)} /km`;

              return (
                <div key={pace.label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "0.5rem 0",
                  borderBottom: i < paces.length - 1 ? "1px solid var(--border-color)" : "none",
                  gap: "0.5rem",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}>
                    <span style={{
                      width: "28px", height: "28px", borderRadius: "6px", flexShrink: 0,
                      background: `${color}1a`, border: `1px solid ${color}44`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.75rem", fontWeight: 800, color,
                      fontFamily: "var(--font-heading)",
                    }}>
                      {pace.label}
                    </span>
                    <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {pace.description}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: "var(--font-heading)", fontWeight: 800,
                    fontSize: "0.88rem", color, whiteSpace: "nowrap",
                  }}>
                    {paceStr}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p style={{
        fontSize: "0.71rem", color: "var(--text-tertiary)",
        borderTop: "1px solid var(--border-color)", paddingTop: "0.6rem", marginTop: "0.75rem",
      }}>
        Basé sur VO2max estimé ({estimate.value} mL/kg/min) — à affiner avec un résultat de course réel.
        Formules Daniels &amp; Gilbert, <em>Oxygen Power</em>.
      </p>
    </div>
  );
};
