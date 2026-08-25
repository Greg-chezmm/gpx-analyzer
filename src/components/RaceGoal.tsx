import React, { useState } from "react";
import { Target, X, Pencil, Info } from "lucide-react";
import type { DriveHandle } from "../hooks/useGoogleDrive";
import type { TrainingEntry } from "../hooks/useTrainingHistory";
import type { RaceGoalConfig } from "../hooks/useRaceGoal";
import { classifyRace, findPastRaceTsb, computeTsbTarget, projectTsb } from "../utils/raceGoal";

interface Props {
  goal: RaceGoalConfig | null;
  setGoal: (g: RaceGoalConfig | null) => void;
  history: TrainingEntry[];
  drive: DriveHandle;
}

/** Formulaire de saisie/édition de l'objectif course (date, discipline, distance, nom). */
function GoalForm({ initial, onSave, onCancel }: {
  initial: RaceGoalConfig | null;
  onSave: (g: RaceGoalConfig) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initial?.date ?? "");
  const [activityType, setActivityType] = useState<'running' | 'cycling'>(initial?.activityType ?? 'running');
  const [distanceKm, setDistanceKm] = useState(initial?.distanceKm ?? 10);
  const [name, setName] = useState(initial?.name ?? "");

  const canSave = date.length === 10 && distanceKm > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input type="text" placeholder="Nom (optionnel)" value={name} onChange={e => setName(e.target.value)}
          style={{ flex: 1, minWidth: '140px', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-primary)', padding: '2px',
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
          {(['running', 'cycling'] as const).map(t => (
            <button key={t} type="button" onClick={() => setActivityType(t)}
              style={{
                padding: '0.3rem 0.6rem', fontSize: '0.85rem', border: 'none', cursor: 'pointer',
                borderRadius: 'calc(var(--radius-sm) - 2px)',
                background: activityType === t ? 'var(--accent-primary)' : 'transparent',
                color: activityType === t ? '#fff' : 'var(--text-secondary)',
              }}>
              {t === 'running' ? '🏃 Course' : '🚴 Vélo'}
            </button>
          ))}
        </div>
        <input type="number" min={1} step={1} value={distanceKm}
          onChange={e => setDistanceKm(Number(e.target.value))}
          style={{ width: '70px', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
        <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>km</span>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel}
          style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem', background: 'transparent',
            border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          Annuler
        </button>
        <button type="button" disabled={!canSave}
          onClick={() => onSave({ date, activityType, distanceKm, name: name.trim() || `Objectif ${distanceKm} km` })}
          style={{ padding: '0.35rem 0.9rem', fontSize: '0.8rem', fontWeight: 600, background: 'var(--accent-primary)',
            border: 'none', borderRadius: 'var(--radius-sm)', color: '#fff', cursor: canSave ? 'pointer' : 'not-allowed',
            opacity: canSave ? 1 : 0.5 }}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}

/**
 * Panneau "Objectif course" — projette le TSB jusqu'à une date de course cible en simulant un taper
 * standard, et compare au TSB cible calibré sur les courses passées comparables (marquées 🏁 dans Drive).
 */
export const RaceGoal: React.FC<Props> = ({ goal, setGoal, history, drive }) => {
  const [editing, setEditing] = useState(false);

  if (!goal || editing) {
    return (
      <div className="card animate-slide-up" id="nav-race-goal">
        <div className="panel-header">
          <h3 className="panel-title">
            <Target size={18} style={{ color: "#f472b6" }} />
            <span>Objectif course</span>
          </h3>
        </div>
        <GoalForm initial={goal} onSave={g => { setGoal(g); setEditing(false); }} onCancel={() => setEditing(false)} />
      </div>
    );
  }

  const catInfo = classifyRace(goal.activityType, goal.distanceKm * 1000);

  // Courses passées comparables (marquées 🏁 dans Drive), utilisées pour calibrer la cible TSB
  const raceEntries = drive.history.filter(e => e.isRace);
  const pastRaces = findPastRaceTsb(drive.history, raceEntries, goal.activityType, catInfo.category);
  const target = computeTsbTarget(pastRaces, catInfo.defaultTarget);

  const trimpSeries = history.map(h => ({ date: h.date, trimp: h.trimp }));
  const projection = projectTsb(trimpSeries, goal.date, catInfo.taperDays);

  const dateStr = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(goal.date + 'T00:00:00'));
  const isPast = projection.daysRemaining <= 0;
  const onTrack = projection.tsbAtRace != null && projection.tsbAtRace >= target.min && projection.tsbAtRace <= target.max;

  // Graphique : historique récent (45j) + projection future jusqu'au jour J
  const ML = 36, MT = 8, MB = 18, MR = 8, VW = 560, VH = 120;
  const chartWidth = VW - ML - MR, chartHeight = VH - MT - MB;
  const past = projection.chartData.filter(d => d.date <= new Date().toISOString().slice(0, 10)).slice(-45);
  const future = projection.chartData.filter(d => d.date > new Date().toISOString().slice(0, 10));
  const full = [...past, ...future];
  const n = full.length;
  const allVals = [...full.map(d => d.tsb), target.min, target.max];
  const maxV = Math.max(...allVals, 10), minV = Math.min(...allVals, -10);
  const range = maxV - minV || 1;
  const toX = (i: number) => ML + (n > 1 ? (i / (n - 1)) * chartWidth : 0);
  const toY = (v: number) => MT + chartHeight - ((v - minV) / range) * chartHeight;
  const pastPath = past.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d.tsb).toFixed(1)}`).join(' ');
  const futurePath = future.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(past.length - 1 + i).toFixed(1)},${toY(d.tsb).toFixed(1)}`).join(' ');

  return (
    <div className="card animate-slide-up" id="nav-race-goal">
      <div className="panel-header">
        <h3 className="panel-title">
          <Target size={18} style={{ color: "#f472b6" }} />
          <span>Objectif course</span>
        </h3>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="button" onClick={() => setEditing(true)} title="Modifier"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: '0.2rem' }}>
            <Pencil size={14} />
          </button>
          <button type="button" onClick={() => setGoal(null)} title="Supprimer l'objectif"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: '0.2rem' }}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '0.85rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--text-primary)' }}>{goal.name}</strong>
        {' · '}{goal.activityType === 'cycling' ? '🚴' : '🏃'} {goal.distanceKm} km · {catInfo.label}
        {' · '}{dateStr}
        {' · '}
        <span style={{ fontWeight: 700, color: isPast ? 'var(--text-tertiary)' : '#f472b6' }}>
          {isPast ? 'Passée' : `J-${projection.daysRemaining}`}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', fontSize: '0.82rem' }}>
        <div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem', fontWeight: 600 }}>CIBLE TSB</div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
            {target.min > 0 ? '+' : ''}{target.min} à {target.max > 0 ? '+' : ''}{target.max}
          </div>
        </div>
        <div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem', fontWeight: 600 }}>PROJECTION JOUR J</div>
          <div style={{ fontWeight: 700, color: onTrack ? '#34d399' : '#f59e0b' }}>
            {projection.tsbAtRace != null ? `${projection.tsbAtRace > 0 ? '+' : ''}${projection.tsbAtRace.toFixed(1)}` : '—'}
            {!isPast && (onTrack ? ' · en bonne voie' : ' · à surveiller')}
          </div>
        </div>
      </div>

      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'flex-start', gap: '0.35rem', marginBottom: '0.75rem' }}>
        <Info size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
        <span>
          {target.source === 'personalized'
            ? `Cible basée sur ${target.sampleCount} course${target.sampleCount > 1 ? 's' : ''} passée${target.sampleCount > 1 ? 's' : ''} du même type (marquée${target.sampleCount > 1 ? 's' : ''} 🏁 dans Drive).`
            : `Cible générique (aucune course "${catInfo.label}" 🏁 dans ton historique Drive pour calibrer).`}
          {' '}Projection basée sur un taper standard de {catInfo.taperDays} jours, charge réduite progressivement à ~35% de ta moyenne récente.
        </span>
      </div>

      {n >= 2 && (
        <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block', overflow: 'visible' }}>
          {/* Bande cible */}
          <rect x={ML} y={toY(target.max)} width={chartWidth} height={Math.max(0, toY(target.min) - toY(target.max))}
            fill="#34d399" opacity={0.1} />
          <line x1={ML} y1={toY(0)} x2={VW - MR} y2={toY(0)} stroke="var(--border-color)" strokeWidth="1" strokeDasharray="3,3" />
          {/* Historique réel */}
          <path d={pastPath} fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinejoin="round" />
          {/* Projection */}
          {future.length > 0 && (
            <path d={futurePath} fill="none" stroke="#f472b6" strokeWidth="2" strokeLinejoin="round" strokeDasharray="4,3" />
          )}
          {/* Marqueur jour de course */}
          {!isPast && (
            <line x1={toX(n - 1)} y1={MT} x2={toX(n - 1)} y2={MT + chartHeight}
              stroke="#f472b6" strokeWidth="1" strokeDasharray="2,2" opacity={0.6} />
          )}
        </svg>
      )}

      {pastRaces.length > 0 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
          Courses de référence : {pastRaces.map(r => `${r.name} (${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(new Date(r.date))}, TSB ${r.tsb > 0 ? '+' : ''}${r.tsb.toFixed(1)})`).join(' · ')}
        </div>
      )}
    </div>
  );
};
