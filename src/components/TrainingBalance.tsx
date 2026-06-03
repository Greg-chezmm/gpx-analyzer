import React, { useState } from "react";
import { Activity, Trash2 } from "lucide-react";
import type { TSBResult } from "../utils/trainingMetrics";
import type { TrainingEntry } from "../hooks/useTrainingHistory";

interface Props {
  tsb:     TSBResult;
  history: TrainingEntry[];
  onClear: () => void;
}

function tsbLabel(tsb: number): { label: string; color: string } {
  if (tsb >  10) return { label: "Frais",     color: "#34d399" };
  if (tsb >   0) return { label: "Équilibré", color: "#60a5fa" };
  if (tsb > -15) return { label: "Chargé",    color: "#fbbf24" };
  if (tsb > -30) return { label: "Fatigué",   color: "#f97316" };
  return              { label: "Surmenage",   color: "#ef4444" };
}

function ctlLabel(ctl: number): { label: string; color: string } {
  if (ctl >= 80) return { label: "Élite",       color: "#a78bfa" };
  if (ctl >= 60) return { label: "Compétiteur", color: "#60a5fa" };
  if (ctl >= 40) return { label: "Entraîné",    color: "#34d399" };
  if (ctl >= 20) return { label: "Loisir",      color: "#fbbf24" };
  return              { label: "Débutant",      color: "#94a3b8" };
}

function KPI({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: "90px" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontWeight: 600, marginBottom: "0.2rem" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: "2rem", color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: "0.72rem", color, fontWeight: 700, marginTop: "0.2rem",
        padding: "0.15rem 0.5rem", borderRadius: "var(--radius-full)",
        background: `${color}18`, border: `1px solid ${color}44`, display: "inline-block" }}>
        {sub}
      </div>
    </div>
  );
}

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, '0')}`;
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

function fmtPace(sPerKm: number): string {
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface TooltipState {
  entries: TrainingEntry[];
  svgX: number;
  svgY: number;
}

export const TrainingBalance: React.FC<Props> = ({ tsb, history, onClear }) => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  if (history.length === 0) return null;

  const { label: tsbLbl, color: tsbColor } = tsbLabel(tsb.tsb);
  const { label: ctlLbl, color: ctlColor } = ctlLabel(tsb.ctl);
  const data = tsb.chartData;

  const ML = 36, MT = 8, MB = 22, MR = 8;
  const VW = 560, VH = 140;
  const cw = VW - ML - MR;
  const ch = VH - MT - MB - 12; // extra space for dots row
  const n = data.length;

  const allVals = data.flatMap(d => [d.ctl, d.atl, d.tsb]);
  const maxV = Math.max(...allVals, 10);
  const minV = Math.min(...allVals, -5);
  const range = maxV - minV || 1;

  const toX = (i: number) => ML + (n > 1 ? (i / (n - 1)) * cw : cw / 2);
  const toY = (v: number) => MT + ch - ((v - minV) / range) * ch;
  const zeroY = toY(0);
  const dotsY = VH - MB - 6; // y position of session dots

  const path = (key: 'ctl' | 'atl' | 'tsb') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d[key]).toFixed(1)}`).join(' ');

  const xLabels: { i: number; label: string }[] = [];
  data.forEach((d, i) => {
    if (d.date.slice(8) === '01' || i === 0) {
      const [, m] = d.date.split('-');
      const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
      xLabels.push({ i, label: months[parseInt(m, 10) - 1] });
    }
  });

  // Training days with their history entries for tooltip
  const trainingDots = data
    .map((d, i) => ({ ...d, i }))
    .filter(d => d.trimp > 0)
    .map(d => ({
      ...d,
      entries: history.filter(e => e.date === d.date),
    }));

  // Tooltip rendering inside SVG
  const renderTooltip = () => {
    if (!tooltip || tooltip.entries.length === 0) return null;

    const TW = 182;
    const PAD = 8;
    const LINE_H = 12;

    // Build lines for the first (or only) entry
    const e = tooltip.entries[0];
    const titleLine = e.name.length > 24 ? e.name.slice(0, 22) + '…' : e.name;
    const dateLine = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(e.date))
      + (e.activityType ? (e.activityType === 'cycling' ? ' · Vélo' : ' · Course') : '');

    const detailLines: string[] = [];
    if (e.distance && e.duration) {
      detailLines.push(`${(e.distance / 1000).toFixed(1)} km  ·  ${fmtDur(e.duration)}`);
    }
    if (e.elevationGain && e.elevationGain > 0) {
      detailLines.push(`D+  ${e.elevationGain} m`);
    }
    if (e.activityType === 'cycling' && e.avgSpeed) {
      detailLines.push(`Vitesse  ${e.avgSpeed.toFixed(1)} km/h`);
    } else if (e.avgPace) {
      detailLines.push(`Allure  ${fmtPace(e.avgPace)} /km`);
    } else if (e.avgSpeed) {
      detailLines.push(`Vitesse  ${e.avgSpeed.toFixed(1)} km/h`);
    }
    if (e.avgHeartRate) {
      detailLines.push(`FC moy.  ${e.avgHeartRate} bpm`);
    }
    detailLines.push(`TRIMP  ${e.trimp.toFixed(0)}`);

    // Extra entries same day
    const extra = tooltip.entries.length > 1 ? `+${tooltip.entries.length - 1} autre(s) séance(s)` : null;

    const totalLines = 2 + detailLines.length + (extra ? 1 : 0);
    const TH = PAD * 2 + 13 + LINE_H + totalLines * LINE_H;

    const rawX = tooltip.svgX - TW / 2;
    const x = Math.min(Math.max(rawX, ML), VW - MR - TW);
    const rawY = tooltip.svgY - TH - 4;
    const y = Math.max(MT, rawY);

    return (
      <g style={{ pointerEvents: 'none' }}>
        <rect x={x} y={y} width={TW} height={TH}
          rx={5} ry={5}
          fill="var(--bg-secondary)" stroke="var(--border-color)" strokeWidth="0.75"
        />
        {/* Name */}
        <text x={x + PAD} y={y + PAD + 9} fontSize="9.5" fontWeight="700" fill="var(--text-primary)">
          {titleLine}
        </text>
        {/* Date + type */}
        <text x={x + PAD} y={y + PAD + 9 + LINE_H} fontSize="8" fill="var(--text-secondary)">
          {dateLine}
        </text>
        {/* Detail lines */}
        {detailLines.map((line, li) => (
          <text key={li} x={x + PAD} y={y + PAD + 9 + LINE_H * (2 + li)} fontSize="8" fill="var(--text-secondary)">
            {line}
          </text>
        ))}
        {/* Extra sessions */}
        {extra && (
          <text x={x + PAD} y={y + PAD + 9 + LINE_H * (2 + detailLines.length)} fontSize="7.5" fill="var(--text-tertiary)" fontStyle="italic">
            {extra}
          </text>
        )}
        {/* Connector line from tooltip to dot */}
        <line
          x1={tooltip.svgX} y1={y + TH}
          x2={tooltip.svgX} y2={tooltip.svgY - 5}
          stroke="var(--border-color)" strokeWidth="1"
          strokeDasharray="2,2"
        />
      </g>
    );
  };

  return (
    <div className="card animate-slide-up" id="nav-balance">
      <div className="panel-header">
        <h3 className="panel-title">
          <Activity size={18} style={{ color: "#a78bfa" }} />
          <span>Charge d'entraînement</span>
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
            {history.length} séance{history.length > 1 ? 's' : ''}
          </span>
          <button type="button" onClick={onClear} title="Effacer l'historique"
            style={{ background: "none", border: "none", cursor: "pointer",
              color: "var(--text-tertiary)", display: "flex", padding: "0.2rem" }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <KPI label="CTL — Forme physique" value={tsb.ctl.toFixed(1)} sub={ctlLbl} color={ctlColor} />
        <KPI label="ATL — Fatigue aiguë"  value={tsb.atl.toFixed(1)} sub={`${tsb.atl > tsb.ctl ? '↑' : '↓'} charge récente`} color="#f97316" />
        <KPI label="TSB — Forme du jour"  value={tsb.tsb > 0 ? `+${tsb.tsb.toFixed(1)}` : tsb.tsb.toFixed(1)} sub={tsbLbl} color={tsbColor} />
      </div>

      {/* SVG chart */}
      {n >= 2 && (
        <svg viewBox={`0 0 ${VW} ${VH}`}
          style={{ width: "100%", display: "block", overflow: "visible" }}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Grid */}
          {[0, 25, 50, 75, 100].filter(v => v >= minV && v <= maxV).map(v => (
            <g key={v}>
              <line x1={ML} y1={toY(v)} x2={VW - MR} y2={toY(v)} stroke="var(--border-color)" strokeWidth="0.5" />
              <text x={ML - 4} y={toY(v) + 4} textAnchor="end" fontSize="9" fill="var(--text-tertiary)">{v}</text>
            </g>
          ))}
          {/* Zero line */}
          <line x1={ML} y1={zeroY} x2={VW - MR} y2={zeroY} stroke="var(--border-color)" strokeWidth="1" strokeDasharray="3,3" />

          {/* CTL / ATL / TSB lines */}
          <path d={path('ctl')} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" />
          <path d={path('atl')} fill="none" stroke="#f97316" strokeWidth="2" strokeLinejoin="round" />
          <path d={path('tsb')} fill="none" stroke={tsbColor} strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="4,2" />

          {/* Dots row separator */}
          <line x1={ML} y1={dotsY - 8} x2={VW - MR} y2={dotsY - 8}
            stroke="var(--border-color)" strokeWidth="0.4" />

          {/* Session vertical lines + dots */}
          {trainingDots.map((d) => {
            const cx = toX(d.i);
            const isCycling = d.entries[0]?.activityType === 'cycling';
            const dotColor = isCycling ? '#34d399' : '#818cf8';
            const isActive = tooltip?.svgX === cx;
            return (
              <g key={d.date}>
                {/* Vertical guide line */}
                <line
                  x1={cx} y1={MT}
                  x2={cx} y2={dotsY - 9}
                  stroke={dotColor} strokeWidth="0.75"
                  strokeDasharray="2,3" strokeOpacity={isActive ? 0.7 : 0.3}
                />
                {/* Session dot */}
                <circle
                  cx={cx} cy={dotsY} r={isActive ? 5 : 4}
                  fill={dotColor}
                  stroke="var(--bg-secondary)" strokeWidth="1.5"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setTooltip({ entries: d.entries, svgX: cx, svgY: dotsY })}
                />
              </g>
            );
          })}

          {/* X labels */}
          {xLabels.map(({ i, label }) => (
            <text key={label + i} x={toX(i)} y={VH - 4} textAnchor="middle" fontSize="9" fill="var(--text-tertiary)">{label}</text>
          ))}

          {/* Tooltip — rendered last to appear on top */}
          {renderTooltip()}
        </svg>
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap", marginTop: "0.5rem" }}>
        {[
          { color: "#60a5fa", label: "CTL — Forme chronique (42j)" },
          { color: "#f97316", label: "ATL — Fatigue aiguë (7j)" },
          { color: tsbColor,  label: "TSB = CTL − ATL" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.72rem", color: "var(--text-tertiary)" }}>
            <div style={{ width: 20, height: 2, background: color, borderRadius: 1 }} />
            {label}
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.72rem", color: "var(--text-tertiary)" }}>
          <svg width="20" height="10" viewBox="0 0 20 10">
            <circle cx="5" cy="5" r="3.5" fill="#818cf8" stroke="var(--bg-secondary)" strokeWidth="1.5" />
            <circle cx="15" cy="5" r="3.5" fill="#34d399" stroke="var(--bg-secondary)" strokeWidth="1.5" />
          </svg>
          Course / Vélo
        </div>
      </div>

      {n < 14 && (
        <div style={{ fontSize: "0.71rem", color: "var(--text-tertiary)", textAlign: "center", marginTop: "0.75rem",
          borderTop: "1px solid var(--border-color)", paddingTop: "0.5rem" }}>
          Chargez plus de séances pour affiner la courbe CTL/ATL — elle devient significative après ~4 semaines.
        </div>
      )}
    </div>
  );
};
