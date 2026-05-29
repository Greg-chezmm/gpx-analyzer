import React, { useState } from "react";
import { Mountain, ChevronDown } from "lucide-react";
import type { ClimbSegment, ClimbCategory, GPXTrackPoint } from "../utils/gpxParser";
import { CLIMB_CATEGORIES } from "../utils/gpxParser";
import { formatDuration, formatPace } from "./SplitsTable";
import { ClimbMapModal } from "./ClimbMapModal";

interface ClimbAnalysisProps {
  climbs: ClimbSegment[];
  points: GPXTrackPoint[];
}

interface CategoryStats {
  count: number;
  totalDist: number;
  totalElevGain: number;
  avgGrade: number;
  avgPace: number;
  avgHR: number | null;
  bestVam: number;
}

const CATEGORY_ORDER: ClimbCategory[] = ['moderate', 'steep', 'very_steep'];

export const ClimbAnalysis: React.FC<ClimbAnalysisProps> = ({ climbs, points }) => {
  if (climbs.length === 0) return null;

  // Aggregate by category
  const stats = new Map<ClimbCategory, CategoryStats>();

  for (const c of climbs) {
    const prev = stats.get(c.category);
    if (!prev) {
      stats.set(c.category, {
        count: 1,
        totalDist: c.distance,
        totalElevGain: c.elevGain,
        avgGrade: c.avgGrade,
        avgPace: c.avgPace,
        avgHR: c.avgHR,
        bestVam: c.vam,
      });
    } else {
      const n = prev.count + 1;
      stats.set(c.category, {
        count: n,
        totalDist: prev.totalDist + c.distance,
        totalElevGain: prev.totalElevGain + c.elevGain,
        avgGrade: (prev.avgGrade * prev.count + c.avgGrade) / n,
        avgPace: prev.avgPace > 0 && c.avgPace > 0
          ? (prev.avgPace * prev.count + c.avgPace) / n
          : prev.avgPace || c.avgPace,
        avgHR: prev.avgHR !== null && c.avgHR !== null
          ? Math.round((prev.avgHR * prev.count + c.avgHR) / n)
          : prev.avgHR ?? c.avgHR,
        bestVam: Math.max(prev.bestVam, c.vam),
      });
    }
  }

  const [open, setOpen] = useState(false);
  const [selectedClimb, setSelectedClimb] = useState<{ climb: ClimbSegment; index: number } | null>(null);

  const hasHR = climbs.some(c => c.avgHR !== null);
  const totalGain = climbs.reduce((s, c) => s + c.elevGain, 0);
  const totalDist = climbs.reduce((s, c) => s + c.distance, 0);

  const presentCategories = CATEGORY_ORDER.filter(cat => stats.has(cat));

  return (
    <div className="card animate-slide-up">
      <div
        className="panel-header"
        onClick={() => setOpen(o => !o)}
        style={{ cursor: "pointer", userSelect: "none", marginBottom: open ? undefined : 0, borderBottom: open ? undefined : "none", paddingBottom: open ? undefined : 0 }}
      >
        <h3 className="panel-title">
          <Mountain size={18} style={{ color: "#f97316" }} />
          <span>Analyse des Montées — {climbs.length} segment{climbs.length > 1 ? "s" : ""}</span>
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "0.82rem", color: "var(--text-tertiary)" }}>
            {(totalDist / 1000).toFixed(1)} km · D+ {totalGain} m
          </span>
          <ChevronDown size={16} style={{ color: "var(--text-tertiary)", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }} />
        </div>
      </div>

      {open && <>{/* Category summary cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${presentCategories.length}, 1fr)`,
        gap: "0.85rem",
        marginBottom: "1.25rem",
      }}>
        {presentCategories.map(cat => {
          const s = stats.get(cat)!;
          const def = CLIMB_CATEGORIES[cat];
          return (
            <div key={cat} style={{
              border: `1px solid ${def.color}44`,
              borderRadius: "var(--radius-md)",
              padding: "0.85rem 1rem",
              background: `${def.color}0d`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  backgroundColor: def.color, flexShrink: 0,
                }} />
                <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                  {def.label}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                  {def.minGrade}–{def.maxGrade === Infinity ? "∞" : def.maxGrade}%
                </span>
              </div>
              <div style={{
                fontFamily: "var(--font-heading)", fontWeight: 800,
                fontSize: "1.6rem", color: def.color, lineHeight: 1.1,
              }}>
                {s.count}
                <span style={{ fontSize: "0.85rem", fontWeight: 600, marginLeft: "4px", color: "var(--text-secondary)" }}>
                  {s.count > 1 ? "segments" : "segment"}
                </span>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.3rem" }}>
                {(s.totalDist / 1000).toFixed(1)} km · D+ {s.totalElevGain} m
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                Pente moy. {s.avgGrade.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed table */}
      <div className="splits-table-container">
        <table className="splits-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Type</th>
              <th>Distance</th>
              <th>D+</th>
              <th>Pente moy.</th>
              <th>Pente max</th>
              <th>Durée</th>
              <th>Allure</th>
              <th>VAM</th>
              {hasHR && <th style={{ color: "var(--color-hr)" }}>FC moy.</th>}
            </tr>
          </thead>
          <tbody>
            {climbs.map((c, i) => {
              const def = CLIMB_CATEGORIES[c.category];
              return (
                <tr
                  key={i}
                  style={{ cursor: "pointer" }}
                  title="Cliquer pour voir sur la carte"
                  onClick={() => setSelectedClimb({ climb: c, index: i })}
                >
                  <td style={{ fontWeight: 700, color: "var(--text-secondary)" }}>{i + 1}</td>
                  <td>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: "0.35rem",
                      fontSize: "0.78rem", fontWeight: 700,
                      padding: "0.15rem 0.5rem", borderRadius: "var(--radius-full)",
                      border: `1px solid ${def.color}55`,
                      backgroundColor: `${def.color}12`,
                      color: def.color, whiteSpace: "nowrap",
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: def.color, flexShrink: 0 }} />
                      {def.label}
                    </span>
                  </td>
                  <td className="numeric">
                    {c.distance >= 1000
                      ? `${(c.distance / 1000).toFixed(2)} km`
                      : `${c.distance} m`}
                  </td>
                  <td className="numeric" style={{ color: "var(--color-ele)", fontWeight: 600 }}>
                    +{c.elevGain} m
                  </td>
                  <td className="numeric" style={{ color: def.color, fontWeight: 700 }}>
                    {c.avgGrade.toFixed(1)}%
                  </td>
                  <td className="numeric" style={{ color: "var(--text-secondary)" }}>
                    {c.maxGrade.toFixed(1)}%
                  </td>
                  <td className="numeric">{c.duration > 0 ? formatDuration(c.duration) : "—"}</td>
                  <td className="numeric" style={{ fontWeight: 600 }}>
                    {c.avgPace > 0 ? formatPace(c.avgPace) + " /km" : "—"}
                  </td>
                  <td className="numeric" style={{ color: "#a78bfa", fontWeight: 600 }}>
                    {c.vam > 0 ? `${c.vam} m/h` : "—"}
                  </td>
                  {hasHR && (
                    <td className="numeric" style={{ color: "var(--color-hr)" }}>
                      {c.avgHR ?? "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </>}

      {selectedClimb && (
        <ClimbMapModal
          climb={selectedClimb.climb}
          climbIndex={selectedClimb.index}
          points={points}
          onClose={() => setSelectedClimb(null)}
        />
      )}
    </div>
  );
};
