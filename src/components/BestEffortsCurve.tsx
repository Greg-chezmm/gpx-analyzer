import React, { useState } from "react";
import { Zap } from "lucide-react";
import type { DriveHandle } from "../hooks/useGoogleDrive";
import type { ActivityIndexEntry } from "../utils/driveStorage";
import { RUN_DISTANCES, BIKE_DURATIONS } from "../utils/bestEfforts";

interface Props {
  drive: DriveHandle;
}

type TabType = 'running' | 'cycling';

/** Formate une durée en secondes en h:mm:ss ou m:ss. */
function fmtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Formate une allure en s/km en "m:ss". */
function fmtPace(sPerKm: number): string {
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface BestRow {
  key: string;
  label: string;
  value: number;         // secondes (course) ou watts/km-h (vélo)
  unit: 'time' | 'power' | 'speed';
  entry: ActivityIndexEntry;
}

/**
 * Courbe des meilleurs efforts — record personnel sur distances standard (course) ou
 * puissance/vitesse moyenne max sur durées standard (vélo), agrégés depuis l'index Drive
 * (`ActivityIndexEntry.bestEfforts`, calculé à la sauvegarde de chaque activité — voir bestEfforts.ts).
 * N'inclut que les activités sauvegardées après l'introduction de cette fonctionnalité.
 */
export const BestEffortsCurve: React.FC<Props> = ({ drive }) => {
  const [tab, setTab] = useState<TabType>('running');

  if (drive.status !== 'connected') return null;

  const runRows: BestRow[] = RUN_DISTANCES.map(({ key, label }) => {
    let best: BestRow | null = null;
    for (const e of drive.history) {
      if (e.activityType === 'cycling' || !e.bestEfforts?.values[key]) continue;
      const v = e.bestEfforts.values[key];
      if (!best || v < best.value) best = { key, label, value: v, unit: 'time', entry: e };
    }
    return best;
  }).filter((r): r is BestRow => r !== null);

  const bikeRows: BestRow[] = BIKE_DURATIONS.map(({ key, label }) => {
    // Priorité aux mesures de puissance ; repli sur la vitesse si aucune donnée de puissance pour cette durée.
    let best: BestRow | null = null;
    for (const e of drive.history) {
      if (e.activityType !== 'cycling' || e.bestEfforts?.unit !== 'power' || !e.bestEfforts.values[key]) continue;
      const v = e.bestEfforts.values[key];
      if (!best || v > best.value) best = { key, label, value: v, unit: 'power', entry: e };
    }
    if (!best) {
      for (const e of drive.history) {
        if (e.activityType !== 'cycling' || e.bestEfforts?.unit !== 'speed' || !e.bestEfforts.values[key]) continue;
        const v = e.bestEfforts.values[key];
        if (!best || v > best.value) best = { key, label, value: v, unit: 'speed', entry: e };
      }
    }
    return best;
  }).filter((r): r is BestRow => r !== null);

  if (runRows.length === 0 && bikeRows.length === 0) return null;

  const rows = tab === 'running' ? runRows : bikeRows;

  return (
    <div className="card animate-slide-up" id="nav-best-efforts">
      <div className="panel-header">
        <h3 className="panel-title">
          <Zap size={18} style={{ color: "#fbbf24" }} />
          <span>Meilleurs efforts</span>
        </h3>
        {runRows.length > 0 && bikeRows.length > 0 && (
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
            {rows.map(r => (
              <tr key={r.key} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '0.55rem 0.6rem', fontWeight: 700, color: 'var(--text-primary)' }}>{r.label}</td>
                <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#fbbf24' }}>
                  {r.unit === 'time' ? fmtTime(r.value) : r.unit === 'power' ? `${r.value} W` : `${r.value.toFixed(1)} km/h`}
                </td>
                {tab === 'running' && (
                  <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {fmtPace(r.value / (RUN_DISTANCES.find(d => d.key === r.key)!.meters / 1000))} /km
                  </td>
                )}
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
        Calculé uniquement sur les activités sauvegardées sur Drive depuis l'ajout de cette fonctionnalité.
      </div>
    </div>
  );
};
