import React, { useState } from "react";
import { Repeat, ChevronDown, ChevronUp } from "lucide-react";
import type { HillRepeatSeries, HillRepetition } from "../utils/hillRepeats";
import type { GPXTrackPoint } from "../utils/gpxParser";
import { formatDuration, formatPace } from "./SplitsTable";
import { HillRepeatMapModal } from "./HillRepeatMapModal";

interface HillRepeatsProps {
  series: HillRepeatSeries[];
  points: GPXTrackPoint[];
}

function FatigueBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const abs = Math.abs(pct);
  if (abs < 3) return (
    <span style={{ padding: "0.15rem 0.55rem", borderRadius: "var(--radius-full)", fontSize: "0.75rem", fontWeight: 700, background: "rgba(5,150,105,0.12)", color: "#059669" }}>
      Régulier
    </span>
  );
  const color = pct > 0 ? (abs > 8 ? "#e11d48" : "#f59e0b") : "#059669";
  const bg    = pct > 0 ? (abs > 8 ? "rgba(225,29,72,0.10)" : "rgba(245,158,11,0.12)") : "rgba(5,150,105,0.12)";
  const label = pct > 0 ? `⚠ Fatigue +${pct.toFixed(1)}%` : `↑ Progression ${Math.abs(pct).toFixed(1)}%`;
  return (
    <span style={{ padding: "0.15rem 0.55rem", borderRadius: "var(--radius-full)", fontSize: "0.75rem", fontWeight: 700, background: bg, color }}>
      {label}
    </span>
  );
}

interface RepRowProps {
  rep: HillRepetition;
  hasHR: boolean;
  isLast: boolean;
  onClick: () => void;
}

function RepRow({ rep, hasHR, isLast, onClick }: RepRowProps) {
  return (
    <tr
      onClick={onClick}
      title="Cliquer pour voir sur la carte"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--border-color)",
        cursor: "pointer",
      }}
    >
      <td style={{ padding: "0.45rem 0.75rem", fontWeight: 700, color: "var(--accent-primary)", fontSize: "0.85rem" }}>
        {rep.repIndex + 1}
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem" }}>
        {rep.distance >= 1000 ? `${(rep.distance / 1000).toFixed(2)} km` : `${Math.round(rep.distance)} m`}
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", color: "var(--color-ele)", fontWeight: 600 }}>
        +{Math.round(rep.elevGain)} m
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem" }}>
        {formatDuration(Math.round(rep.duration))}
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", color: "var(--color-speed)", fontWeight: 600 }}>
        {rep.avgPace > 0 ? formatPace(rep.avgPace) + " /km" : "—"}
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
        {Math.round(rep.vam)} m/h
      </td>
      {hasHR && (
        <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", color: "var(--color-hr)", fontWeight: 600 }}>
          {rep.avgHR !== null ? `${rep.avgHR} bpm` : "—"}
        </td>
      )}
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
        {rep.recovery
          ? `${formatDuration(Math.round(rep.recovery.duration))} · ${
              rep.recovery.distance >= 1000
                ? `${(rep.recovery.distance / 1000).toFixed(1)} km`
                : `${Math.round(rep.recovery.distance)} m`
            }`
          : "—"}
      </td>
    </tr>
  );
}

interface SeriesPanelProps {
  s: HillRepeatSeries;
  onRepClick: (rep: HillRepetition, seriesId: number) => void;
}

function SeriesPanel({ s, onRepClick }: SeriesPanelProps) {
  const [open, setOpen] = useState(true);
  const hasHR = s.avgHR !== null;

  return (
    <div style={{
      border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)",
      overflow: "hidden", marginBottom: "0.75rem",
    }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "0.75rem",
          padding: "0.75rem 1rem", background: "var(--bg-secondary)",
          border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)", flex: 1 }}>
          Série {s.id + 1} — {s.repCount} répétitions
          <span style={{ fontWeight: 400, color: "var(--text-secondary)", marginLeft: "0.5rem", fontSize: "0.82rem" }}>
            · D+ {s.avgElevGain} m · {s.avgGrade}% · VAM {s.avgVAM} m/h
          </span>
        </span>
        <FatigueBadge pct={s.fatiguePct} />
        {open ? <ChevronUp size={15} style={{ flexShrink: 0 }} /> : <ChevronDown size={15} style={{ flexShrink: 0 }} />}
      </button>

      {open && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-color)", background: "var(--bg-primary)" }}>
                {["#", "Distance", "D+", "Durée", "Allure", "VAM", ...(hasHR ? ["FC moy."] : []), "Récupération"].map(h => (
                  <th key={h} style={{ padding: "0.4rem 0.75rem", textAlign: "left", fontWeight: 600, fontSize: "0.78rem", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.reps.map((rep, i) => (
                <RepRow
                  key={rep.startIndex}
                  rep={rep}
                  hasHR={hasHR}
                  isLast={i === s.reps.length - 1}
                  onClick={() => onRepClick(rep, s.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const HillRepeats: React.FC<HillRepeatsProps> = ({ series, points }) => {
  const totalReps = series.reduce((a, s) => a + s.repCount, 0);
  const [selected, setSelected] = useState<{ rep: HillRepetition; seriesId: number } | null>(null);

  return (
    <div className="card animate-slide-up" style={{ marginTop: "1rem" }}>
      <div className="panel-header">
        <h3 className="panel-title">
          <Repeat size={18} style={{ color: "var(--accent-primary)" }} />
          <span>Répétitions de côtes</span>
          <span style={{ fontSize: "0.82rem", fontWeight: 400, color: "var(--text-secondary)", marginLeft: "0.5rem" }}>
            — {series.length} série{series.length > 1 ? "s" : ""} · {totalReps} répétitions
          </span>
        </h3>
      </div>

      <div style={{ marginTop: "0.75rem" }}>
        {series.map(s => (
          <SeriesPanel
            key={s.id}
            s={s}
            onRepClick={(rep, seriesId) => setSelected({ rep, seriesId })}
          />
        ))}
      </div>

      {selected && (
        <HillRepeatMapModal
          rep={selected.rep}
          seriesId={selected.seriesId}
          points={points}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};
