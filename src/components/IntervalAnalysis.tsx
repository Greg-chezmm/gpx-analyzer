import React, { useState } from "react";
import { Zap, AlertTriangle, Heart, Gauge, ChevronDown, Watch, TrendingUp, RotateCcw, Combine, Undo2, X, ListChecks } from "lucide-react";
import type { GPXInterval } from "../utils/gpxParser";
import type { GPXTrackPoint } from "../utils/gpxParser";
import type { WorkoutMatchResult } from "../utils/workoutStructure";
import { formatDuration, formatPace } from "../utils/format";
import { IntervalMapModal } from "./IntervalMapModal";

interface IntervalAnalysisProps {
  intervals: GPXInterval[];
  activityType: "running" | "cycling" | "unknown";
  points: GPXTrackPoint[];
  source?: "fit" | "detected";
  /** Bascule manuellement le type d'un lap (effort ↔ récup) — utile quand un lap montre manuel est mal classé. */
  onToggleType?: (number: number, currentType: "effort" | "recovery") => void;
  /** Fusionne une sélection de laps consécutifs (numéros de lap, dans l'ordre chronologique) en un seul. */
  onMergeSelection?: (numbers: number[]) => void;
  /** Applique une structure d'entraînement cible (texte libre, ex. "800m 1000m 1200m 1000m 800m r200m"). */
  onDetectStructure?: (structureText: string) => WorkoutMatchResult | { error: string };
  /** Annule la dernière correction de lap (type ou fusion) ; absent/undefined si rien à annuler. */
  onUndo?: () => void;
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
  onToggleType,
  onMergeSelection,
  onDetectStructure,
  onUndo,
}) => {
  const [open, setOpen] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState<GPXInterval | null>(null);
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<number>>(new Set());
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [structurePanelOpen, setStructurePanelOpen] = useState(false);
  const [structureText, setStructureText] = useState("");
  const [structureResult, setStructureResult] = useState<WorkoutMatchResult | { error: string } | null>(null);

  const handleApplyStructure = () => {
    if (!onDetectStructure || !structureText.trim()) return;
    setStructureResult(onDetectStructure(structureText));
  };

  const exitMergeMode = () => {
    setMergeMode(false);
    setSelectedForMerge(new Set());
    setMergeError(null);
  };

  const toggleMergeSelection = (number: number) => {
    setMergeError(null);
    setSelectedForMerge(prev => {
      const next = new Set(prev);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  };

  const handleConfirmMerge = () => {
    const positions = intervals
      .map((iv, idx) => ({ iv, idx }))
      .filter(({ iv }) => selectedForMerge.has(iv.number));
    if (positions.length < 2) return;
    const isContiguous = positions.every(({ idx }, i) => i === 0 || idx === positions[i - 1].idx + 1);
    if (!isContiguous) {
      setMergeError("Les laps sélectionnés doivent être consécutifs (sans lap non coché entre eux).");
      return;
    }
    onMergeSelection?.(positions.map(({ iv }) => iv.number));
    exitMergeMode();
  };

  const effortIntervals   = intervals.filter((iv) => iv.type === "effort");
  const recoveryIntervals = intervals.filter((iv) => iv.type === "recovery");

  if (effortIntervals.length === 0) return null;

  const isCycling = activityType === "cycling";
  const cadenceUnit = isCycling ? "rpm" : "ppm";
  // Cadence GPX stockée en demi-pas/s pour la course ; on multiplie par 2 pour obtenir ppm.
  const cadenceDisplay = (raw: number) => (isCycling ? raw : raw * 2);

  const hasHeartRate = intervals.some((iv) => iv.avgHeartRate !== null);
  const hasCadence   = intervals.some((iv) => iv.avgCadence !== null);
  const hasPower     = intervals.some((iv) => iv.avgPower != null);
  const hasElevation = intervals.some((iv) => (iv.totalAscent ?? 0) > 0 || (iv.totalDescent ?? 0) > 0);
  const hasGAP       = !isCycling && intervals.some((iv) => iv.avgGAP !== null);

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
        {onDetectStructure && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setStructurePanelOpen(o => !o); }}
            title="Reconstruire les répétitions à partir d'une structure d'entraînement cible"
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.35rem",
              padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)",
              background: structurePanelOpen ? "color-mix(in srgb, var(--accent-primary) 10%, transparent)" : "transparent",
              border: `1px solid ${structurePanelOpen ? "var(--accent-primary)" : "var(--border-color)"}`,
              color: structurePanelOpen ? "var(--accent-primary)" : "var(--text-secondary)",
              fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
            }}
          >
            <ListChecks size={12} /> Structure d'entraînement
          </button>
        )}
        {onMergeSelection && !mergeMode && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMergeMode(true); }}
            title="Sélectionner des laps consécutifs à fusionner"
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.35rem",
              padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)",
              background: "transparent", border: "1px solid var(--border-color)",
              color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Combine size={12} /> Fusionner des laps
          </button>
        )}
        {mergeMode && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); exitMergeMode(); }}
            title="Annuler la sélection"
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.35rem",
              padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)",
              background: "transparent", border: "1px solid var(--border-color)",
              color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <X size={12} /> Quitter la sélection
          </button>
        )}
        {onUndo && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onUndo(); }}
            title="Annuler la dernière correction de lap"
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.35rem",
              padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)",
              background: "transparent", border: "1px solid var(--border-color)",
              color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Undo2 size={12} /> Annuler
          </button>
        )}
        <ChevronDown size={16} style={{ color: "var(--text-tertiary)", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none", marginLeft: (onUndo || onMergeSelection || onDetectStructure) ? undefined : "auto" }} />
      </div>

      {open && <>
        {structurePanelOpen && onDetectStructure && (
          <div style={{
            marginBottom: "1.25rem", padding: "0.75rem 1rem",
            background: "var(--bg-primary)", borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-color)",
          }}>
            <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 0.5rem" }}>
              Entre la structure prévue (distances en mètres ou km, préfixe <code>r</code> pour une récup) —
              ex. <code>800m 1000m 1200m 1000m 800m r200m</code> fusionnera automatiquement les laps bruts
              pour s'approcher de chaque distance, avec une récup de 200 m entre chaque répétition.
              La recherche part du tout premier lap de la séance : si tu as un échauffement avant les
              répétitions, ajoute sa distance approximative en premier segment (ex. <code>3500m 800m r200m …</code>).
              Ça remplace les corrections manuelles en cours ; tu peux toujours ajuster ensuite.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <input
                type="text"
                value={structureText}
                onChange={(e) => setStructureText(e.target.value)}
                placeholder="800m 1000m 1200m 1000m 800m r200m"
                style={{
                  flex: "1 1 280px", padding: "0.45rem 0.7rem", borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-color)", fontSize: "0.85rem",
                  background: "var(--bg-secondary)", color: "var(--text-primary)",
                }}
              />
              <button
                type="button"
                onClick={handleApplyStructure}
                disabled={!structureText.trim()}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.4rem",
                  padding: "0.45rem 0.9rem", borderRadius: "var(--radius-full)",
                  border: "none", fontWeight: 700, fontSize: "0.85rem",
                  background: structureText.trim() ? "var(--accent-primary)" : "var(--border-color)",
                  color: structureText.trim() ? "white" : "var(--text-tertiary)",
                  cursor: structureText.trim() ? "pointer" : "default",
                }}
              >
                <ListChecks size={14} /> Appliquer
              </button>
            </div>

            {structureResult && 'error' in structureResult && (
              <p style={{ fontSize: "0.82rem", color: "var(--color-hr)", fontWeight: 600, margin: "0.6rem 0 0" }}>
                {structureResult.error}
              </p>
            )}
            {structureResult && 'summary' in structureResult && (
              <div style={{ marginTop: "0.6rem", fontSize: "0.82rem" }}>
                {!structureResult.fullyMatched && (
                  <p style={{ color: "#c2410c", fontWeight: 600, margin: "0 0 0.4rem" }}>
                    Il y a moins de laps que de segments demandés — la fin de la structure n'a pas pu être appliquée.
                  </p>
                )}
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {structureResult.summary.map((s, i) => (
                      <tr key={i}>
                        <td style={{ padding: "0.15rem 0.5rem 0.15rem 0", color: s.type === "effort" ? "#f97316" : "#3b82f6", fontWeight: 700 }}>
                          lap #{s.firstNumber}
                        </td>
                        <td style={{ padding: "0.15rem 0.5rem", color: "var(--text-secondary)" }}>
                          {s.type === "effort" ? "effort" : "récup"} cible {s.target >= 1000 ? `${(s.target / 1000).toFixed(2)} km` : `${s.target} m`}
                        </td>
                        <td style={{ padding: "0.15rem 0", color: "var(--text-primary)", fontWeight: 600 }}>
                          → {Math.round(s.matched)} m ({s.lapCount} lap{s.lapCount > 1 ? "s" : ""} fusionné{s.lapCount > 1 ? "s" : ""})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Résumé global des efforts */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: "1rem",
          marginBottom: "1.25rem", padding: "0.75rem 1rem",
          background: "var(--bg-primary)", borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-color)", fontSize: "0.88rem",
          color: "var(--text-secondary)", fontWeight: 500,
        }}>
          <span><strong style={{ color: "var(--text-primary)" }}>{effortIntervals.length}</strong> effort{effortIntervals.length > 1 ? "s" : ""}</span>
          {recoveryIntervals.length > 0 && (
            <span><strong style={{ color: "var(--text-primary)" }}>{recoveryIntervals.length}</strong> récup{recoveryIntervals.length > 1 ? "s" : ""}</span>
          )}
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

        {onToggleType && !mergeMode && (
          <p style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", margin: "0 0 0.5rem" }}>
            Lap mal classé (ex. lap manuel sur la montre) ? Cliquez sur l'icône <Zap size={11} style={{ verticalAlign: "-1px" }} />/<RotateCcw size={11} style={{ verticalAlign: "-1px" }} /> d'une ligne pour basculer effort ↔ récupération
            {onMergeSelection && <> ou utilisez « Fusionner des laps » ci-dessus pour regrouper plusieurs laps consécutifs coupés par erreur</>}.
            {" "}Une erreur ? Le bouton « Annuler » (visible après une première correction) revient en arrière.
          </p>
        )}
        {mergeMode && (
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 0.5rem", fontWeight: 600 }}>
            Cochez les laps consécutifs à regrouper (ex. un rep + sa récup coupés en plusieurs morceaux), puis validez avec le bouton en bas du tableau.
          </p>
        )}
        {mergeError && (
          <p style={{ fontSize: "0.78rem", color: "var(--color-hr)", margin: "0 0 0.5rem", fontWeight: 600 }}>
            {mergeError}
          </p>
        )}

        {/* Tableau détaillé par répétition */}
        <div style={{ overflowX: "auto", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
          <table className="splits-table">
            <thead>
              <tr>
                <th style={{ width: "44px" }}>#</th>
                <th>Durée</th>
                <th>Distance</th>
                <th><span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><Zap size={13} /> Allure</span></th>
                {hasGAP && (
                  <th title="Allure ajustée à la pente (GAP, modèle Minetti) — équivalent plat à effort égal, crédite l'effort si le fractionné grimpe">GAP</th>
                )}
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
                {mergeMode && <th style={{ width: "32px" }} />}
              </tr>
            </thead>
            <tbody>
              {intervals.map((iv) => {
                const isEffort = iv.type === "effort";
                const accent = isEffort ? "#f97316" : "#3b82f6";
                const isChecked = selectedForMerge.has(iv.number);
                return (
                <tr
                  key={`${iv.type}-${iv.number}`}
                  onClick={() => mergeMode ? toggleMergeSelection(iv.number) : setSelectedInterval(iv)}
                  style={{
                    background: isChecked ? "color-mix(in srgb, var(--accent-primary) 14%, transparent)" : (isEffort ? "#fffbeb" : "#eff6ff"),
                    borderLeft: `3px solid ${accent}`,
                    cursor: "pointer",
                  }}
                  title={mergeMode ? "Cliquer pour (dé)sélectionner" : `Cliquer pour voir sur la carte (${isEffort ? "effort" : "récupération"})`}
                >
                  <td style={{ fontWeight: 700, color: accent, borderLeft: `3px solid ${accent}` }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                      {onToggleType ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onToggleType(iv.number, iv.type); }}
                          title={`Marquer comme ${isEffort ? "récupération" : "effort"}`}
                          style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: "20px", height: "20px", padding: 0, border: "none",
                            borderRadius: "var(--radius-full)", background: "transparent",
                            color: accent, cursor: "pointer",
                          }}
                        >
                          {isEffort ? <Zap size={12} /> : <RotateCcw size={12} />}
                        </button>
                      ) : (
                        isEffort ? <Zap size={12} /> : <RotateCcw size={12} />
                      )}
                      {iv.number}
                    </span>
                  </td>
                  <td className="numeric">{formatDuration(iv.duration)}</td>
                  <td className="numeric">
                    {iv.distance >= 1000 ? `${(iv.distance / 1000).toFixed(2)} km` : `${Math.round(iv.distance)} m`}
                  </td>
                  <td className="numeric" style={{ fontWeight: 600, color: accent }}>
                    {formatPace(iv.avgPace)}
                  </td>
                  {hasGAP && (
                    <td className="numeric" style={{ color: "#a78bfa" }}>
                      {iv.avgGAP !== null ? formatPace(iv.avgGAP) : "—"}
                    </td>
                  )}
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
                  {mergeMode && (
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleMergeSelection(iv.number)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: "16px", height: "16px", cursor: "pointer" }}
                      />
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {mergeMode && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: "0.75rem", marginTop: "0.75rem", padding: "0.6rem 0.9rem",
            background: "var(--bg-primary)", borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-color)",
          }}>
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>
              {selectedForMerge.size} lap{selectedForMerge.size > 1 ? "s" : ""} sélectionné{selectedForMerge.size > 1 ? "s" : ""}
            </span>
            <button
              type="button"
              disabled={selectedForMerge.size < 2}
              onClick={handleConfirmMerge}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                padding: "0.45rem 0.9rem", borderRadius: "var(--radius-full)",
                border: "none", fontWeight: 700, fontSize: "0.85rem",
                background: selectedForMerge.size < 2 ? "var(--border-color)" : "var(--accent-primary)",
                color: selectedForMerge.size < 2 ? "var(--text-tertiary)" : "white",
                cursor: selectedForMerge.size < 2 ? "default" : "pointer",
              }}
            >
              <Combine size={14} /> Fusionner ({selectedForMerge.size} sélectionné{selectedForMerge.size > 1 ? "s" : ""})
            </button>
          </div>
        )}
      </>}

      {selectedInterval && (
        <IntervalMapModal
          interval={selectedInterval}
          points={points}
          onClose={() => setSelectedInterval(null)}
        />
      )}
    </div>
  );
};
