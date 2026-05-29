import React, { useState } from "react";
import { Zap, AlertTriangle, Heart, Gauge, ChevronDown } from "lucide-react";
import type { GPXInterval } from "../utils/gpxParser";
import { formatDuration, formatPace } from "./SplitsTable";

interface IntervalAnalysisProps {
  intervals: GPXInterval[];
  activityType: "running" | "cycling" | "unknown";
}

/** Returns the average of an array of numbers, or null if the array is empty. */
function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export const IntervalAnalysis: React.FC<IntervalAnalysisProps> = ({
  intervals,
  activityType,
}) => {
  const effortIntervals = intervals.filter((iv) => iv.type === "effort");
  const recoveryIntervals = intervals.filter((iv) => iv.type === "recovery");

  if (effortIntervals.length === 0) return null;

  const isCycling = activityType === "cycling";
  const cadenceUnit = isCycling ? "rpm" : "ppm";
  const cadenceDisplay = (raw: number) => (isCycling ? raw : raw * 2);

  // Check which optional columns are present across effort intervals
  const hasHeartRate = effortIntervals.some((iv) => iv.avgHeartRate !== null);
  const hasCadence = effortIntervals.some((iv) => iv.avgCadence !== null);

  // Summary stats
  const avgEffortPace = avg(
    effortIntervals.filter((iv) => iv.avgPace > 0).map((iv) => iv.avgPace)
  );
  const avgRecoveryPace = avg(
    recoveryIntervals.filter((iv) => iv.avgPace > 0).map((iv) => iv.avgPace)
  );

  // Fatigue indicator: compare last 3 efforts vs first 3 by pace (higher pace = slower)
  let showFatigueBadge = false;
  if (effortIntervals.length >= 6) {
    const first3 = effortIntervals.slice(0, 3);
    const last3 = effortIntervals.slice(-3);
    const avgFirst = avg(first3.map((iv) => iv.avgPace));
    const avgLast = avg(last3.map((iv) => iv.avgPace));
    if (avgFirst !== null && avgLast !== null && avgFirst > 0) {
      // If last 3 are more than 5% slower (higher pace value) than first 3
      showFatigueBadge = (avgLast - avgFirst) / avgFirst > 0.05;
    }
  }

  const [open, setOpen] = useState(false);

  return (
    <div className="card animate-slide-up" style={{ width: "100%" }}>
      {/* Header */}
      <div
        className="panel-header"
        onClick={() => setOpen(o => !o)}
        style={{ flexWrap: "wrap", gap: "0.75rem", cursor: "pointer", userSelect: "none", marginBottom: open ? undefined : 0, borderBottom: open ? undefined : "none", paddingBottom: open ? undefined : 0 }}
      >
        <h3 className="panel-title">
          <Zap size={18} style={{ color: "var(--color-time)" }} />
          <span>
            Analyse Fractionnés &mdash;{" "}
            <span style={{ color: "var(--color-time)" }}>
              {effortIntervals.length} répétition{effortIntervals.length > 1 ? "s" : ""} détectée
              {effortIntervals.length > 1 ? "s" : ""}
            </span>
          </span>
        </h3>

        {showFatigueBadge && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.3rem 0.75rem",
              borderRadius: "var(--radius-full)",
              background: "#fff7ed",
              border: "1px solid #f97316",
              color: "#c2410c",
              fontSize: "0.82rem",
              fontWeight: 700,
            }}
          >
            <AlertTriangle size={13} />
            Fatigue
          </div>
        )}
        <ChevronDown size={16} style={{ color: "var(--text-tertiary)", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none", marginLeft: "auto" }} />
      </div>

      {open && <>{/* Summary line */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.25rem",
          padding: "0.75rem 1rem",
          background: "var(--bg-primary)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-color)",
          fontSize: "0.88rem",
          color: "var(--text-secondary)",
          fontWeight: 500,
        }}
      >
        <span>
          <strong style={{ color: "var(--text-primary)" }}>{effortIntervals.length}</strong>{" "}
          effort{effortIntervals.length > 1 ? "s" : ""}
        </span>
        {avgEffortPace !== null && (
          <span>
            Allure effort moy. :{" "}
            <strong style={{ color: "var(--color-time)", fontFamily: "var(--font-heading)" }}>
              {formatPace(avgEffortPace)} /km
            </strong>
          </span>
        )}
        {avgRecoveryPace !== null && recoveryIntervals.length > 0 && (
          <span>
            Allure récup. moy. :{" "}
            <strong style={{ color: "var(--color-ele)", fontFamily: "var(--font-heading)" }}>
              {formatPace(avgRecoveryPace)} /km
            </strong>
          </span>
        )}
      </div>

      {/* Table */}
      <div
        style={{
          overflowX: "auto",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-color)",
        }}
      >
        <table className="splits-table">
          <thead>
            <tr>
              <th style={{ width: "44px" }}>#</th>
              <th>Durée</th>
              <th>Distance</th>
              <th>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  <Zap size={13} /> Allure moy.
                </span>
              </th>
              <th>V. max</th>
              {hasHeartRate && (
                <th>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      color: "var(--color-hr)",
                    }}
                  >
                    <Heart size={13} /> FC moy.
                  </span>
                </th>
              )}
              {hasCadence && (
                <th>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      color: "var(--color-cad)",
                    }}
                  >
                    <Gauge size={13} /> Cadence
                  </span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {effortIntervals.map((iv) => (
              <tr
                key={iv.number}
                style={{
                  background: "#fffbeb",
                  borderLeft: "3px solid #f97316",
                }}
              >
                <td
                  style={{
                    fontWeight: 700,
                    color: "var(--color-time)",
                    borderLeft: "3px solid #f97316",
                  }}
                >
                  {iv.number}
                </td>
                <td className="numeric">{formatDuration(iv.duration)}</td>
                <td className="numeric">
                  {iv.distance >= 1000
                    ? `${(iv.distance / 1000).toFixed(2)} km`
                    : `${Math.round(iv.distance)} m`}
                </td>
                <td
                  className="numeric"
                  style={{ fontWeight: 600, color: "var(--color-time)" }}
                >
                  {formatPace(iv.avgPace)}
                </td>
                <td className="numeric" style={{ fontWeight: 600 }}>
                  {(iv.maxSpeed * 3.6).toFixed(1)} km/h
                </td>
                {hasHeartRate && (
                  <td className="numeric" style={{ color: "var(--color-hr)" }}>
                    {iv.avgHeartRate !== null ? (
                      <span>
                        <strong style={{ fontWeight: 600 }}>{iv.avgHeartRate}</strong>
                        {iv.maxHeartRate !== null && (
                          <span
                            style={{
                              fontSize: "0.78rem",
                              color: "var(--text-secondary)",
                              marginLeft: "0.25rem",
                            }}
                          >
                            (max : {iv.maxHeartRate})
                          </span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
                {hasCadence && (
                  <td className="numeric" style={{ color: "var(--color-cad)", fontWeight: 600 }}>
                    {iv.avgCadence !== null
                      ? `${cadenceDisplay(iv.avgCadence)} ${cadenceUnit}`
                      : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>}
    </div>
  );
};
