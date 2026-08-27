import React, { useState } from "react";
import { Zap, Pencil, Check, X, RotateCcw } from "lucide-react";
import type { CloudHandle } from "../hooks/useFirebaseCloud";
import type { ActivityIndexEntry } from "../utils/driveStorage";
import type { ManualBest, ManualBests } from "../hooks/useManualBests";
import { RUN_DISTANCES, BIKE_DURATIONS, aggregateBestRunEfforts } from "../utils/bestEfforts";
import { formatDuration, formatPace } from "../utils/format";

interface Props {
  cloud: CloudHandle;
  manualBests: ManualBests;
  setManualBest: (key: string, best: ManualBest | null) => void;
}

type TabType = 'running' | 'cycling';

interface BikeRow {
  key: string;
  label: string;
  value: number;         // watts ou km/h
  unit: 'power' | 'speed';
  entry: ActivityIndexEntry;
}

/** Une ligne "course" — value=null si aucun temps disponible pour cette distance (ni auto, ni manuel). */
interface RunRow {
  key: string;
  label: string;
  meters: number;
  value: number | null;   // secondes
  sourceName: string | null;
  sourceDate: string | null;
  isManual: boolean;
}

/** Parse une saisie "h:mm:ss", "mm:ss" ou secondes en nombre de secondes ; null si invalide. */
function parseTimeInput(s: string): number | null {
  const parts = s.trim().split(':').map(p => p.trim());
  if (parts.length === 0 || parts.some(p => p === '' || isNaN(Number(p)))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return nums[0];
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return null;
}

/**
 * Courbe des meilleurs efforts — record personnel sur distances standard (course) ou
 * puissance/vitesse moyenne max sur durées standard (vélo), agrégés depuis l'index Drive
 * (`ActivityIndexEntry.bestEfforts`, calculé à la sauvegarde de chaque activité — voir bestEfforts.ts).
 * Les temps de course peuvent être corrigés/saisis manuellement (voir useManualBests.ts) —
 * prennent toujours le dessus sur le temps auto-calculé, utile pour une contamination
 * (mauvais type d'activité) ou une séance courue sans GPS.
 */
export const BestEffortsCurve: React.FC<Props> = ({ cloud, manualBests, setManualBest }) => {
  const [tab, setTab] = useState<TabType>('running');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  if (cloud.status !== 'connected') return null;

  const autoRunBests = aggregateBestRunEfforts(cloud.history, manualBests);
  const runRows: RunRow[] = RUN_DISTANCES.map(({ key, label, meters }) => {
    const found = autoRunBests.find(b => b.key === key);
    return {
      key, label, meters,
      value: found?.timeSeconds ?? null,
      sourceName: found?.entryName ?? null,
      sourceDate: found?.entryDate ?? null,
      isManual: !!manualBests[key],
    };
  });

  const bikeRows: BikeRow[] = BIKE_DURATIONS.map(({ key, label }) => {
    // Priorité aux mesures de puissance ; repli sur la vitesse si aucune donnée de puissance pour cette durée.
    let best: BikeRow | null = null;
    for (const e of cloud.history) {
      if (e.activityType !== 'cycling' || e.bestEfforts?.unit !== 'power' || !e.bestEfforts.values[key]) continue;
      const v = e.bestEfforts.values[key];
      if (!best || v > best.value) best = { key, label, value: v, unit: 'power', entry: e };
    }
    if (!best) {
      for (const e of cloud.history) {
        if (e.activityType !== 'cycling' || e.bestEfforts?.unit !== 'speed' || !e.bestEfforts.values[key]) continue;
        const v = e.bestEfforts.values[key];
        if (!best || v > best.value) best = { key, label, value: v, unit: 'speed', entry: e };
      }
    }
    return best;
  }).filter((r): r is BikeRow => r !== null);

  const startEdit = (row: RunRow) => {
    setEditingKey(row.key);
    setEditValue(row.value !== null ? formatDuration(row.value) : "");
  };
  const saveEdit = (key: string) => {
    const secs = parseTimeInput(editValue);
    if (secs === null || secs <= 0) return;
    setManualBest(key, { timeSeconds: secs, date: new Date().toISOString().slice(0, 10) });
    setEditingKey(null);
  };

  return (
    <div className="card animate-slide-up" id="nav-best-efforts">
      <div className="panel-header">
        <h3 className="panel-title">
          <Zap size={18} style={{ color: "#fbbf24" }} />
          <span>Meilleurs efforts</span>
        </h3>
        {bikeRows.length > 0 && (
          <div style={{ display: "flex", gap: "2px", background: "var(--bg-primary)", padding: "2px",
            borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
            {(['running', 'cycling'] as const).map(t => (
              <button key={t} type="button" onClick={() => setTab(t)}
                style={{
                  padding: "0.15rem 0.6rem", fontSize: "0.75rem", fontWeight: 600, border: "none", cursor: "pointer",
                  borderRadius: "calc(var(--radius-sm) - 2px)",
                  background: tab === t ? "var(--accent-primary)" : "transparent",
                  color: tab === t ? "#fff" : "var(--text-secondary)",
                }}>
                {t === 'running' ? '🏃 Course' : '🚴 Vélo'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '0.75rem' }}>
                {tab === 'running' ? 'Distance' : 'Durée'}
              </th>
              <th style={{ textAlign: 'right', padding: '0.5rem 0.6rem', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '0.75rem' }}>
                {tab === 'running' ? 'Temps' : 'Puissance / Vitesse'}
              </th>
              {tab === 'running' && (
                <th style={{ textAlign: 'right', padding: '0.5rem 0.6rem', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '0.75rem' }}>
                  Allure
                </th>
              )}
              <th style={{ textAlign: 'right', padding: '0.5rem 0.6rem', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '0.75rem' }}>
                Séance
              </th>
            </tr>
          </thead>
          <tbody>
            {tab === 'running' ? runRows.map(r => (
              <tr key={r.key} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '0.55rem 0.6rem', fontWeight: 700, color: 'var(--text-primary)' }}>{r.label}</td>
                <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right' }}>
                  {editingKey === r.key ? (
                    <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <input
                        autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                        placeholder="h:mm:ss"
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(r.key); if (e.key === 'Escape') setEditingKey(null); }}
                        style={{
                          width: '5.5rem', padding: '0.2rem 0.4rem', fontSize: '0.82rem', textAlign: 'right',
                          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)',
                          background: 'var(--bg-primary)', color: 'var(--text-primary)',
                        }} />
                      <button type="button" onClick={() => saveEdit(r.key)} title="Enregistrer"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#34d399', display: 'flex' }}>
                        <Check size={15} />
                      </button>
                      <button type="button" onClick={() => setEditingKey(null)} title="Annuler"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}>
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontWeight: 700, color: r.value !== null ? '#fbbf24' : 'var(--text-tertiary)' }}>
                      {r.value !== null ? formatDuration(r.value) : '—'}
                    </span>
                  )}
                </td>
                <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right', color: 'var(--text-secondary)' }}>
                  {r.value !== null ? `${formatPace(r.value / (r.meters / 1000))} /km` : '—'}
                </td>
                <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right', color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>
                  {editingKey !== r.key && (
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                      {r.sourceName && (
                        <span>
                          {r.isManual && '✎ '}
                          {r.sourceName.length > 20 ? r.sourceName.slice(0, 18) + '…' : r.sourceName}
                          {r.sourceDate && ` · ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(new Date(r.sourceDate))}`}
                        </span>
                      )}
                      <button type="button" onClick={() => startEdit(r)} title={r.isManual ? "Modifier le temps saisi" : "Saisir un temps manuellement"}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}>
                        <Pencil size={12} />
                      </button>
                      {r.isManual && (
                        <button type="button" onClick={() => setManualBest(r.key, null)} title="Revenir au calcul automatique"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}>
                          <RotateCcw size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )) : bikeRows.map(r => (
              <tr key={r.key} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '0.55rem 0.6rem', fontWeight: 700, color: 'var(--text-primary)' }}>{r.label}</td>
                <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#fbbf24' }}>
                  {r.unit === 'power' ? `${r.value} W` : `${r.value.toFixed(1)} km/h`}
                </td>
                <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right', color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>
                  {r.entry.name.length > 24 ? r.entry.name.slice(0, 22) + '…' : r.entry.name}
                  {' · '}
                  {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(new Date(r.entry.date))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: '0.71rem', color: 'var(--text-tertiary)', marginTop: '0.6rem' }}>
        {tab === 'running'
          ? "Calculé sur les activités sauvegardées dans le cloud (icône crayon pour saisir/corriger un temps manuellement — utilisé aussi par Vitesse critique et les prédictions VDOT)."
          : "Calculé uniquement sur les activités sauvegardées dans le cloud depuis l'ajout de cette fonctionnalité."}
      </div>
    </div>
  );
};
