import React, { useMemo, useState } from "react";
import { Repeat2, Loader2, ChevronDown, ChevronUp, RefreshCw, TrendingDown, TrendingUp, Star } from "lucide-react";
import type { GPXActivity } from "../utils/gpxCore";
import type { ActivityIndexEntry } from "../utils/driveStorage";
import { useFullRouteMatches, type RouteMatch } from "../hooks/useFullRouteMatches";
import { formatDuration, formatPace } from "../utils/format";
import { computeEfficiencyTrend, type EfficiencyTrendPoint } from "../utils/trainingMetrics";

interface RouteHistoryProps {
  activity: GPXActivity;
  displayName: string;
  history: ActivityIndexEntry[];
  loadFile: (entry: ActivityIndexEntry) => Promise<ArrayBuffer | string>;
  onOpenActivity: (entry: ActivityIndexEntry) => Promise<void>;
  updateActivityMetaBatch: (items: { entry: ActivityIndexEntry; updates: Partial<ActivityIndexEntry> }[]) => Promise<void>;
  fcMax: number;
  fcRest: number;
}

const MEDALS = ["🥇", "🥈", "🥉"];

interface RowProps {
  match: RouteMatch;
  rank: number;
  displayName: string;
  activityType: GPXActivity['activityType'];
  onOpen: () => void;
  opening: boolean;
  efficiency: EfficiencyTrendPoint | undefined;
  showEfficiency: boolean;
  isBestEfficiency: boolean;
  hasGAP: boolean;
}

function Row({ match, rank, displayName, activityType, onOpen, opening, efficiency, showEfficiency, isBestEfficiency, hasGAP }: RowProps) {
  const { attempt } = match;
  const clickable = !attempt.isCurrent;
  return (
    <tr
      onClick={clickable ? onOpen : undefined}
      title={clickable ? "Cliquer pour ouvrir cette activité" : undefined}
      style={{
        borderBottom: "1px solid var(--border-color)",
        cursor: clickable ? "pointer" : "default",
        background: attempt.isCurrent ? "rgba(37,99,235,0.07)" : undefined,
        opacity: opening ? 0.6 : 1,
      }}
    >
      <td style={{ padding: "0.45rem 0.75rem", fontWeight: 700, fontSize: "0.82rem", color: "var(--text-tertiary)" }}>
        {MEDALS[rank - 1] ?? `#${rank}`}
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", fontWeight: 600, maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {attempt.isCurrent ? displayName : match.entry?.name ?? "—"}
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem" }}>
        {new Date(attempt.date).toLocaleDateString("fr-FR")}
        {attempt.isCurrent && <span style={{ color: "var(--accent-primary)", fontWeight: 600 }}> (actuelle)</span>}
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem" }}>
        {(attempt.distance / 1000).toFixed(1)} km
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", fontWeight: 600 }}>
        {formatDuration(Math.round(attempt.duration))}
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", color: "var(--color-speed)" }}>
        {activityType === "cycling" ? `${attempt.avgSpeed.toFixed(1)} km/h` : `${formatPace(attempt.avgPace)} /km`}
      </td>
      {hasGAP && (
        <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", color: "#a78bfa" }}>
          {attempt.avgGAP != null ? `${formatPace(attempt.avgGAP)} /km` : "—"}
        </td>
      )}
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem" }}>
        {attempt.elevGain > 0 ? `+${Math.round(attempt.elevGain)} m` : "—"}
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", color: "var(--color-hr)" }}>
        {attempt.avgHR !== null ? `${attempt.avgHR} bpm` : "—"}
      </td>
      {showEfficiency && (
        <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", color: "#a78bfa" }}>
          {efficiency?.pace != null ? (
            <span
              title={isBestEfficiency ? "Meilleure allure d'efficacité sur ce trajet" : undefined}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: isBestEfficiency ? 700 : 400 }}
            >
              {isBestEfficiency && <Star size={12} fill="#f59e0b" style={{ color: "#f59e0b" }} />}
              {formatPace(efficiency.pace)} /km
              {efficiency.trend === "down" && <TrendingDown size={12} style={{ color: "#22c55e" }} />}
              {efficiency.trend === "up" && <TrendingUp size={12} style={{ color: "#ef4444" }} />}
            </span>
          ) : "—"}
        </td>
      )}
      <td style={{ padding: "0.45rem 0.75rem" }}>
        {opening && <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />}
      </td>
    </tr>
  );
}

/**
 * Détection automatique et silencieuse : si l'activité ouverte suit le même trajet complet qu'une
 * ou plusieurs activités passées (pas juste un tronçon partagé, voir matchFullRoute dans
 * utils/segments.ts), affiche un classement de toutes les sorties sur ce parcours. N'affiche rien
 * si aucune correspondance n'est trouvée — pas de bouton, pas d'état vide visible. Un panneau de
 * diagnostic (repliable) liste les candidates plausibles écartées, utile tant que le réglage des
 * seuils de matching est encore en rodage.
 */
export const RouteHistory: React.FC<RouteHistoryProps> = ({ activity, displayName, history, loadFile, onOpenActivity, updateActivityMetaBatch, fcMax, fcRest }) => {
  const { status, progress, matches, rejected, fromCache, scannedAt, rescan } = useFullRouteMatches(activity, history, loadFile, updateActivityMetaBatch);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  const efficiencies = useMemo(
    () => computeEfficiencyTrend(
      matches.map(m => ({ date: m.attempt.date, avgPace: m.attempt.avgPace, avgGAP: m.attempt.avgGAP, avgHR: m.attempt.avgHR, fcMax: m.entry?.fcMax, fcRest: m.entry?.fcRest })),
      activity.activityType, fcMax, fcRest,
    ),
    [matches, activity.activityType, fcMax, fcRest]
  );
  const showEfficiency = [...efficiencies.values()].some(e => e.pace !== null);
  const hasGAP = activity.activityType === 'running' && matches.some(m => m.attempt.avgGAP !== null);
  // Index (dans `matches`) de la meilleure allure d'efficacité — mis en avant dans le tableau.
  const bestEfficiencyIdx = [...efficiencies.entries()].reduce<number | null>((best, [idx, e]) => {
    if (e.pace === null) return best;
    if (best === null || e.pace < efficiencies.get(best)!.pace!) return idx;
    return best;
  }, null);

  const handleOpen = async (entry: ActivityIndexEntry, key: string) => {
    setOpeningKey(key);
    try {
      await onOpenActivity(entry);
    } catch {
      alert("Impossible de charger cette activité.");
    } finally {
      setOpeningKey(null);
    }
  };

  if (matches.length === 0 && rejected.length === 0 && status !== 'scanning') return null;

  return (
    <div className="card animate-slide-up" style={{ marginTop: "1rem" }}>
      <div className="panel-header">
        <h3 className="panel-title">
          <Repeat2 size={18} style={{ color: "#f472b6" }} />
          <span>Ton parcours habituel</span>
          {matches.length > 0 && (
            <span style={{ fontSize: "0.82rem", fontWeight: 400, color: "var(--text-secondary)", marginLeft: "0.5rem" }}>
              — {matches.length} sortie{matches.length > 1 ? "s" : ""}
            </span>
          )}
        </h3>
        {matches.length > 0 && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={rescan}
            disabled={status === "scanning"}
            title="Relancer une comparaison complète de tout l'historique"
            style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }}
          >
            {status === "scanning" ? (
              <>
                <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
                <span>{progress && progress.total > 0 ? `${progress.done}/${progress.total}` : "Actualiser"}</span>
              </>
            ) : (
              <>
                <RefreshCw size={13} />
                <span>Actualiser</span>
              </>
            )}
          </button>
        )}
      </div>

      {status === "scanning" && matches.length === 0 && (
        <p style={{ fontSize: "0.82rem", color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} />
          Recherche de trajets similaires dans l'historique…
          {progress && progress.total > 0 && ` (${progress.done}/${progress.total})`}
        </p>
      )}

      {matches.length > 0 && (
        <>
          <p style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", marginBottom: "0.6rem" }}>
            Ces activités suivent sensiblement le même trajet complet que celle-ci. Clique sur une ligne pour l'ouvrir.
            {fromCache && scannedAt && (
              <> {" "}Classement en cache — dernière comparaison complète le {new Date(scannedAt).toLocaleDateString("fr-FR")}.</>
            )}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)", background: "var(--bg-primary)" }}>
                  {(["Rang", "Nom", "Date", "Distance", "Temps", activity.activityType === "cycling" ? "Vitesse" : "Allure"] as string[])
                    .concat(hasGAP ? ["GAP"] : [])
                    .concat(["D+", "FC moy."])
                    .concat(showEfficiency ? ["Efficacité"] : [])
                    .concat([""])
                    .map(h => (
                      <th key={h} style={{ padding: "0.4rem 0.75rem", textAlign: "left", fontWeight: 600, fontSize: "0.78rem", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}
                        title={
                          h === "Efficacité" ? "Allure d'efficacité — ton allure ramenée à un effort cardiaque de référence (65% de réserve FC). Une FC plus basse à vitesse égale, ou une vitesse plus haute à FC égale, donne toujours une meilleure allure d'efficacité. Baisse dans le temps = tu deviens plus efficace."
                          : h === "GAP" ? "Allure ajustée à la pente (GAP, modèle Minetti) — équivalent plat à effort égal, crédite l'effort si le trajet grimpe"
                          : undefined
                        }
                      >
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => {
                  const key = m.entry?.date ?? `current-${i}`;
                  return (
                    <Row key={i} match={m} rank={i + 1} displayName={displayName} activityType={activity.activityType}
                      onOpen={() => m.entry && handleOpen(m.entry, key)}
                      opening={openingKey === key}
                      efficiency={efficiencies.get(i)}
                      showEfficiency={showEfficiency}
                      isBestEfficiency={i === bestEfficiencyIdx}
                      hasGAP={hasGAP}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rejected.length > 0 && (
        <div style={{ marginTop: matches.length > 0 ? "0.75rem" : 0 }}>
          <button type="button" onClick={() => setShowDiagnostic(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: "0.3rem", background: "none", border: "none",
              cursor: "pointer", color: "var(--text-tertiary)", fontSize: "0.75rem", padding: 0,
            }}>
            {showDiagnostic ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {rejected.length} activité{rejected.length > 1 ? "s" : ""} plausible{rejected.length > 1 ? "s" : ""} mais écartée{rejected.length > 1 ? "s" : ""} (diagnostic)
          </button>
          {showDiagnostic && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
              {rejected.map((r, i) => (
                <div key={i} style={{ padding: "0.3rem 0", borderTop: i > 0 ? "1px solid var(--border-color)" : undefined }}>
                  <strong style={{ color: "var(--text-secondary)" }}>{r.name}</strong>
                  {" · "}{new Date(r.date).toLocaleDateString("fr-FR")}
                  {" — "}
                  {r.found
                    ? `recouvrement trouvé mais insuffisant (${Math.round(r.coverageCurrent * 100)}% / ${Math.round(r.coverageCandidate * 100)}%, seuil 70%)`
                    : "aucun corridor commun détecté (bruit GPS ou trajet réellement différent)"}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
