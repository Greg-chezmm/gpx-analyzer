import React, { useState, useEffect, useRef } from "react";
import { Route, Plus, X, Search, RefreshCw, Loader2, Trophy, Trash2 } from "lucide-react";
import type { GPXActivity } from "../utils/gpxCore";
import type { ActivityIndexEntry } from "../utils/driveStorage";
import type { StoredSegment } from "../utils/firestoreStorage";
import type { CachedSegmentAttempt } from "../utils/segments";
import { buildSegmentGeometry } from "../utils/segments";
import type { StoredSegmentsHandle } from "../hooks/useStoredSegments";
import { useStoredSegmentScan } from "../hooks/useStoredSegmentScan";
import type { SegmentPickerHandle } from "../hooks/useSegmentPicker";
import { formatDuration, formatPace } from "./SplitsTable";
import { SegmentMapModal } from "./SegmentMapModal";

interface StoredSegmentsProps {
  activity: GPXActivity;
  history: ActivityIndexEntry[];
  loadFile: (entry: ActivityIndexEntry) => Promise<ArrayBuffer | string>;
  picker: SegmentPickerHandle;
  /** Levé au niveau App — partagé avec la mise à jour incrémentale du cache à chaque sauvegarde (voir App.tsx mergeIntoStoredSegments). */
  storedSegments: StoredSegmentsHandle;
}

interface AttemptRowProps {
  attempt: CachedSegmentAttempt;
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

interface StoredSegmentCardProps {
  segment: StoredSegment;
  activity: GPXActivity;
  history: ActivityIndexEntry[];
  loadFile: (entry: ActivityIndexEntry) => Promise<ArrayBuffer | string>;
  onDelete: () => void;
  onUpdateAttempts: (id: string, attempts: CachedSegmentAttempt[], lastFullScanAt?: string) => Promise<void>;
  onSelectAttempt: (attempt: CachedSegmentAttempt) => void;
}

function StoredSegmentCard({ segment, activity, history, loadFile, onDelete, onUpdateAttempts, onSelectAttempt }: StoredSegmentCardProps) {
  const { status, progress, attempts, skippedCount, scan } = useStoredSegmentScan(
    segment, activity, history, loadFile,
    top => { onUpdateAttempts(segment.id, top, new Date().toISOString()); },
  );
  const hasCache = (segment.attempts?.length ?? 0) > 0 || attempts.length > 0;

  // Segment tout juste créé (jamais scanné) — remplit le classement initial automatiquement,
  // une seule fois par segment, pour éviter un clic manuel en plus juste après la création.
  const autoScanned = useRef(false);
  useEffect(() => {
    if (segment.attempts === undefined && !autoScanned.current) {
      autoScanned.current = true;
      scan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment.id]);

  return (
    <div style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: "0.75rem" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap",
        padding: "0.75rem 1rem", background: "var(--bg-secondary)",
      }}>
        <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)", flex: 1, minWidth: "10rem" }}>
          {segment.name}
          <span style={{ fontWeight: 400, color: "var(--text-secondary)", marginLeft: "0.5rem", fontSize: "0.82rem" }}>
            · {segment.distance >= 1000 ? `${(segment.distance / 1000).toFixed(2)} km` : `${Math.round(segment.distance)} m`}
            {segment.elevGain > 0 && ` · D+ ${Math.round(segment.elevGain)} m`}
          </span>
        </span>
        <button
          type="button"
          className="btn btn-outline"
          onClick={scan}
          disabled={status === "scanning"}
          title={hasCache ? "Relancer une comparaison complète — le classement affiché est en cache depuis la dernière analyse" : "Comparer à l'historique"}
          style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem" }}
        >
          {status === "scanning" ? (
            <>
              <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
              <span>{progress ? `${progress.done}/${progress.total}` : "…"}</span>
            </>
          ) : hasCache ? (
            <>
              <RefreshCw size={13} />
              <span>Actualiser</span>
            </>
          ) : (
            <>
              <Search size={13} />
              <span>Comparer</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Supprimer ce segment"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: "0.3rem", display: "flex" }}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {status !== "scanning" && hasCache && (
        <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", padding: "0.4rem 1rem 0", margin: 0 }}>
          {segment.lastFullScanAt
            ? `Classement en cache — dernière comparaison complète le ${new Date(segment.lastFullScanAt).toLocaleDateString("fr-FR")}. Les nouvelles activités sauvegardées y sont ajoutées automatiquement.`
            : "Classement en cache, mis à jour automatiquement à chaque nouvelle activité sauvegardée."}
        </p>
      )}

      {status === "done" && attempts.length === 0 && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", padding: "0.6rem 1rem", margin: 0 }}>
          Aucun passage trouvé sur ce tronçon dans l'historique comparé.
        </p>
      )}

      {status === "done" && skippedCount > 0 && (
        <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", padding: "0.3rem 1rem 0", margin: 0 }}>
          {skippedCount} activité{skippedCount > 1 ? "s" : ""} non comparée{skippedCount > 1 ? "s" : ""} (plafond par analyse).
        </p>
      )}

      {attempts.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-color)", background: "var(--bg-primary)" }}>
                {["Rang", "Date", "Temps", activity.activityType === "cycling" ? "Vitesse" : "Allure", "FC moy."].map(h => (
                  <th key={h} style={{ padding: "0.4rem 0.75rem", textAlign: "left", fontWeight: 600, fontSize: "0.78rem", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attempts.map((a, i) => (
                <AttemptRow key={i} attempt={a} rank={i + 1} activityType={activity.activityType} onClick={() => onSelectAttempt(a)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Segments définis manuellement (deux clics sur la carte ou le graphique) et comparés à l'historique. Le classement (top 10) est mis en cache sur Firestore, voir useStoredSegments/useStoredSegmentScan. */
export const StoredSegments: React.FC<StoredSegmentsProps> = ({ activity, history, loadFile, picker, storedSegments }) => {
  const { segments, create, remove, updateAttempts } = storedSegments;
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<CachedSegmentAttempt | null>(null);

  if (activity.activityType === "unknown") return null;
  const activityType = activity.activityType;

  const relevant = segments.filter(s => s.activityType === activityType);

  const handleSave = async () => {
    if (picker.start === null || picker.end === null || !name.trim()) return;
    setSaving(true);
    try {
      const geo = buildSegmentGeometry(activity.points, picker.start, picker.end);
      const createdDate = activity.startTime ? activity.startTime.toISOString().slice(0, 10) : "";
      await create({
        name: name.trim(),
        activityType,
        points: geo.points,
        fingerprint: geo.fingerprint,
        distance: geo.distance,
        elevGain: geo.elevGain,
        createdDate,
      });
      setName("");
      picker.reset();
    } finally {
      setSaving(false);
    }
  };

  const picking = picker.stage === "pick-start" || picker.stage === "pick-end";

  return (
    <div className="card animate-slide-up" style={{ marginTop: "1rem" }}>
      <div className="panel-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <h3 className="panel-title">
          <Route size={18} style={{ color: "var(--accent-primary)" }} />
          <span>Mes segments</span>
          {relevant.length > 0 && (
            <span style={{ fontSize: "0.82rem", fontWeight: 400, color: "var(--text-secondary)", marginLeft: "0.5rem" }}>
              — {relevant.length}
            </span>
          )}
        </h3>
        {picker.stage === "idle" && (
          <button type="button" className="btn btn-outline" onClick={picker.begin} style={{ padding: "0.4rem 0.8rem", fontSize: "0.82rem" }}>
            <Plus size={14} />
            <span>Définir un segment</span>
          </button>
        )}
        {(picking || picker.stage === "ready") && (
          <button type="button" className="btn btn-outline" onClick={picker.reset} style={{ padding: "0.4rem 0.8rem", fontSize: "0.82rem" }}>
            <X size={14} />
            <span>Annuler la sélection</span>
          </button>
        )}
      </div>

      {picking && (
        <p style={{ fontSize: "0.85rem", color: "var(--accent-primary)", fontWeight: 600, marginTop: "0.75rem" }}>
          {picker.stage === "pick-start"
            ? "Clique le point de départ du segment sur la carte ou le graphique."
            : "Clique maintenant le point d'arrivée (carte ou graphique)."}
        </p>
      )}

      {picker.stage === "ready" && (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nom du segment"
            autoFocus
            style={{
              flex: 1, minWidth: "10rem", padding: "0.45rem 0.7rem", fontSize: "0.85rem",
              borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)",
              background: "var(--bg-primary)", color: "var(--text-primary)",
            }}
          />
          <button type="button" className="btn btn-outline" onClick={handleSave} disabled={!name.trim() || saving} style={{ padding: "0.45rem 0.9rem", fontSize: "0.82rem" }}>
            {saving ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : "Enregistrer"}
          </button>
        </div>
      )}

      {relevant.length === 0 && picker.stage === "idle" && (
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.75rem" }}>
          Aucun segment défini pour ce type d'activité. Clique « Définir un segment », puis choisis le point de départ et le point d'arrivée directement sur la carte ou sur le graphique (altitude, allure...).
        </p>
      )}

      {relevant.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          {relevant.map(seg => (
            <StoredSegmentCard
              key={seg.id}
              segment={seg}
              activity={activity}
              history={history}
              loadFile={loadFile}
              onDelete={() => remove(seg.id)}
              onUpdateAttempts={updateAttempts}
              onSelectAttempt={setSelected}
            />
          ))}
        </div>
      )}

      {selected && (
        <SegmentMapModal
          points={selected.points}
          startIndex={0}
          endIndex={selected.points.length - 1}
          segmentColor="#8b5cf6"
          icon={<Route size={18} style={{ color: "#8b5cf6" }} />}
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
