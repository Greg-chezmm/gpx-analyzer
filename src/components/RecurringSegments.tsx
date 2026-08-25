import React, { useState } from "react";
import { Repeat2, ChevronDown, ChevronUp, Search, Loader2, Trophy } from "lucide-react";
import type { GPXActivity } from "../utils/gpxCore";
import type { ActivityIndexEntry } from "../utils/driveStorage";
import type { RecurringSegment, SegmentAttempt } from "../utils/segments";
import { useRecurringSegments } from "../hooks/useRecurringSegments";
import { formatDuration, formatPace } from "./SplitsTable";
import { SegmentMapModal } from "./SegmentMapModal";

interface RecurringSegmentsProps {
  activity: GPXActivity;
  history: ActivityIndexEntry[];
  loadFile: (entry: ActivityIndexEntry) => Promise<ArrayBuffer | string>;
}

interface AttemptRowProps {
  attempt: SegmentAttempt;
  rank: number;
  activityType: GPXActivity['activityType'];
  onClick: () => void;
}

function AttemptRow({ attempt, rank, activityType, onClick }: AttemptRowProps) {
  return (
    <tr
      onClick={onClick}
      title="Cliquer pour voir sur la carte"
      style={{
        borderBottom: "1px solid var(--border-color)",
        cursor: "pointer",
        background: attempt.isCurrent ? "rgba(37,99,235,0.07)" : undefined,
      }}
    >
      <td style={{ padding: "0.45rem 0.75rem", fontWeight: 700, fontSize: "0.82rem", color: rank === 1 ? "#f59e0b" : "var(--text-tertiary)" }}>
        {rank === 1 ? <Trophy size={14} /> : `#${rank}`}
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem" }}>
        {new Date(attempt.date).toLocaleDateString("fr-FR")}
        {attempt.isCurrent && <span style={{ color: "var(--accent-primary)", fontWeight: 600 }}> (actuelle)</span>}
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", fontWeight: 600 }}>
        {formatDuration(Math.round(attempt.duration))}
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", color: "var(--color-speed)" }}>
        {activityType === "cycling" ? `${attempt.avgSpeed.toFixed(1)} km/h` : `${formatPace(attempt.avgPace)} /km`}
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", color: "var(--color-hr)" }}>
        {attempt.avgHR !== null ? `${attempt.avgHR} bpm` : "—"}
      </td>
    </tr>
  );
}

interface SegmentCardProps {
  segment: RecurringSegment;
  activityType: GPXActivity['activityType'];
  onSelect: (attempt: SegmentAttempt) => void;
}

function SegmentCard({ segment, activityType, onSelect }: SegmentCardProps) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: "0.75rem" }}>
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
          {segment.distance >= 1000 ? `${(segment.distance / 1000).toFixed(2)} km` : `${Math.round(segment.distance)} m`}
          <span style={{ fontWeight: 400, color: "var(--text-secondary)", marginLeft: "0.5rem", fontSize: "0.82rem" }}>
            · D+ {Math.round(segment.elevGain)} m · {segment.attempts.length} passage{segment.attempts.length > 1 ? "s" : ""}
          </span>
        </span>
        {open ? <ChevronUp size={15} style={{ flexShrink: 0 }} /> : <ChevronDown size={15} style={{ flexShrink: 0 }} />}
      </button>

      {open && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-color)", background: "var(--bg-primary)" }}>
                {["Rang", "Date", "Temps", activityType === "cycling" ? "Vitesse" : "Allure", "FC moy."].map(h => (
                  <th key={h} style={{ padding: "0.4rem 0.75rem", textAlign: "left", fontWeight: 600, fontSize: "0.78rem", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {segment.attempts.map((a, i) => (
                <AttemptRow key={i} attempt={a} rank={i + 1} activityType={activityType} onClick={() => onSelect(a)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Compare l'activité courante à l'historique cloud pour repérer les tronçons de tracé déjà parcourus (type "segments" Strava), et suivre la progression dessus. */
export const RecurringSegments: React.FC<RecurringSegmentsProps> = ({ activity, history, loadFile }) => {
  const { status, progress, segments, skippedCount, scan } = useRecurringSegments(activity, history, loadFile);
  const [selected, setSelected] = useState<SegmentAttempt | null>(null);

  return (
    <div className="card animate-slide-up" style={{ marginTop: "1rem" }}>
      <div className="panel-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <h3 className="panel-title">
          <Repeat2 size={18} style={{ color: "var(--accent-primary)" }} />
          <span>Segments récurrents</span>
          {segments.length > 0 && (
            <span style={{ fontSize: "0.82rem", fontWeight: 400, color: "var(--text-secondary)", marginLeft: "0.5rem" }}>
              — {segments.length} détecté{segments.length > 1 ? "s" : ""}
            </span>
          )}
        </h3>
        <button
          type="button"
          className="btn btn-outline"
          onClick={scan}
          disabled={status === "scanning"}
          style={{ padding: "0.4rem 0.8rem", fontSize: "0.82rem" }}
        >
          {status === "scanning" ? (
            <>
              <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} />
              <span>Analyse{progress ? ` ${progress.done}/${progress.total}` : "…"}</span>
            </>
          ) : (
            <>
              <Search size={14} />
              <span>Analyser l'historique</span>
            </>
          )}
        </button>
      </div>

      {status === "idle" && (
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.75rem" }}>
          Compare cette activité aux précédentes pour repérer les portions de tracé déjà parcourues (même route ou sentier) et suivre ta progression dessus.
        </p>
      )}

      {status === "done" && segments.length === 0 && (
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.75rem" }}>
          Aucun segment récurrent détecté parmi les activités comparées.
        </p>
      )}

      {status === "done" && skippedCount > 0 && (
        <p style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", marginTop: "0.5rem" }}>
          {skippedCount} activité{skippedCount > 1 ? "s" : ""} de l'historique non comparée{skippedCount > 1 ? "s" : ""} cette fois (plafond par analyse) — relance si besoin.
        </p>
      )}

      {segments.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          {segments.map(s => (
            <SegmentCard key={s.id} segment={s} activityType={activity.activityType} onSelect={setSelected} />
          ))}
        </div>
      )}

      {selected && (
        <SegmentMapModal
          points={selected.points}
          startIndex={selected.startIndex}
          endIndex={selected.endIndex}
          segmentColor="#2563eb"
          icon={<Repeat2 size={18} style={{ color: "#2563eb" }} />}
          title={selected.isCurrent ? "Passage actuel" : new Date(selected.date).toLocaleDateString("fr-FR")}
          subtitle={`${formatDuration(Math.round(selected.duration))} · ${
            activity.activityType === "cycling" ? `${selected.avgSpeed.toFixed(1)} km/h` : `${formatPace(selected.avgPace)} /km`
          }`}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};
