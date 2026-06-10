import React, { useState } from "react";
import { TrendingUp } from "lucide-react";
import type { TrainingEntry } from "../hooks/useTrainingHistory";

interface Props {
  history: TrainingEntry[];
}

type ViewDays = 90 | 180 | 'all';
type TabType  = 'running' | 'cycling';

function fmtPace(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function rollingAvg(vals: number[], w: number): number[] {
  return vals.map((_, i) => {
    const slice = vals.slice(Math.max(0, i - w + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

const VIEW_OPTS: { value: ViewDays; label: string }[] = [
  { value: 90,    label: "3 mois" },
  { value: 180,   label: "6 mois" },
  { value: 'all', label: "Tout" },
];

export const ProgressChart: React.FC<Props> = ({ history }) => {
  const [viewDays, setViewDays] = useState<ViewDays>(90);
  const [tab, setTab] = useState<TabType>('running');
  const [hovIdx, setHovIdx] = useState<number | null>(null);

  const now = new Date();
  const cutoff = viewDays === 'all' ? null : new Date(now);
  if (cutoff && viewDays !== 'all') cutoff.setDate(cutoff.getDate() - viewDays);

  // Build typed entries sorted by date
  const running = history
    .filter(e => e.activityType !== 'cycling' && (e.avgPace ?? 0) > 0)
    .filter(e => !cutoff || new Date(e.date) >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));

  const cycling = history
    .filter(e => e.activityType === 'cycling' &&
      ((e.avgSpeed ?? 0) > 0 || ((e.distance ?? 0) > 0 && (e.duration ?? 0) > 0)))
    .filter(e => !cutoff || new Date(e.date) >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));

  const hasRunning = running.length >= 2;
  const hasCycling = cycling.length >= 2;
  if (!hasRunning && !hasCycling) return null;

  const activeTab: TabType = !hasRunning ? 'cycling' : !hasCycling ? 'running' : tab;
  const entries = activeTab === 'running' ? running : cycling;

  const rawVals = activeTab === 'running'
    ? entries.map(e => e.avgPace!)
    : entries.map(e => e.avgSpeed ?? (e.distance! / e.duration! * 3.6));

  const trend = rollingAvg(rawVals, 5);
  const isInverted = activeTab === 'running'; // lower pace = better

  // SVG layout
  const ML = 44, MT = 12, MB = 28, MR = 12;
  const VW = 560, VH = 180;
  const cw = VW - ML - MR;
  const ch = VH - MT - MB;
  const n = entries.length;

  const allDates = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const dateMin = cutoff ? cutoff.toISOString().slice(0, 10) : (allDates[0]?.date ?? '');
  const dateMax = now.toISOString().slice(0, 10);
  const msMin = new Date(dateMin).getTime();
  const msMax = new Date(dateMax).getTime();
  const msRange = msMax - msMin || 1;

  const margin = (Math.max(...rawVals) - Math.min(...rawVals)) * 0.1 || 1;
  const yMin = Math.min(...rawVals) - margin;
  const yMax = Math.max(...rawVals) + margin;
  const yRange = yMax - yMin || 1;

  const toX = (date: string) =>
    ML + ((new Date(date).getTime() - msMin) / msRange) * cw;
  const toY = (v: number) => isInverted
    ? MT + ((v - yMin) / yRange) * ch           // higher val = lower on screen = worse
    : MT + ch - ((v - yMin) / yRange) * ch;     // higher val = higher on screen = better

  const trendPath = entries
    .map((e, i) => `${i === 0 ? 'M' : 'L'}${toX(e.date).toFixed(1)},${toY(trend[i]).toFixed(1)}`)
    .join(' ');

  // X axis labels: one per month
  const xLabels: { date: string; label: string }[] = [];
  {
    const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    let lastMonth = '';
    for (const e of entries) {
      const m = e.date.slice(0, 7);
      if (m !== lastMonth) {
        lastMonth = m;
        const mo = parseInt(e.date.slice(5, 7), 10) - 1;
        xLabels.push({ date: e.date, label: months[mo] });
      }
    }
  }

  // Y axis ticks
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (yRange * i) / 4);

  const accentColor = activeTab === 'running' ? '#818cf8' : '#34d399';

  return (
    <div className="card animate-slide-up" style={{ width: '100%' }}>
      <div className="panel-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 className="panel-title">
          <TrendingUp size={18} style={{ color: accentColor }} />
          <span>Progression</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
            · {activeTab === 'running' ? 'allure moyenne /km' : 'vitesse moyenne km/h'}
          </span>
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Type tabs */}
          {hasRunning && hasCycling && (
            <div style={{
              display: 'flex', gap: '2px', background: 'var(--bg-primary)', padding: '2px',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)',
            }}>
              {(['running', 'cycling'] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => setTab(t)}
                  style={{
                    padding: '0.15rem 0.5rem', fontSize: '0.75rem', fontWeight: 600,
                    borderRadius: 'calc(var(--radius-sm) - 2px)', border: 'none', cursor: 'pointer',
                    background: activeTab === t ? 'var(--accent-primary)' : 'transparent',
                    color: activeTab === t ? '#fff' : 'var(--text-secondary)',
                    transition: 'all 0.15s',
                  }}
                >
                  {t === 'running' ? '🏃' : '🚴'}
                </button>
              ))}
            </div>
          )}
          {/* Period toggle */}
          <div style={{
            display: 'flex', gap: '2px', background: 'var(--bg-primary)', padding: '2px',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)',
          }}>
            {VIEW_OPTS.map(o => (
              <button key={String(o.value)} type="button"
                onClick={() => setViewDays(o.value)}
                style={{
                  padding: '0.15rem 0.5rem', fontSize: '0.75rem', fontWeight: 600,
                  borderRadius: 'calc(var(--radius-sm) - 2px)', border: 'none', cursor: 'pointer',
                  background: viewDays === o.value ? 'var(--accent-primary)' : 'transparent',
                  color: viewDays === o.value ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
            {n} séance{n > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: '100%', display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHovIdx(null)}
      >
        {/* Grid */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={ML} y1={toY(v)} x2={VW - MR} y2={toY(v)}
              stroke="var(--border-color)" strokeWidth="0.5" />
            <text x={ML - 4} y={toY(v) + 4} textAnchor="end" fontSize="9" fill="var(--text-tertiary)">
              {activeTab === 'running' ? fmtPace(v) : v.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Axes */}
        <line x1={ML} y1={MT} x2={ML} y2={MT + ch} stroke="var(--border-color)" strokeWidth="1" />
        <line x1={ML} y1={MT + ch} x2={VW - MR} y2={MT + ch} stroke="var(--border-color)" strokeWidth="1" />

        {/* Trend line */}
        <path d={trendPath} fill="none" stroke={accentColor} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" opacity="0.7" />

        {/* Dots */}
        {entries.map((e, i) => {
          const cx = toX(e.date);
          const cy = toY(rawVals[i]);
          const isHov = hovIdx === i;
          return (
            <circle key={i} cx={cx} cy={cy} r={isHov ? 5 : 3.5}
              fill={accentColor} stroke="var(--bg-secondary)" strokeWidth="1.5"
              style={{ cursor: 'pointer', transition: 'r 0.1s' }}
              onMouseEnter={() => setHovIdx(i)}
            />
          );
        })}

        {/* X labels */}
        {xLabels.map(({ date, label }) => (
          <text key={date} x={toX(date)} y={VH - 6}
            textAnchor="middle" fontSize="9" fill="var(--text-tertiary)">
            {label}
          </text>
        ))}

        {/* Hover tooltip */}
        {hovIdx !== null && (() => {
          const e = entries[hovIdx];
          const v = rawVals[hovIdx];
          const cx = toX(e.date);
          const cy = toY(v);
          const valStr = activeTab === 'running'
            ? `${fmtPace(v)} /km`
            : `${v.toFixed(1)} km/h`;
          const dateStr = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(e.date));
          const BW = 160, BH = 60;
          const bx = cx > ML + cw * 0.65 ? cx - BW - 10 : cx + 10;
          const by = Math.max(MT + 2, Math.min(cy - 20, MT + ch - BH - 2));
          return (
            <g>
              <line x1={cx} y1={MT} x2={cx} y2={MT + ch}
                stroke={accentColor} strokeWidth="1" strokeDasharray="3,3" strokeOpacity="0.4" />
              <rect x={bx} y={by} width={BW} height={BH} rx={5}
                fill="var(--bg-primary)" fillOpacity={0.97}
                stroke="var(--border-color)" strokeWidth="1" />
              <text x={bx + 8} y={by + 15} fontSize="9" fill="var(--text-tertiary)" fontWeight={600}>
                {dateStr}
              </text>
              <text x={bx + 8} y={by + 32} fontSize="14" fontWeight={800} fill={accentColor}>
                {valStr}
              </text>
              <text x={bx + 8} y={by + 50} fontSize="9" fill="var(--text-tertiary)">
                {e.name.length > 24 ? e.name.slice(0, 22) + '…' : e.name}
                {e.distance ? ` · ${(e.distance / 1000).toFixed(1)} km` : ''}
              </text>
            </g>
          );
        })()}
      </svg>

      {/* Légende */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.25rem', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <div style={{ width: 20, height: 2, background: accentColor, opacity: 0.7, borderRadius: 1 }} />
          Moyenne mobile (5 séances)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor }} />
          Séance
        </div>
      </div>
    </div>
  );
};
