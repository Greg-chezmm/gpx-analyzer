import React, { useState } from "react";
import { Activity, Trash2, AlertTriangle, CheckCircle } from "lucide-react";
import type { TSBResult } from "../utils/trainingMetrics";
import type { TrainingEntry } from "../hooks/useTrainingHistory";

interface Props {
  tsb:     TSBResult;
  history: TrainingEntry[];
  onClear: () => void;
}

/**
 * Retourne le libellé et la couleur d'état selon le TSB (Training Stress Balance).
 * TSB > 10 = frais, < -30 = surmenage — seuils issus de la méthode Banister/PMC.
 */
function tsbLabel(tsb: number): { label: string; color: string } {
  if (tsb >  10) return { label: "Frais",     color: "#34d399" };
  if (tsb >   0) return { label: "Équilibré", color: "#60a5fa" };
  if (tsb > -15) return { label: "Chargé",    color: "#fbbf24" };
  if (tsb > -30) return { label: "Fatigué",   color: "#f97316" };
  return              { label: "Surmenage",   color: "#ef4444" };
}

/**
 * Retourne le libellé et la couleur de niveau de forme selon le CTL.
 * CTL (Chronic Training Load) : charge chronique sur 42 jours — proxy de la forme.
 */
function ctlLabel(ctl: number): { label: string; color: string } {
  if (ctl >= 80) return { label: "Élite",       color: "#a78bfa" };
  if (ctl >= 60) return { label: "Compétiteur", color: "#60a5fa" };
  if (ctl >= 40) return { label: "Entraîné",    color: "#34d399" };
  if (ctl >= 20) return { label: "Loisir",      color: "#fbbf24" };
  return              { label: "Débutant",      color: "#94a3b8" };
}

/** Tuile KPI numérique avec étiquette colorée. */
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

/** Formate une durée en secondes en h:mm ou m:ss. */
function fmtDur(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, '0')}`;
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

/** Formate une allure en s/km en "m:ss". */
function fmtPace(sPerKm: number): string {
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface TooltipState {
  index: number;
  svgX: number;
}

interface Alert {
  level: 'warning' | 'danger' | 'ok';
  message: string;
  detail: string;
}

/**
 * Calcule les alertes de charge d'entraînement à partir des métriques PMC.
 * Vérifie : TSB critique, ratio ATL/CTL (seuil 1.3/1.5), ramp rate CTL sur 7 jours (>7 pts),
 * et monotonie de Banister (indice > 2 = variété insuffisante).
 */
function computeAlerts(tsb: { atl: number; ctl: number; tsb: number; chartData: Array<{ trimp: number; ctl: number }> }): Alert[] {
  const alerts: Alert[] = [];

  // TSB critique : en dessous de -30 le risque de blessure/surentraînement est élevé
  if (tsb.tsb < -30) {
    alerts.push({ level: 'danger', message: 'Surmenage probable', detail: `TSB ${tsb.tsb.toFixed(0)} — repos avant toute séance intense` });
  } else if (tsb.tsb < -15) {
    alerts.push({ level: 'warning', message: 'Fatigue accumulée', detail: `TSB ${tsb.tsb.toFixed(0)} — surveiller les signes de surcharge` });
  }

  // Ratio ATL/CTL : au-delà de 1.3 la charge aiguë dépasse la capacité chronique
  if (tsb.ctl > 0) {
    const ratio = tsb.atl / tsb.ctl;
    if (ratio > 1.5) {
      alerts.push({ level: 'danger', message: 'Ratio ATL/CTL élevé', detail: `${ratio.toFixed(2)} — charge aiguë très supérieure à la forme chronique` });
    } else if (ratio > 1.3) {
      alerts.push({ level: 'warning', message: 'Charge aiguë importante', detail: `Ratio ATL/CTL ${ratio.toFixed(2)} — risque de blessure augmenté` });
    }
  }

  // Ramp rate : progression CTL > 7 points/semaine = augmentation trop rapide
  const data = tsb.chartData;
  if (data.length >= 8) {
    const ramp = (data[data.length - 1].ctl) - (data[data.length - 8].ctl);
    if (ramp > 7) {
      alerts.push({ level: 'warning', message: 'Progression CTL rapide', detail: `+${ramp.toFixed(1)} pts cette semaine — augmenter plus progressivement` });
    }
  }

  // Monotonie de Banister : moyenne TRIMP / écart-type sur 7 jours ; > 2 = manque de variation
  if (data.length >= 7) {
    const week = data.slice(-7).map(d => d.trimp);
    const mean = week.reduce((a, b) => a + b, 0) / 7;
    const sd = Math.sqrt(week.reduce((a, v) => a + (v - mean) ** 2, 0) / 7);
    const mono = sd > 0 ? mean / sd : 0;
    if (mono > 2) {
      alerts.push({ level: 'warning', message: 'Monotonie élevée', detail: `Indice ${mono.toFixed(1)} — variez l'intensité de vos séances` });
    }
  }

  return alerts;
}

/**
 * Panneau de charge d'entraînement — affiche les courbes CTL/ATL/TSB,
 * les alertes de surcharge et le détail inline des séances au survol.
 */
export const TrainingBalance: React.FC<Props> = ({ tsb, history, onClear }) => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [viewDays, setViewDays] = useState<30 | 90>(30);

  if (history.length === 0) return null;

  const alerts = computeAlerts(tsb);
  const { label: tsbLbl, color: tsbColor } = tsbLabel(tsb.tsb);
  const { label: ctlLbl, color: ctlColor } = ctlLabel(tsb.ctl);
  const data = tsb.chartData.slice(-viewDays);

  // Marges et dimensions du SVG en unités viewport
  const ML = 36, MT = 8, MB = 22, MR = 8;
  const VW = 560, VH = 140;
  const chartWidth  = VW - ML - MR;
  const chartHeight = VH - MT - MB - 12;
  const n = data.length;

  const allVals = data.flatMap(d => [d.ctl, d.atl, d.tsb]);
  const maxV = Math.max(...allVals, 10);
  const minV = Math.min(...allVals, -5);
  const valRange = maxV - minV || 1;

  /** Convertit un index de point en coordonnée X SVG. */
  const toX = (i: number) => ML + (n > 1 ? (i / (n - 1)) * chartWidth : chartWidth / 2);
  /** Convertit une valeur en coordonnée Y SVG (axe inversé). */
  const toY = (v: number) => MT + chartHeight - ((v - minV) / valRange) * chartHeight;
  const zeroY = toY(0);
  // Ligne de points de séances en bas du graphique
  const dotsY = VH - MB - 6;

  /** Construit la commande de tracé SVG pour une des trois courbes. */
  const path = (key: 'ctl' | 'atl' | 'tsb') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d[key]).toFixed(1)}`).join(' ');

  // Labels de l'axe X : un par mois (ou au premier point)
  const xLabels: { i: number; label: string }[] = [];
  data.forEach((d, i) => {
    if (d.date.slice(8) === '01' || i === 0) {
      const [, m] = d.date.split('-');
      const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
      xLabels.push({ i, label: months[parseInt(m, 10) - 1] });
    }
  });

  // Points de séances (jours avec TRIMP > 0) enrichis des entrées d'historique
  const trainingDots = data
    .map((d, i) => ({ ...d, i }))
    .filter(d => d.trimp > 0)
    .map(d => ({
      ...d,
      entries: history.filter(e => e.date === d.date),
    }));

  return (
    <div className="card animate-slide-up" id="nav-balance">
      <div className="panel-header">
        <h3 className="panel-title">
          <Activity size={18} style={{ color: "#a78bfa" }} />
          <span>Charge d'entraînement</span>
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {/* Toggle 1 mois / 3 mois */}
          <div style={{
            display: "flex", gap: "2px",
            background: "var(--bg-primary)", padding: "2px",
            borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)",
          }}>
            {([30, 90] as const).map(d => (
              <button key={d} type="button"
                onClick={() => { setViewDays(d); setTooltip(null); }}
                style={{
                  padding: "0.15rem 0.5rem", fontSize: "0.75rem", fontWeight: 600,
                  borderRadius: "calc(var(--radius-sm) - 2px)", border: "none", cursor: "pointer",
                  background: viewDays === d ? "var(--accent-primary)" : "transparent",
                  color: viewDays === d ? "#fff" : "var(--text-secondary)",
                  transition: "all 0.15s",
                }}
              >
                {d === 30 ? "1 mois" : "3 mois"}
              </button>
            ))}
          </div>
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

      {/* Alertes de surcharge */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
          {alerts.map((a, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
              padding: '0.6rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              background: a.level === 'danger' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
              border: `1px solid ${a.level === 'danger' ? '#ef444440' : '#f59e0b40'}`,
            }}>
              <AlertTriangle size={14} style={{ color: a.level === 'danger' ? '#ef4444' : '#f59e0b', flexShrink: 0, marginTop: '1px' }} />
              <div>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: a.level === 'danger' ? '#ef4444' : '#f59e0b' }}>
                  {a.message}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                  {a.detail}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Message positif si aucune alerte et CTL significatif */}
      {alerts.length === 0 && tsb.ctl > 5 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.45rem 0.85rem', marginBottom: '1rem',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(52,211,153,0.07)', border: '1px solid #34d39930',
          fontSize: '0.8rem', color: '#34d399', fontWeight: 600,
        }}>
          <CheckCircle size={13} />
          Charge équilibrée — aucun indicateur de surcharge détecté
        </div>
      )}

      {/* Tuiles KPI : CTL / ATL / TSB */}
      <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <KPI label="CTL — Forme physique" value={tsb.ctl.toFixed(1)} sub={ctlLbl} color={ctlColor} />
        <KPI label="ATL — Fatigue aiguë"  value={tsb.atl.toFixed(1)} sub={`${tsb.atl > tsb.ctl ? '↑' : '↓'} charge récente`} color="#f97316" />
        <KPI label="TSB — Forme du jour"  value={tsb.tsb > 0 ? `+${tsb.tsb.toFixed(1)}` : tsb.tsb.toFixed(1)} sub={tsbLbl} color={tsbColor} />
      </div>

      {/* Graphique SVG CTL/ATL/TSB */}
      {n >= 2 && (
        <svg viewBox={`0 0 ${VW} ${VH}`}
          style={{ width: "100%", display: "block", overflow: "visible" }}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Grille horizontale (valeurs 0, 25, 50, 75, 100) */}
          {[0, 25, 50, 75, 100].filter(v => v >= minV && v <= maxV).map(v => (
            <g key={v}>
              <line x1={ML} y1={toY(v)} x2={VW - MR} y2={toY(v)} stroke="var(--border-color)" strokeWidth="0.5" />
              <text x={ML - 4} y={toY(v) + 4} textAnchor="end" fontSize="9" fill="var(--text-tertiary)">{v}</text>
            </g>
          ))}
          {/* Ligne zéro (TSB = 0 = charge neutre) */}
          <line x1={ML} y1={zeroY} x2={VW - MR} y2={zeroY} stroke="var(--border-color)" strokeWidth="1" strokeDasharray="3,3" />

          {/* Courbes CTL (bleu), ATL (orange), TSB (couleur variable) */}
          <path d={path('ctl')} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" />
          <path d={path('atl')} fill="none" stroke="#f97316" strokeWidth="2" strokeLinejoin="round" />
          <path d={path('tsb')} fill="none" stroke={tsbColor} strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="4,2" />

          {/* Séparateur visuel avant la ligne de points de séances */}
          <line x1={ML} y1={dotsY - 8} x2={VW - MR} y2={dotsY - 8}
            stroke="var(--border-color)" strokeWidth="0.4" />

          {/* Points de séances et lignes verticales de guidage */}
          {trainingDots.map((d) => {
            const cx = toX(d.i);
            const hasMulti = d.entries.length > 1;
            const isCycling = !hasMulti && d.entries[0]?.activityType === 'cycling';
            // Violet = course, vert = vélo
            const dotColor = isCycling ? '#34d399' : '#818cf8';
            const isActive = tooltip?.index === d.i;
            const r = isActive ? 5 : 4;
            return (
              <g key={d.date}>
                {/* Ligne verticale de guidage — s'intensifie au survol */}
                <line
                  x1={cx} y1={MT}
                  x2={cx} y2={dotsY - 9}
                  stroke={dotColor} strokeWidth="0.75"
                  strokeDasharray="2,3" strokeOpacity={isActive ? 0.8 : 0.3}
                  style={{ pointerEvents: "none" }}
                />
                {/* Deux cercles décalés si plusieurs séances le même jour */}
                {hasMulti ? (
                  <>
                    <circle cx={cx - 2} cy={dotsY} r={r}
                      fill="#818cf8" stroke="var(--bg-secondary)" strokeWidth="1.5" style={{ pointerEvents: "none" }} />
                    <circle cx={cx + 2} cy={dotsY} r={r}
                      fill="#34d399" stroke="var(--bg-secondary)" strokeWidth="1.5" style={{ pointerEvents: "none" }} />
                  </>
                ) : (
                  <circle cx={cx} cy={dotsY} r={r}
                    fill={dotColor} stroke="var(--bg-secondary)" strokeWidth="1.5" style={{ pointerEvents: "none" }} />
                )}
              </g>
            );
          })}

          {/* Labels de l'axe X (mois) */}
          {xLabels.map(({ i, label }) => (
            <text key={label + i} x={toX(i)} y={VH - 4} textAnchor="middle" fontSize="9" fill="var(--text-tertiary)">{label}</text>
          ))}

          {/* Curseur de survol — ligne + points sur les 3 courbes, actif sur toute la largeur du graphique */}
          {tooltip && (() => {
            const hd = data[tooltip.index];
            if (!hd) return null;
            return (
              <g style={{ pointerEvents: "none" }}>
                <line x1={tooltip.svgX} y1={MT} x2={tooltip.svgX} y2={MT + chartHeight}
                  stroke="var(--text-tertiary)" strokeWidth="0.75" strokeDasharray="2,2" opacity={0.5} />
                <circle cx={tooltip.svgX} cy={toY(hd.ctl)} r={3} fill="#60a5fa" stroke="var(--bg-secondary)" strokeWidth="1.5" />
                <circle cx={tooltip.svgX} cy={toY(hd.atl)} r={3} fill="#f97316" stroke="var(--bg-secondary)" strokeWidth="1.5" />
                <circle cx={tooltip.svgX} cy={toY(hd.tsb)} r={3} fill={tsbColor} stroke="var(--bg-secondary)" strokeWidth="1.5" />
              </g>
            );
          })()}

          {/* Zone interactive transparente : capte le survol sur toute la largeur du graphique */}
          <rect
            x={ML} y={MT} width={chartWidth} height={VH - MT - MB}
            fill="transparent"
            onMouseMove={(e) => {
              const svg = e.currentTarget.ownerSVGElement;
              if (!svg) return;
              const rect = svg.getBoundingClientRect();
              const scale = VW / rect.width;
              const localX = (e.clientX - rect.left) * scale;
              const ratio = n > 1 ? (localX - ML) / chartWidth : 0;
              const index = Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
              setTooltip({ index, svgX: toX(index) });
            }}
          />
        </svg>
      )}

      {/* Détail inline — s'affiche sous le graphique au survol : valeurs CTL/ATL/TSB + séances du jour le cas échéant */}
      {tooltip && data[tooltip.index] && (() => {
        const hd = data[tooltip.index];
        const entries = history.filter(e => e.date === hd.date);
        const isMulti = entries.length > 1;
        const dateStr = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(hd.date));
        return (
          <div style={{
            marginTop: '0.5rem',
            padding: '8px 12px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            fontSize: '0.72rem',
            lineHeight: 1.5,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', marginBottom: entries.length > 0 ? '4px' : 0 }}>
              <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>
                {dateStr}{isMulti ? ` · ${entries.length} séances` : ''}
              </span>
              {/* Position fixe (ancrée à droite) : n'est jamais décalée par la longueur de la date/du nombre de séances */}
              <div style={{ display: 'flex', gap: '0.6rem', flexShrink: 0 }}>
                <span style={{ color: '#60a5fa', fontWeight: 600, minWidth: '3.6em', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>CTL {hd.ctl.toFixed(1)}</span>
                <span style={{ color: '#f97316', fontWeight: 600, minWidth: '3.6em', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>ATL {hd.atl.toFixed(1)}</span>
                <span style={{ color: tsbLabel(hd.tsb).color, fontWeight: 600, minWidth: '3.9em', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>TSB {hd.tsb > 0 ? `+${hd.tsb.toFixed(1)}` : hd.tsb.toFixed(1)}</span>
              </div>
            </div>
            {entries.map((e, idx) => {
              const typeLabel = e.activityType === 'cycling' ? '🚴 Vélo' : e.activityType === 'running' ? '🏃 Course' : '';
              const details: string[] = [];
              if (e.distance && e.duration) details.push(`${(e.distance / 1000).toFixed(1)} km · ${fmtDur(e.duration)}`);
              if (e.elevationGain && e.elevationGain > 0) details.push(`D+ ${Math.round(e.elevationGain)} m`);
              if (e.activityType === 'cycling' && e.avgSpeed) details.push(`Vitesse ${e.avgSpeed.toFixed(1)} km/h`);
              else if (e.avgPace) details.push(`Allure ${fmtPace(e.avgPace)} /km`);
              else if (e.avgSpeed) details.push(`Vitesse ${e.avgSpeed.toFixed(1)} km/h`);
              if (e.avgHeartRate) details.push(`FC moy. ${e.avgHeartRate} bpm`);
              details.push(`TRIMP ${e.trimp.toFixed(0)}`);
              return (
                <React.Fragment key={idx}>
                  {idx > 0 && <div style={{ borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />}
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {e.name.length > 40 ? e.name.slice(0, 38) + '…' : e.name}
                    </span>
                    {typeLabel && <span style={{ color: 'var(--text-tertiary)' }}>{typeLabel}</span>}
                    {details.map((d, li) => (
                      <span key={li} style={{ color: 'var(--text-secondary)' }}>{d}</span>
                    ))}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        );
      })()}

      {/* Légende des courbes */}
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

      {/* Avertissement si l'historique est trop court pour être fiable */}
      {n < 14 && (
        <div style={{ fontSize: "0.71rem", color: "var(--text-tertiary)", textAlign: "center", marginTop: "0.75rem",
          borderTop: "1px solid var(--border-color)", paddingTop: "0.5rem" }}>
          Chargez plus de séances pour affiner la courbe CTL/ATL — elle devient significative après ~4 semaines.
        </div>
      )}
    </div>
  );
};
