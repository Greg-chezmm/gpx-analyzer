import React, { useState } from "react";
import type { GPXLap, GPXActivity, SuuntoSessionHeader } from "../utils/gpxParser";
import { formatDuration, formatPace } from "./SplitsTable";
import { Layers, CheckCircle, AlertCircle, Copy, Check, Brain, Clock, Flame, Zap } from "lucide-react";

interface LapTableProps {
  laps: GPXLap[];
  activity: GPXActivity;
  header: SuuntoSessionHeader | null;
}

const TYPE_STYLE: Record<GPXLap['intervalType'], { bg: string; border: string; label: string; dot: string }> = {
  Warmup:   { bg: "#f0f9ff", border: "#bae6fd", label: "Échauffement", dot: "#38bdf8" },
  Interval: { bg: "#fff7ed", border: "#fed7aa", label: "Effort",        dot: "#f97316" },
  Recovery: { bg: "#f0fdf4", border: "#bbf7d0", label: "Récupération",  dot: "#34d399" },
  Cooldown: { bg: "#f8fafc", border: "#e2e8f0", label: "Retour calme",  dot: "#94a3b8" },
};

const TE_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: "Maintien",          color: "#60a5fa" },
  2: { label: "Maintien +",        color: "#34d399" },
  3: { label: "Amélioration",      color: "#fbbf24" },
  4: { label: "Amélioration forte",color: "#f97316" },
  5: { label: "Surentraînement",   color: "#ef4444" },
};

function recoveryQuality(drop: number): { color: string; label: string } {
  if (drop >= 20) return { color: "#16a34a", label: `−${drop} bpm` };
  if (drop >= 10) return { color: "#d97706", label: `−${drop} bpm` };
  return          { color: "#dc2626",        label: `−${drop} bpm` };
}

function vamColor(mph: number): string {
  if (mph > 300) return "#f97316";
  if (mph >  60) return "#34d399";
  if (mph < -60) return "#60a5fa";
  return "var(--text-secondary)";
}

export const LapTable: React.FC<LapTableProps> = ({ laps, activity, header }) => {
  const [copied, setCopied] = useState(false);

  if (laps.length === 0) return null;

  const isCycling  = activity.activityType === 'cycling';
  const cadUnit    = isCycling ? "rpm" : "ppm";
  const cadDisplay = (raw: number) => isCycling ? raw : raw * 2;

  const intervals  = laps.filter(l => l.intervalType === 'Interval');
  const recoveries = laps.filter(l => l.intervalType === 'Recovery');
  const hasHR   = laps.some(l => l.avgHeartRate !== null);
  const hasCad  = laps.some(l => l.avgCadencePPM !== null);
  const hasPwr  = laps.some(l => l.avgPower !== null);
  const hasVS   = laps.some(l => l.avgVerticalSpeedMpm !== null);
  const hasKcal = laps.some(l => l.energyKcal !== null);
  const hasEle  = laps.some(l => l.elevationGain > 0 || l.elevationLoss > 0);

  // HR drop per recovery: preceding interval maxHR − this recovery minHR
  const hrDropMap = new Map<number, number | null>();
  for (let i = 0; i < laps.length; i++) {
    if (laps[i].intervalType !== 'Recovery') continue;
    let prevMax: number | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (laps[j].intervalType === 'Interval' && laps[j].maxHeartRate !== null) {
        prevMax = laps[j].maxHeartRate;
        break;
      }
    }
    const minHR = laps[i].minHeartRate;
    hrDropMap.set(i, prevMax !== null && minHR !== null ? prevMax - minHR : null);
  }

  // Cross-validation
  const windowsDist = Math.round(laps.reduce((s, l) => s + l.distance, 0));
  const windowsDur  = laps.reduce((s, l) => s + l.duration, 0);
  const gpxDist     = Math.round(activity.totalDistance);
  const gpxDur      = activity.totalDuration;
  const distDeltaPct = gpxDist > 0 ? Math.abs(windowsDist - gpxDist) / gpxDist * 100 : 0;
  const durDeltaPct  = gpxDur  > 0 ? Math.abs(windowsDur  - gpxDur)  / gpxDur  * 100 : 0;
  const isCoherent   = distDeltaPct < 8 && durDeltaPct < 8;

  const avgEffortPace = intervals.length > 0
    ? intervals.reduce((s, l) => s + l.avgPace, 0) / intervals.length : 0;
  const avgRecovPace = recoveries.length > 0
    ? recoveries.reduce((s, l) => s + l.avgPace, 0) / recoveries.length : 0;
  const avgEffortHR = intervals.length > 0 && hasHR
    ? Math.round(intervals.filter(l => l.avgHeartRate).reduce((s, l) => s + (l.avgHeartRate ?? 0), 0)
        / intervals.filter(l => l.avgHeartRate).length)
    : null;

  const handleCopyTable = () => {
    let tsv = "#\tType\tDurée\tDistance\tAllure";
    if (hasHR)   tsv += "\tFC moy. (bpm)\tFC max (bpm)";
    if (hasCad)  tsv += `\tCadence (${cadUnit})`;
    if (hasPwr)  tsv += "\tPuissance (W)";
    if (hasEle)  tsv += "\tD+ (m)\tD- (m)";
    if (hasVS)   tsv += "\tVAM (m/h)";
    if (hasKcal) tsv += "\tCalories (kcal)";
    tsv += "\n";

    for (const lap of laps) {
      const dist = lap.distance >= 1000
        ? `${(lap.distance / 1000).toFixed(2)} km`
        : `${Math.round(lap.distance)} m`;
      tsv += `${lap.number}\t${TYPE_STYLE[lap.intervalType].label}\t`;
      tsv += `${formatDuration(lap.duration)}\t${dist}\t`;
      tsv += lap.avgSpeed > 0 ? formatPace(lap.avgPace) : "";
      if (hasHR)   tsv += `\t${lap.avgHeartRate ?? ""}\t${lap.maxHeartRate ?? ""}`;
      if (hasCad)  tsv += `\t${lap.avgCadencePPM != null ? cadDisplay(lap.avgCadencePPM) : ""}`;
      if (hasPwr)  tsv += `\t${lap.avgPower ?? ""}`;
      if (hasEle)  tsv += `\t${lap.elevationGain > 0 ? lap.elevationGain : ""}\t${lap.elevationLoss > 0 ? lap.elevationLoss : ""}`;
      if (hasVS)   tsv += `\t${lap.avgVerticalSpeedMpm != null ? Math.round(lap.avgVerticalSpeedMpm * 60) : ""}`;
      if (hasKcal) tsv += `\t${lap.energyKcal ?? ""}`;
      tsv += "\n";
    }

    navigator.clipboard.writeText(tsv)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(err => console.error("Erreur lors de la copie :", err));
  };

  const teInfo = header?.trainingEffect != null
    ? TE_LABEL[Math.round(header.trainingEffect)] ?? null
    : null;

  return (
    <div className="card animate-slide-up">
      <div className="panel-header" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <h3 className="panel-title">
          <Layers size={18} style={{ color: "var(--color-time)" }} />
          <span>🏃 Séance par Intervalles — {intervals.length} répétition{intervals.length > 1 ? 's' : ''}</span>
        </h3>
        <div style={{
          display: "flex", alignItems: "center", gap: "0.4rem",
          padding: "0.3rem 0.75rem", borderRadius: "var(--radius-full)",
          backgroundColor: isCoherent ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${isCoherent ? "#bbf7d0" : "#fecaca"}`,
          fontSize: "0.78rem", fontWeight: 600,
          color: isCoherent ? "#15803d" : "#dc2626",
        }}>
          {isCoherent
            ? <><CheckCircle size={13} /> Cohérent GPX ↔ JSON</>
            : <><AlertCircle size={13} /> Écart GPX ↔ JSON ({distDeltaPct.toFixed(0)}%)</>}
        </div>
        <div className="panel-actions">
          <button type="button" className="btn btn-outline" onClick={handleCopyTable}
            style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              padding: "0.4rem 0.85rem", fontSize: "0.82rem",
              borderColor: copied ? "var(--color-ele)" : "var(--border-color)",
              color: copied ? "var(--color-ele)" : "var(--text-primary)",
              backgroundColor: copied ? "var(--color-ele-light)" : "transparent",
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? "Tableau copié !" : "Copier (Excel/Sheets)"}</span>
          </button>
        </div>
      </div>

      {/* Suunto Header summary */}
      {header && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: "0.85rem",
          padding: "0.85rem 0",
          borderBottom: "1px solid var(--border-color)",
          marginBottom: "0.75rem",
        }}>
          {header.vo2max != null && (
            <div style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "0.45rem 0.85rem", borderRadius: "var(--radius-md)",
              border: "1px solid #a78bfa44", backgroundColor: "#a78bfa0d",
            }}>
              <Brain size={15} style={{ color: "#a78bfa" }} />
              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", fontWeight: 600, lineHeight: 1 }}>VO₂max estimé</div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.1rem", color: "#a78bfa", lineHeight: 1.2 }}>
                  {header.vo2max.toFixed(1)} <span style={{ fontSize: "0.7rem", fontWeight: 600 }}>mL/kg/min</span>
                </div>
              </div>
            </div>
          )}
          {teInfo && header.trainingEffect != null && (
            <div style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "0.45rem 0.85rem", borderRadius: "var(--radius-md)",
              border: `1px solid ${teInfo.color}44`, backgroundColor: `${teInfo.color}0d`,
            }}>
              <Zap size={15} style={{ color: teInfo.color }} />
              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", fontWeight: 600, lineHeight: 1 }}>Effet d'entraînement</div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.1rem", color: teInfo.color, lineHeight: 1.2 }}>
                  {header.trainingEffect.toFixed(1)} <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>— {teInfo.label}</span>
                </div>
              </div>
            </div>
          )}
          {header.recoveryTimeH != null && (
            <div style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "0.45rem 0.85rem", borderRadius: "var(--radius-md)",
              border: "1px solid #f9731644", backgroundColor: "#f973160d",
            }}>
              <Clock size={15} style={{ color: "#f97316" }} />
              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", fontWeight: 600, lineHeight: 1 }}>Récupération recommandée</div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.1rem", color: "#f97316", lineHeight: 1.2 }}>
                  {header.recoveryTimeH}h
                </div>
              </div>
            </div>
          )}
          {header.energyKcal != null && (
            <div style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "0.45rem 0.85rem", borderRadius: "var(--radius-md)",
              border: "1px solid #fbbf2444", backgroundColor: "#fbbf240d",
            }}>
              <Flame size={15} style={{ color: "#fbbf24" }} />
              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", fontWeight: 600, lineHeight: 1 }}>Énergie dépensée</div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.1rem", color: "#fbbf24", lineHeight: 1.2 }}>
                  {header.energyKcal} <span style={{ fontSize: "0.7rem", fontWeight: 600 }}>kcal</span>
                </div>
              </div>
            </div>
          )}
          {header.epoc != null && (
            <div style={{ padding: "0.45rem 0.85rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", fontWeight: 600, lineHeight: 1 }}>EPOC</div>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.2 }}>
                {header.epoc.toFixed(1)} <span style={{ fontSize: "0.7rem", fontWeight: 500 }}>mL/kg</span>
              </div>
            </div>
          )}
          {header.stepCount != null && (
            <div style={{ padding: "0.45rem 0.85rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", fontWeight: 600, lineHeight: 1 }}>Foulées</div>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.2 }}>
                {header.stepCount.toLocaleString("fr-FR")}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary row */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: "1rem",
        padding: "0.6rem 0 1rem",
        borderBottom: "1px solid var(--border-color)",
        marginBottom: "1rem", fontSize: "0.85rem",
      }}>
        {intervals.length > 0 && (
          <span>
            <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Effort :</span>
            {" "}<strong style={{ color: "#f97316" }}>{formatPace(avgEffortPace)} /km</strong>
          </span>
        )}
        {recoveries.length > 0 && (
          <span>
            <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Récup :</span>
            {" "}<strong style={{ color: "#34d399" }}>{formatPace(avgRecovPace)} /km</strong>
          </span>
        )}
        {avgEffortHR && (
          <span>
            <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>FC effort moy. :</span>
            {" "}<strong style={{ color: "var(--color-hr)" }}>{avgEffortHR} bpm</strong>
          </span>
        )}
        <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontSize: "0.78rem" }}>
          Windows : {(windowsDist / 1000).toFixed(2)} km / {formatDuration(windowsDur)}
          {" · "}GPX : {(gpxDist / 1000).toFixed(2)} km / {formatDuration(gpxDur)}
        </span>
      </div>

      <div className="splits-table-container">
        <table className="splits-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}>#</th>
              <th>Type</th>
              <th>Durée</th>
              <th>Distance</th>
              <th>Allure</th>
              {hasHR   && <th style={{ color: "var(--color-hr)" }}>FC</th>}
              {hasCad  && <th style={{ color: "var(--color-cad)" }}>Cadence</th>}
              {hasPwr  && <th style={{ color: "var(--accent-primary)" }}>Puissance</th>}
              {hasEle  && <th style={{ color: "var(--color-ele)" }}>D+</th>}
              {hasEle  && <th style={{ color: "#60a5fa" }}>D−</th>}
              {hasVS   && <th style={{ color: "#34d399" }}>VAM</th>}
              {hasKcal && <th style={{ color: "#fbbf24" }}>Calories</th>}
            </tr>
          </thead>
          <tbody>
            {laps.map((lap, i) => {
              const s    = TYPE_STYLE[lap.intervalType];
              const drop = lap.intervalType === 'Recovery' ? hrDropMap.get(i) ?? null : null;
              const rq   = drop !== null ? recoveryQuality(drop) : null;
              const vamMph = lap.avgVerticalSpeedMpm != null
                ? Math.round(lap.avgVerticalSpeedMpm * 60)
                : null;

              return (
                <tr key={lap.number} style={{ backgroundColor: s.bg }}>
                  <td style={{ fontWeight: 700, color: "var(--text-secondary)" }}>{lap.number}</td>
                  <td>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: "0.35rem",
                      fontSize: "0.78rem", fontWeight: 700,
                      padding: "0.15rem 0.5rem", borderRadius: "var(--radius-full)",
                      border: `1px solid ${s.border}`, backgroundColor: s.bg, color: s.dot,
                      whiteSpace: "nowrap",
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: s.dot, flexShrink: 0 }} />
                      {s.label}
                    </span>
                  </td>
                  <td className="numeric" style={{ fontWeight: 600 }}>
                    {formatDuration(lap.duration)}
                  </td>
                  <td className="numeric">
                    {lap.distance >= 1000
                      ? `${(lap.distance / 1000).toFixed(2)} km`
                      : `${Math.round(lap.distance)} m`}
                  </td>
                  <td className="numeric" style={{
                    fontWeight: 600,
                    color: lap.intervalType === 'Interval' ? "#f97316"
                         : lap.intervalType === 'Recovery' ? "#34d399"
                         : "var(--accent-secondary)",
                  }}>
                    {lap.avgSpeed > 0 ? formatPace(lap.avgPace) + " /km" : "—"}
                  </td>

                  {/* FC — moy + max + récup quality merged */}
                  {hasHR && (
                    <td className="numeric">
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                        <span style={{ color: "var(--color-hr)", fontWeight: 700, fontSize: "0.9rem" }}>
                          ⌀ {lap.avgHeartRate ?? "—"} <span style={{ fontWeight: 400, fontSize: "0.75rem" }}>bpm</span>
                        </span>
                        {lap.maxHeartRate != null && (
                          <span style={{ color: "var(--color-hr)", opacity: 0.65, fontSize: "0.78rem" }}>
                            ↑ {lap.maxHeartRate} bpm
                          </span>
                        )}
                        {rq && (
                          <span style={{
                            fontSize: "0.72rem", fontWeight: 700, color: rq.color,
                            padding: "0.1rem 0.35rem", borderRadius: "var(--radius-full)",
                            border: `1px solid ${rq.color}44`, backgroundColor: `${rq.color}12`,
                            whiteSpace: "nowrap", marginTop: "1px",
                          }}>
                            ↓ {rq.label}
                          </span>
                        )}
                      </div>
                    </td>
                  )}

                  {hasCad && (
                    <td className="numeric" style={{ color: "var(--color-cad)", fontWeight: 600 }}>
                      {lap.avgCadencePPM != null
                        ? `${cadDisplay(lap.avgCadencePPM)} ${cadUnit}`
                        : "—"}
                    </td>
                  )}
                  {hasPwr && (
                    <td className="numeric" style={{ color: "var(--accent-primary)", fontWeight: 600 }}>
                      {lap.avgPower != null ? `${lap.avgPower} W` : "—"}
                    </td>
                  )}
                  {hasEle && (
                    <td className="numeric" style={{ color: "var(--color-ele)", fontWeight: 600 }}>
                      {lap.elevationGain > 0 ? `+${lap.elevationGain} m` : "—"}
                    </td>
                  )}
                  {hasEle && (
                    <td className="numeric" style={{ color: "#60a5fa", fontWeight: 600 }}>
                      {lap.elevationLoss > 0 ? `−${lap.elevationLoss} m` : "—"}
                    </td>
                  )}
                  {hasVS && (
                    <td className="numeric" style={{
                      fontWeight: 600,
                      color: vamMph != null ? vamColor(vamMph) : "var(--text-secondary)",
                    }}>
                      {vamMph != null
                        ? `${vamMph > 0 ? "↑" : "↓"} ${Math.abs(vamMph)} m/h`
                        : "—"}
                    </td>
                  )}
                  {hasKcal && (
                    <td className="numeric" style={{ color: "#fbbf24", fontWeight: 600 }}>
                      {lap.energyKcal != null ? `${lap.energyKcal} kcal` : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
