import React from "react";
import { Target } from "lucide-react";
import type { VO2maxEstimate } from "../utils/gpxParser";
import type { AggregatedRunBest } from "../utils/bestEfforts";
import { computeVDOTFromBests } from "../utils/vdot";
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
  /** Meilleurs temps réels agrégés sur l'historique (voir aggregateBestRunEfforts) — utilisés en
   * priorité sur l'estimation sous-maximale, chacun pour la distance/allure la plus proche. */
  bests: AggregatedRunBest[];
}

/**
 * Affiche les prédictions de temps de course et allures d'entraînement (modèle VDOT de Jack
 * Daniels), basées en priorité sur les vrais résultats de course de l'athlète (chaque prédiction
 * utilise le résultat réel le plus proche en distance, pas un VDOT unique extrapolé partout — un
 * 10K rapide ne doit pas gonfler la prédiction marathon). Retombe sur l'estimation sous-maximale
 * FC/allure de la séance en cours là où aucun résultat réel n'est disponible.
 * Non rendu si ni résultat réel ni estimation fiable de la séance.
 */
export const VDOTPredictor: React.FC<Props> = ({ estimate, bests }) => {
  if (bests.length === 0 && estimate.confidence === "low") return null;

  const usesFallback = bests.length === 0;
  const { vdot, races, paces } = computeVDOTFromBests(bests, estimate.confidence !== "low" ? estimate.value : null);

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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.2rem" }}>
          <div style={{
            padding: "0.3rem 0.85rem", borderRadius: "var(--radius-full)",
            backgroundColor: "#a78bfa18", border: "1px solid #a78bfa44",
            fontSize: "0.85rem", fontWeight: 800, color: "#a78bfa",
            fontFamily: "var(--font-heading)",
          }}>
            VDOT {Math.round(vdot)}
          </div>
          <span style={{ fontSize: "0.68rem", color: "var(--text-tertiary)" }}>
            {usesFallback ? "estimation FC/allure" : "résultats réels"}
          </span>
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
                <div style={{ minWidth: "70px" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, display: "block" }}>
                    {race.label}
                  </span>
                  {race.isActual && (
                    <span style={{ fontSize: "0.68rem", color: "#34d399", fontWeight: 600 }}>temps réel</span>
                  )}
                  {race.sourceLabel && (
                    <span style={{ fontSize: "0.68rem", color: "var(--text-tertiary)" }}>depuis {race.sourceLabel}</span>
                  )}
                </div>
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
                    <div style={{ minWidth: 0, overflow: "hidden" }}>
                      <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                        {pace.description}
                      </span>
                      {pace.sourceLabel && (
                        <span style={{ fontSize: "0.68rem", color: "var(--text-tertiary)" }}>depuis {pace.sourceLabel}</span>
                      )}
                    </div>
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
        {usesFallback
          ? `Basé sur VO2max estimé (${estimate.value} mL/kg/min, séance en cours) — à affiner avec un résultat de course réel.`
          : "Chaque prédiction utilise ton résultat réel le plus proche en distance (pas un VDOT unique extrapolé partout — une distance courte rapide ne doit pas gonfler une prédiction longue distance, et inversement)."}
        {" "}Formules Daniels &amp; Gilbert, <em>Oxygen Power</em>.
      </p>
    </div>
  );
};
