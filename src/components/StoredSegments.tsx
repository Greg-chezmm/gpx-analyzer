import React, { useState, useMemo, useEffect, useRef } from "react";
import { Route, Plus, X, Search, RefreshCw, Loader2, Trophy, Trash2, ChevronDown, ChevronUp, Map as MapIcon, Bug } from "lucide-react";
import type { GPXActivity } from "../utils/gpxCore";
import type { ActivityIndexEntry } from "../utils/driveStorage";
import type { StoredSegment } from "../utils/firestoreStorage";
import type { CachedSegmentAttempt, StoredSegmentMatchDebug } from "../utils/segments";
import {
  buildSegmentGeometry, matchStoredSegment, debugStoredSegmentMatch, debugSegmentPointRuns,
  parseActivityRawToPoints, type SegmentPointRun,
} from "../utils/segments";
import type { StoredSegmentsHandle } from "../hooks/useStoredSegments";
import { useStoredSegmentScan } from "../hooks/useStoredSegmentScan";
import type { SegmentPickerHandle } from "../hooks/useSegmentPicker";
import { formatDuration, formatPace } from "./SplitsTable";
import { SegmentMapModal } from "./SegmentMapModal";
import { SegmentMatchDebugMapModal } from "./SegmentMatchDebugMapModal";

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
  onDebug: () => void;
  debugLoading: boolean;
}

function AttemptRow({ attempt, rank, activityType, onClick, onDebug, debugLoading }: AttemptRowProps) {
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
        {attempt.name && (
          <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "12rem" }}>
            {attempt.name}
          </div>
        )}
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
        {attempt.distance >= 1000 ? `${(attempt.distance / 1000).toFixed(2)} km` : `${Math.round(attempt.distance)} m`}
      </td>
      <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", color: "var(--color-ele)" }}>
        {attempt.elevGain > 0 ? `+${Math.round(attempt.elevGain)} m` : "—"}
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
      <td style={{ padding: "0.45rem 0.75rem" }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDebug(); }}
          title="Voir les points appariés/non appariés de ce passage (diagnostic)"
          disabled={debugLoading}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: "0.15rem", display: "flex" }}
        >
          {debugLoading ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> : <Bug size={13} />}
        </button>
      </td>
    </tr>
  );
}

interface AttemptDebugResult {
  points: SegmentPointRun[];
  activityPoints: { lat: number; lon: number }[];
  label: string;
  debug: StoredSegmentMatchDebug;
}

interface StoredSegmentCardProps {
  segment: StoredSegment;
  activity: GPXActivity;
  history: ActivityIndexEntry[];
  loadFile: (entry: ActivityIndexEntry) => Promise<ArrayBuffer | string>;
  onDelete: () => void;
  onUpdateAttempts: (id: string, attempts: CachedSegmentAttempt[], lastFullScanAt?: string) => Promise<void>;
  onSelectAttempt: (attempt: CachedSegmentAttempt) => void;
  onShowMap: () => void;
}

function StoredSegmentCard({ segment, activity, history, loadFile, onDelete, onUpdateAttempts, onSelectAttempt, onShowMap }: StoredSegmentCardProps) {
  const { status, progress, attempts, scan } = useStoredSegmentScan(
    segment, activity, history, loadFile,
    top => { onUpdateAttempts(segment.id, top, new Date().toISOString()); },
  );
  const hasCache = (segment.attempts?.length ?? 0) > 0 || attempts.length > 0;
  const [debugLoadingKey, setDebugLoadingKey] = useState<number | null>(null);
  const [debugResult, setDebugResult] = useState<AttemptDebugResult | null>(null);

  // Diagnostic par passage : pour l'activité actuellement ouverte, ses points sont déjà en mémoire ;
  // pour une activité passée du classement, on ne dispose que du sous-tracé du passage détecté
  // (CachedSegmentAttempt.points), pas de l'activité complète — retéléchargement nécessaire pour voir
  // les points non appariés en dehors du passage déjà trouvé.
  const handleDebugAttempt = async (attempt: CachedSegmentAttempt, index: number) => {
    setDebugLoadingKey(index);
    try {
      const points = attempt.isCurrent
        ? activity.points
        : await (async () => {
            const entry = history.find(e => e.date === attempt.date);
            if (!entry) throw new Error("Activité introuvable dans l'historique.");
            const raw = await loadFile(entry);
            return parseActivityRawToPoints(raw, entry.fileName);
          })();
      setDebugResult({
        points: debugSegmentPointRuns(segment.points, points),
        activityPoints: points,
        label: attempt.isCurrent ? "Activité actuelle" : new Date(attempt.date).toLocaleDateString("fr-FR"),
        debug: debugStoredSegmentMatch(segment.points, segment.distance, points),
      });
    } catch {
      alert("Impossible de charger cette activité pour le diagnostic.");
    } finally {
      setDebugLoadingKey(null);
    }
  };

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
          onClick={onShowMap}
          title="Voir le tracé du segment sur la carte"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: "0.3rem", display: "flex" }}
        >
          <MapIcon size={15} />
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

      {attempts.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-color)", background: "var(--bg-primary)" }}>
                {["Rang", "Date", "Distance", "D+", "Temps", activity.activityType === "cycling" ? "Vitesse" : "Allure", "FC moy.", ""].map(h => (
                  <th key={h} style={{ padding: "0.4rem 0.75rem", textAlign: "left", fontWeight: 600, fontSize: "0.78rem", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attempts.map((a, i) => (
                <AttemptRow
                  key={i} attempt={a} rank={i + 1} activityType={activity.activityType}
                  onClick={() => onSelectAttempt(a)}
                  onDebug={() => handleDebugAttempt(a, i)}
                  debugLoading={debugLoadingKey === i}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {debugResult && (
        <SegmentMatchDebugMapModal
          points={debugResult.points}
          activityPoints={debugResult.activityPoints}
          segmentName={`${segment.name} — ${debugResult.label}`}
          extraInfo={`Couverture retenue : ${Math.round(debugResult.debug.bestRunM)}m / ${Math.round(debugResult.debug.requiredM)}m requis · ${debugResult.debug.bestClusterRunCount} corridor${debugResult.debug.bestClusterRunCount > 1 ? "s" : ""} sur ${debugResult.debug.totalRuns} au total${debugResult.debug.runGapsM.length > 0 ? ` · écarts : ${debugResult.debug.runGapsM.join("m, ")}m` : ""}`}
          onClose={() => setDebugResult(null)}
        />
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
  const [mapSegment, setMapSegment] = useState<StoredSegment | null>(null);
  const [debugMapSegment, setDebugMapSegment] = useState<StoredSegment | null>(null);
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  const activityType = activity.activityType;
  const ofType = segments.filter(s => s.activityType === activityType);

  // N'affiche un segment que si l'activité actuellement ouverte suit bien son tracé — un segment
  // défini sur un autre parcours (même type d'activité) n'a rien à faire ici. Les segments écartés
  // sont gardés avec un diagnostic (voir showDiagnostic) plutôt que silencieusement masqués.
  const { relevant, notRelevant } = useMemo(() => {
    const rel: StoredSegment[] = [];
    const notRel: { segment: StoredSegment; debug: StoredSegmentMatchDebug }[] = [];
    for (const s of ofType) {
      if (matchStoredSegment(s.points, s.distance, { points: activity.points, date: "", name: activity.name }, true) !== null) {
        rel.push(s);
      } else {
        notRel.push({ segment: s, debug: debugStoredSegmentMatch(s.points, s.distance, activity.points) });
      }
    }
    return { relevant: rel, notRelevant: notRel };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ofType, activity.points]);

  if (activityType === "unknown") return null;

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
          {ofType.length === 0
            ? "Aucun segment défini pour ce type d'activité. Clique « Définir un segment », puis choisis le point de départ et le point d'arrivée directement sur la carte ou sur le graphique (altitude, allure...)."
            : "Aucun de tes segments enregistrés ne correspond au tracé de cette activité."}
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
              onShowMap={() => setMapSegment(seg)}
            />
          ))}
        </div>
      )}

      {notRelevant.length > 0 && (
        <div style={{ marginTop: relevant.length > 0 ? "0.75rem" : "0.5rem" }}>
          <button type="button" onClick={() => setShowDiagnostic(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: "0.3rem", background: "none", border: "none",
              cursor: "pointer", color: "var(--text-tertiary)", fontSize: "0.75rem", padding: 0,
            }}>
            {showDiagnostic ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {notRelevant.length} segment{notRelevant.length > 1 ? "s" : ""} défini{notRelevant.length > 1 ? "s" : ""} pour ce type mais non retenu{notRelevant.length > 1 ? "s" : ""} sur cette activité (diagnostic)
          </button>
          {showDiagnostic && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
              {notRelevant.map((n, i) => (
                <div key={i} style={{ padding: "0.3rem 0", borderTop: i > 0 ? "1px solid var(--border-color)" : undefined, display: "flex", alignItems: "flex-start", gap: "0.4rem" }}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ color: "var(--text-secondary)" }}>{n.segment.name}</strong>
                    {" — "}
                    {n.debug.refPointCount < 5 || n.debug.candidatePointCount < 5
                      ? `géométrie insuffisante (${n.debug.refPointCount} pt segment / ${n.debug.candidatePointCount} pt activité)`
                      : n.debug.bestRunM === 0
                        ? `aucun corridor commun détecté (segment ${n.debug.refPointCount} pts, activité ${n.debug.candidatePointCount} pts) — point de départ à ${Math.round(n.debug.nearestStartM)}m du point le plus proche de l'activité, arrivée à ${Math.round(n.debug.nearestEndM)}m`
                        : `couverture cumulée insuffisante (${Math.round(n.debug.bestRunM)}m / ${Math.round(n.debug.requiredM)}m requis, ${n.debug.bestClusterRunCount} corridor${n.debug.bestClusterRunCount > 1 ? "s" : ""} sur ${n.debug.totalRuns} au total${n.debug.runGapsM.length > 0 ? `, écarts entre corridors : ${n.debug.runGapsM.join("m, ")}m` : ""})`}
                  </div>
                  <button type="button" onClick={() => setMapSegment(n.segment)} title="Voir le tracé du segment sur la carte"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: "0.1rem", display: "flex", flexShrink: 0 }}>
                    <MapIcon size={13} />
                  </button>
                  <button type="button" onClick={() => setDebugMapSegment(n.segment)} title="Voir les points appariés/non appariés sur la carte"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: "0.1rem", display: "flex", flexShrink: 0 }}>
                    <Bug size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
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

      {mapSegment && (
        <SegmentMapModal
          points={mapSegment.points}
          startIndex={0}
          endIndex={mapSegment.points.length - 1}
          segmentColor="#8b5cf6"
          icon={<Route size={18} style={{ color: "#8b5cf6" }} />}
          title={mapSegment.name}
          subtitle={`${mapSegment.distance >= 1000 ? `${(mapSegment.distance / 1000).toFixed(2)} km` : `${Math.round(mapSegment.distance)} m`}${mapSegment.elevGain > 0 ? ` · D+ ${Math.round(mapSegment.elevGain)} m` : ""}`}
          onClose={() => setMapSegment(null)}
        />
      )}

      {debugMapSegment && (
        <SegmentMatchDebugMapModal
          points={debugSegmentPointRuns(debugMapSegment.points, activity.points)}
          activityPoints={activity.points}
          segmentName={debugMapSegment.name}
          onClose={() => setDebugMapSegment(null)}
        />
      )}
    </div>
  );
};
