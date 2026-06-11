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

/** Statistiques agrégées par catégorie de montée (modérée / raide / très raide). */
interface CategoryStats {
  count: number;
  totalDist: number;
  totalElevGain: number;
  avgGrade: number;
  avgPace: number;
  avgHR: number | null;
  bestVam: number;
}

/** Ordre d'affichage des catégories, du plus doux au plus raide. */
const CATEGORY_ORDER: ClimbCategory[] = ['moderate', 'steep', 'very_steep'];

/** Tableau des segments de montée détectés, avec résumé par catégorie et clic → carte. */
export const ClimbAnalysis: React.FC<ClimbAnalysisProps> = ({ climbs, points }) => {
  if (climbs.length === 0) return null;

  // Agrégation des statistiques par catégorie (moyenne pondérée par le nombre de segments)
  const stats = new Map<ClimbCategory, CategoryStats>();

  for (const climb of climbs) {
    const prev = stats.get(climb.category);
    if (!prev) {
      stats.set(climb.category, {
        count: 1,
        totalDist: climb.distance,
        totalElevGain: climb.elevGain,
        avgGrade: climb.avgGrade,
        avgPace: climb.avgPace,
        avgHR: climb.avgHR,
        bestVam: climb.vam,
      });
    } else {
      const newCount = prev.count + 1;
      stats.set(climb.category, {
        count: newCount,
        totalDist: prev.totalDist + climb.distance,
        totalElevGain: prev.totalElevGain + climb.elevGain,
        avgGrade: (prev.avgGrade * prev.count + climb.avgGrade) / newCount,
        avgPace: prev.avgPace > 0 && climb.avgPace > 0
          ? (prev.avgPace * prev.count + climb.avgPace) / newCount
          : prev.avgPace || climb.avgPace,
        avgHR: prev.avgHR !== null && climb.avgHR !== null
          ? Math.round((prev.avgHR * prev.count + climb.avgHR) / newCount)
          : prev.avgHR ?? climb.avgHR,
        bestVam: Math.max(prev.bestVam, climb.vam),
      });
    }
  }

  const [open, setOpen] = useState(false);
  const [selectedClimb, setSelectedClimb] = useState<{ climb: ClimbSegment; index: number } | null>(null);

  const hasHR        = climbs.some(c => c.avgHR !== null);
  const totalGain    = climbs.reduce((sum, c) => sum + c.elevGain, 0);
  const totalDist    = climbs.reduce((sum, c) => sum + c.distance, 0);
  const presentCategories = CATEGORY_ORDER.filter(cat => stats.has(cat));

  return (
    <div className="card animate-slide-up">
      {/* En-tête cliquable — plie/déplie le panneau */}
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

      {open && <>
        {/* Cartes de résumé par catégorie */}
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${presentCategories.length}, 1fr)`,
          gap: "0.85rem",
          marginBottom: "1.25rem",
        }}>
          {presentCategories.map(cat => {
            const categoryStats = stats.get(cat)!;
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
                  {categoryStats.count}
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, marginLeft: "4px", color: "var(--text-secondary)" }}>
                    {categoryStats.count > 1 ? "segments" : "segment"}
                  </span>
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.3rem" }}>
                  {(categoryStats.totalDist / 1000).toFixed(1)} km · D+ {categoryStats.totalElevGain} m
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                  Pente moy. {categoryStats.avgGrade.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>

        {/* Tableau détaillé par segment */}
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
                {/* VAM = Vitesse Ascensionnelle Moyenne, en m/h — indicateur de forme en grimpée */}
                <th>VAM</th>
                {hasHR && <th style={{ color: "var(--color-hr)" }}>FC moy.</th>}
              </tr>
            </thead>
            <tbody>
              {climbs.map((climb, i) => {
                const def = CLIMB_CATEGORIES[climb.category];
                return (
                  <tr
                    key={i}
                    style={{ cursor: "pointer" }}
                    title="Cliquer pour voir sur la carte"
                    onClick={() => setSelectedClimb({ climb, index: i })}
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
                      {climb.distance >= 1000
                        ? `${(climb.distance / 1000).toFixed(2)} km`
                        : `${climb.distance} m`}
                    </td>
                    <td className="numeric" style={{ color: "var(--color-ele)", fontWeight: 600 }}>
                      +{climb.elevGain} m
                    </td>
                    <td className="numeric" style={{ color: def.color, fontWeight: 700 }}>
                      {climb.avgGrade.toFixed(1)}%
                    </td>
                    <td className="numeric" style={{ color: "var(--text-secondary)" }}>
                      {climb.maxGrade.toFixed(1)}%
                    </td>
                    <td className="numeric">{climb.duration > 0 ? formatDuration(climb.duration) : "—"}</td>
                    <td className="numeric" style={{ fontWeight: 600 }}>
                      {climb.avgPace > 0 ? formatPace(climb.avgPace) + " /km" : "—"}
                    </td>
                    <td className="numeric" style={{ color: "#a78bfa", fontWeight: 600 }}>
                      {climb.vam > 0 ? `${climb.vam} m/h` : "—"}
                    </td>
                    {hasHR && (
                      <td className="numeric" style={{ color: "var(--color-hr)" }}>
                        {climb.avgHR ?? "—"}
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
