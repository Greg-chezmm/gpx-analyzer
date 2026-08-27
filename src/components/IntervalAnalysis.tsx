import React, { useState } from "react";
import { Zap, AlertTriangle, Heart, Gauge, ChevronDown, Watch, TrendingUp } from "lucide-react";
import type { GPXInterval } from "../utils/gpxParser";
import type { GPXTrackPoint } from "../utils/gpxParser";
import { formatDuration, formatPace } from "../utils/format";
import { IntervalMapModal } from "./IntervalMapModal";

interface IntervalAnalysisProps {
  intervals: GPXInterval[];
  activityType: "running" | "cycling" | "unknown";
  points: GPXTrackPoint[];
  source?: "fit" | "detected";
}

/** Calcule la moyenne d'un tableau de nombres ; retourne null si vide. */
function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Tableau des intervalles d'effort détectés, avec résumé et clic → carte. */
export const IntervalAnalysis: React.FC<IntervalAnalysisProps> = ({
  intervals,
  activityType,
  points,
  source = "detected",
}) => {
  const [open, setOpen] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState<{ iv: GPXInterval; idx: number } | null>(null);

  const effortIntervals   = intervals.filter((iv) => iv.type === "effort");
  const recoveryIntervals = intervals.filter((iv) => iv.type === "recovery");

  if (effortIntervals.length === 0) return null;

  const isCycling = activityType === "cycling";
  const cadenceUnit = isCycling ? "rpm" : "ppm";
  // Cadence GPX stockée en demi-pas/s pour la course ; on multiplie par 2 pour obtenir ppm.
  const cadenceDisplay = (raw: number) => (isCycling ? raw : raw * 2);

  const hasHeartRate = effortIntervals.some((iv) => iv.avgHeartRate !== null);
  const hasCadence   = effortIntervals.some((iv) => iv.avgCadence !== null);
  const hasPower     = effortIntervals.some((iv) => iv.avgPower != null);
  const hasElevation = effortIntervals.some((iv) => (iv.totalAscent ?? 0) > 0 || (iv.totalDescent ?? 0) > 0);

  const avgEffortPace    = avg(effortIntervals.filter((iv) => iv.avgPace > 0).map((iv) => iv.avgPace));
  const avgRecoveryPace  = avg(recoveryIntervals.filter((iv) => iv.avgPace > 0).map((iv) => iv.avgPace));
  const avgEffortPower   = hasPower
    ? avg(effortIntervals.filter(iv => iv.avgPower != null).map(iv => iv.avgPower!))
    : null;

  // Badge fatigue : si l'allure des 3 derniers efforts dépasse de >5% celle des 3 premiers.
  let showFatigueBadge = false;
  if (effortIntervals.length >= 6) {
    const avgFirst = avg(effortIntervals.slice(0, 3).map((iv) => iv.avgPace));
    const avgLast  = avg(effortIntervals.slice(-3).map((iv) => iv.avgPace));
    if (avgFirst !== null && avgLast !== null && avgFirst > 0) {
      showFatigueBadge = (avgLast - avgFirst) / avgFirst > 0.05;
    }
  }

  return (
    <div className="card animate-slide-up" style={{ width: "100%" }}>
      {/* En-tête cliquable — plie/déplie le panneau */}
      <div
        className="panel-header"
        onClick={() => setOpen(o => !o)}
        style={{ flexWrap: "wrap", gap: "0.75rem", cursor: "pointer", userSelect: "none", marginBottom: open ? undefined : 0, borderBottom: open ? undefined : "none", paddingBottom: open ? undefined : 0 }}
      >
        <h3 className="panel-title">
          <Zap size={18} style={{ color: "var(--color-time)" }} />
          <span>
            Analyse Fractionnés —{" "}
            <span style={{ color: "var(--color-time)" }}>
              {effortIntervals.length} répétition{effortIntervals.length > 1 ? "s" : ""}
            </span>
          </span>
        </h3>

        {source === "fit" && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "0.35rem",
            padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)",
            background: "#eff6ff", border: "1px solid #93c5fd",
            color: "#1d4ed8", fontSize: "0.75rem", fontWeight: 700,
          }}>
            <Watch size={12} /> Laps montre
          </div>
        )}

        {showFatigueBadge && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "0.4rem",
            padding: "0.3rem 0.75rem", borderRadius: "var(--radius-full)",
            background: "#fff7ed", border: "1px solid #f97316",
            color: "#c2410c", fontSize: "0.82rem", fontWeight: 700,
          }}>
            <AlertTriangle size={13} /> Fatigue
          </div>
        )}
        <ChevronDown size={16} style={{ color: "var(--text-tertiary)", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none", marginLeft: "auto" }} />
      </div>

      {open && <>
        {/* Résumé global des efforts */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: "1rem",
          marginBottom: "1.25rem", padding: "0.75rem 1rem",
          background: "var(--bg-primary)", borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-color)", fontSize: "0.88rem",
          color: "var(--text-secondary)", fontWeight: 500,
        }}>
          <span><strong style={{ color: "var(--text-primary)" }}>{effortIntervals.length}</strong> effort{effortIntervals.length > 1 ? "s" : ""}</span>
          {avgEffortPace !== null && (
            <span>Allure effort moy. : <strong style={{ color: "var(--color-time)", fontFamily: "var(--font-heading)" }}>{formatPace(avgEffortPace)} /km</strong></span>
          )}
          {avgRecoveryPace !== null && recoveryIntervals.length > 0 && (
            <span>Allure récup. moy. : <strong style={{ color: "var(--color-ele)", fontFamily: "var(--font-heading)" }}>{formatPace(avgRecoveryPace)} /km</strong></span>
          )}
          {avgEffortPower !== null && (
            <span>Puissance moy. : <strong style={{ color: "var(--color-cad)", fontFamily: "var(--font-heading)" }}>{Math.round(avgEffortPower)} W</strong></span>
          )}
        </div>

        {/* Tableau détaillé par répétition */}
        <div style={{ overflowX: "auto", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
          <table className="splits-table">
            <thead>
              <tr>
                <th style={{ width: "44px" }}>#</th>
                <th>Durée</th>
                <th>Distance</th>
                <th><span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><Zap size={13} /> Allure</span></th>
                <th>V. max</th>
                {hasElevation && (
                  <th><span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--color-ele)" }}><TrendingUp size={13} /> D+/D-</span></th>
                )}
                {hasHeartRate && (
                  <th><span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--color-hr)" }}><Heart size={13} /> FC</span></th>
                )}
                {hasPower && (
                  <th><span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--color-cad)" }}>⚡ Puiss.</span></th>
                )}
                {hasCadence && (
                  <th><span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--color-cad)" }}><Gauge size={13} /> Cad.</span></th>
                )}
              </tr>
            </thead>
            <tbody>
              {effortIntervals.map((iv, idx) => (
                <tr
                  key={iv.number}
                  onClick={() => setSelectedInterval({ iv, idx })}
                  style={{ background: "#fffbeb", borderLeft: "3px solid #f97316", cursor: "pointer" }}
                  title="Cliquer pour voir sur la carte"
                >
                  <td style={{ fontWeight: 700, color: "var(--color-time)", borderLeft: "3px solid #f97316" }}>
                    {iv.number}
                  </td>
                  <td className="numeric">{formatDuration(iv.duration)}</td>
                  <td className="numeric">
                    {iv.distance >= 1000 ? `${(iv.distance / 1000).toFixed(2)} km` : `${Math.round(iv.distance)} m`}
                  </td>
                  <td className="numeric" style={{ fontWeight: 600, color: "var(--color-time)" }}>
                    {formatPace(iv.avgPace)}
                  </td>
                  <td className="numeric" style={{ fontWeight: 600 }}>
                    {(iv.maxSpeed * 3.6).toFixed(1)} km/h
                  </td>
                  {hasElevation && (
                    <td className="numeric" style={{ fontSize: "0.8rem" }}>
                      {(iv.totalAscent ?? 0) > 0 && <span style={{ color: "#22c55e" }}>+{iv.totalAscent}m</span>}
                      {(iv.totalAscent ?? 0) > 0 && (iv.totalDescent ?? 0) > 0 && " "}
                      {(iv.totalDescent ?? 0) > 0 && <span style={{ color: "#94a3b8" }}>−{iv.totalDescent}m</span>}
                      {(iv.totalAscent ?? 0) === 0 && (iv.totalDescent ?? 0) === 0 && "—"}
                    </td>
                  )}
                  {hasHeartRate && (
                    <td className="numeric" style={{ color: "var(--color-hr)" }}>
                      {iv.avgHeartRate !== null ? (
                        <span>
                          <strong style={{ fontWeight: 600 }}>{iv.avgHeartRate}</strong>
                          {iv.maxHeartRate !== null && (
                            <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginLeft: "0.25rem" }}>
                              ({iv.maxHeartRate})
                            </span>
                          )}
                        </span>
                      ) : "—"}
                    </td>
                  )}
                  {hasPower && (
                    <td className="numeric" style={{ color: "var(--color-cad)", fontWeight: 600 }}>
                      {iv.avgPower != null ? `${Math.round(iv.avgPower)} W` : "—"}
                    </td>
                  )}
                  {hasCadence && (
                    <td className="numeric" style={{ color: "var(--color-cad)", fontWeight: 600 }}>
                      {iv.avgCadence !== null ? `${cadenceDisplay(iv.avgCadence)} ${cadenceUnit}` : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}

      {selectedInterval && (
        <IntervalMapModal
          interval={selectedInterval.iv}
          intervalIndex={selectedInterval.idx}
          points={points}
          onClose={() => setSelectedInterval(null)}
        />
      )}
    </div>
  );
};
