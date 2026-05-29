import React from "react";
import type { GPXSplit } from "../utils/gpxParser";
import { formatPace } from "./SplitsTable";
import { BarChart2 } from "lucide-react";

interface SplitsBarsProps {
  splits: GPXSplit[];
  activityType: 'running' | 'cycling' | 'unknown';
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

const GREEN:  [number, number, number] = [16,  185, 129];
const YELLOW: [number, number, number] = [251, 191, 36];
const RED:    [number, number, number] = [239, 68,  68];

function paceColor(t: number): string {
  if (t < 0.5) return lerpColor(GREEN, YELLOW, t * 2);
  return lerpColor(YELLOW, RED, (t - 0.5) * 2);
}

const BAR_MAX_H = 88;
const BAR_MIN_H = 18;

export const SplitsBars: React.FC<SplitsBarsProps> = ({ splits, activityType }) => {
  if (splits.length === 0) return null;

  const hasHR = splits.some(s => s.avgHeartRate !== null);
  const isCycling = activityType === 'cycling';

  const paces = splits.map(s => s.avgPace);
  const minPace = Math.min(...paces);
  const maxPace = Math.max(...paces);
  const paceRange = maxPace - minPace;
  const avgPace = paces.reduce((a, b) => a + b, 0) / paces.length;

  const barH = (pace: number) => {
    const t = paceRange < 1 ? 0 : (pace - minPace) / paceRange;
    return BAR_MAX_H - (BAR_MAX_H - BAR_MIN_H) * t;
  };

  const avgBarH = paceRange < 1 ? BAR_MAX_H : BAR_MAX_H - (BAR_MAX_H - BAR_MIN_H) * (avgPace - minPace) / paceRange;

  const isPartial = (s: GPXSplit) => s.distance < splits[0].distance * 0.95;

  return (
    <div className="card animate-slide-up">
      <div className="panel-header">
        <h3 className="panel-title">
          <BarChart2 size={18} style={{ color: "var(--accent-primary)" }} />
          <span>Splits visuels</span>
        </h3>
        <div style={{ fontSize: "0.78rem", color: "var(--text-tertiary)" }}>
          {isCycling ? 'Barre haute = vitesse rapide' : 'Barre haute = allure rapide'} · ligne pointillée = moyenne
        </div>
      </div>

      <div style={{ position: "relative", overflowX: "auto", paddingBottom: "0.25rem" }}>
        {/* Average pace reference line */}
        <div style={{
          position: "absolute",
          left: 0, right: 0,
          bottom: `calc(${avgBarH}px + 2.8rem)`,
          height: "1px",
          borderTop: "1.5px dashed var(--text-tertiary)",
          opacity: 0.45,
          pointerEvents: "none",
        }} />

        <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", minHeight: `${BAR_MAX_H + 48}px`, paddingTop: "1rem" }}>
          {splits.map((split) => {
            const t = paceRange < 1 ? 0 : (split.avgPace - minPace) / paceRange;
            const color = paceColor(t);
            const h = barH(split.avgPace);
            const partial = isPartial(split);

            return (
              <div key={split.number} style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: "3px", flex: partial ? "0 0 28px" : "1 1 0", minWidth: "28px", maxWidth: "64px",
              }}>
                {/* HR label above bar */}
                {hasHR && (
                  <div style={{ fontSize: "0.65rem", color: "var(--color-hr)", fontWeight: 700, height: "14px", lineHeight: "14px" }}>
                    {split.avgHeartRate ?? ""}
                  </div>
                )}

                {/* Bar */}
                <div style={{
                  width: "100%",
                  height: `${h}px`,
                  backgroundColor: color,
                  borderRadius: "4px 4px 0 0",
                  opacity: partial ? 0.6 : 1,
                  border: `1px solid ${color}`,
                  transition: "height 0.3s ease",
                  boxSizing: "border-box",
                }} />

                {/* Km label */}
                <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: 600, whiteSpace: "nowrap" }}>
                  {partial ? `~${(split.distance / 1000).toFixed(1)}` : `${split.number}`}
                </div>

                {/* Pace label */}
                <div style={{ fontSize: "0.68rem", color, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {isCycling ? `${(split.avgSpeed * 3.6).toFixed(1)}` : formatPace(split.avgPace)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{
        display: "flex", gap: "1.5rem", justifyContent: "center",
        paddingTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-tertiary)",
      }}>
        <span>
          <span style={{ color: "rgb(16,185,129)", fontWeight: 700 }}>■</span> Rapide ({isCycling ? `${(splits.reduce((best, s) => s.avgSpeed > best.avgSpeed ? s : best).avgSpeed * 3.6).toFixed(1)} km/h` : formatPace(minPace)})
        </span>
        <span>
          <span style={{ color: "rgb(239,68,68)", fontWeight: 700 }}>■</span> Lent ({isCycling ? `${(splits.reduce((slow, s) => s.avgSpeed < slow.avgSpeed ? s : slow).avgSpeed * 3.6).toFixed(1)} km/h` : formatPace(maxPace)})
        </span>
        {hasHR && <span>❤️ FC moy (bpm)</span>}
      </div>
    </div>
  );
};
