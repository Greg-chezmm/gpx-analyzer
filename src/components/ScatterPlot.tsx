import React, { useMemo, useState, useEffect } from "react";
import { TrendingUp, Info, ChevronDown, ChevronUp } from "lucide-react";
import type { GPXTrackPoint } from "../utils/gpxParser";
import { karvonenBounds } from "../utils/gpxParser";

interface ScatterPlotProps {
  points: GPXTrackPoint[];
  fcMax: number;
  fcRest: number;
  activityType: 'running' | 'cycling' | 'unknown';
}

const ZONE_COLORS = ["#60a5fa", "#34d399", "#fbbf24", "#f97316", "#ef4444"];

function fmtPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const ScatterPlot: React.FC<ScatterPlotProps> = ({ points, fcMax, fcRest, activityType }) => {
  const bounds = useMemo(() => karvonenBounds(fcMax, fcRest), [fcMax, fcRest]);
  const [showHelp, setShowHelp] = useState(false);

  const isRunning = activityType !== 'cycling';

  const validPts = useMemo(
    () => points.filter(p => p.hr !== null && p.speed !== null && p.speed > 0.5),
    [points]
  );

  const hasPower = useMemo(
    () => !isRunning && validPts.some(p => p.power !== null && (p.power ?? 0) > 10),
    [isRunning, validPts]
  );

  // For cycling: default to power mode if power data is available
  const [powerMode, setPowerMode] = useState(false);
  useEffect(() => { setPowerMode(hasPower); }, [hasPower]);

  const usePower = !isRunning && hasPower && powerMode;

  if (validPts.length < 20) return null;

  const ratio = Math.ceil(validPts.length / 600);
  const sampled = ratio > 1 ? validPts.filter((_, i) => i % ratio === 0) : validPts;

  const hrArr = sampled.map(p => p.hr!);
  // Running: pace s/km. Cycling: power (W) or speed (km/h).
  const yArr = isRunning
    ? sampled.map(p => 1000 / p.speed!)            // s/km
    : usePower
      ? sampled.map(p => p.power ?? 0)             // watts
      : sampled.map(p => p.speed! * 3.6);          // km/h

  const hrLo = Math.max(Math.min(...hrArr) - 3, 0);
  const hrHi = Math.max(...hrArr) + 3;
  // For running, yLo = fastest pace (small s/km), yHi = slowest (large s/km)
  const yRaw = [...yArr];
  const yLo = Math.min(...yRaw) * (isRunning ? 0.98 : 1) - (isRunning ? 0 : 0.3);
  const yHi = Math.max(...yRaw) * (isRunning ? 1.02 : 1) + (isRunning ? 0 : 0.3);

  const W = 540, H = 300;
  const pad = { t: 16, r: 20, b: 44, l: 60 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;

  const xs = (hr: number) => pad.l + ((hr - hrLo) / (hrHi - hrLo)) * pw;
  // Running: INVERTED — fast pace (low s/km) at top, slow (high s/km) at bottom
  // Cycling: normal — high speed at top
  const ys = isRunning
    ? (v: number) => pad.t + ((v - yLo) / (yHi - yLo)) * ph
    : (v: number) => pad.t + ph - ((v - yLo) / (yHi - yLo)) * ph;

  const getZone = (hr: number) => {
    if (hr >= bounds[4]) return 4;
    if (hr >= bounds[3]) return 3;
    if (hr >= bounds[2]) return 2;
    if (hr >= bounds[1]) return 1;
    return 0;
  };

  // Linear regression on yArr
  const n    = hrArr.length;
  const mX   = hrArr.reduce((a, b) => a + b, 0) / n;
  const mY   = yArr.reduce((a, b) => a + b, 0) / n;
  const ssXX = hrArr.reduce((s, x) => s + (x - mX) ** 2, 0);
  const ssXY = hrArr.reduce((s, x, i) => s + (x - mX) * (yArr[i] - mY), 0);
  const ssYY = yArr.reduce((s, y) => s + (y - mY) ** 2, 0);
  const slope     = ssXX > 0 ? ssXY / ssXX : 0;
  const intercept = mY - slope * mX;
  const r2 = ssXX > 0 && ssYY > 0 ? (ssXY / Math.sqrt(ssXX * ssYY)) ** 2 : 0;

  const clamp = (v: number) => Math.max(yLo, Math.min(yHi, v));
  const tY1 = clamp(slope * hrLo + intercept);
  const tY2 = clamp(slope * hrHi + intercept);

  // X ticks (HR)
  const hrSpan = hrHi - hrLo;
  const hrStep = hrSpan > 60 ? 20 : hrSpan > 30 ? 10 : 5;
  const xTicks: number[] = [];
  for (let v = Math.ceil(hrLo / hrStep) * hrStep; v <= hrHi; v += hrStep) xTicks.push(v);

  // Y ticks
  const yTicks: number[] = [];
  if (isRunning) {
    const ySpan = yHi - yLo;
    const step = ySpan > 180 ? 60 : ySpan > 90 ? 30 : 15;
    for (let v = Math.ceil(yLo / step) * step; v <= yHi; v += step) yTicks.push(v);
  } else if (usePower) {
    const ySpan = yHi - yLo;
    const step = ySpan > 200 ? 50 : ySpan > 100 ? 25 : 10;
    for (let v = Math.ceil(yLo / step) * step; v <= yHi; v += step) yTicks.push(v);
  } else {
    const ySpan = yHi - yLo;
    const step = ySpan > 20 ? 10 : ySpan > 10 ? 5 : ySpan > 5 ? 2 : 1;
    for (let v = Math.ceil(yLo / step) * step; v <= yHi; v += step) yTicks.push(v);
  }

  const bands = [
    { lo: hrLo,      hi: bounds[1], z: 0 },
    { lo: bounds[1], hi: bounds[2], z: 1 },
    { lo: bounds[2], hi: bounds[3], z: 2 },
    { lo: bounds[3], hi: bounds[4], z: 3 },
    { lo: bounds[4], hi: hrHi,      z: 4 },
  ];

  const r2Label = r2 >= 0.7 ? "corrélation forte" : r2 >= 0.4 ? "corrélation modérée" : "corrélation faible";
  const yAxisLabel = isRunning ? "Allure (/km)" : usePower ? "Puissance (W)" : "Vitesse (km/h)";
  const title = isRunning ? "Allure vs Fréquence Cardiaque"
    : usePower ? "Puissance vs Fréquence Cardiaque"
    : "Vitesse vs Fréquence Cardiaque";

  return (
    <div className="card animate-slide-up">
      <div className="panel-header">
        <h3 className="panel-title">
          <TrendingUp size={18} style={{ color: "#60a5fa" }} />
          <span>{title}</span>
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {hasPower && (
            <button type="button" onClick={() => setPowerMode(v => !v)}
              style={{
                padding: "0.25rem 0.65rem", fontSize: "0.75rem", fontWeight: 700,
                border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)",
                background: powerMode ? "var(--accent-primary)" : "transparent",
                color: powerMode ? "#fff" : "var(--text-secondary)",
                cursor: "pointer", transition: "all 0.15s",
              }}>
              {powerMode ? "⚡ Puissance" : "🚴 Vitesse"}
            </button>
          )}
          <div style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", fontWeight: 600 }}>
            R² = {r2.toFixed(2)} · {r2Label}
          </div>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: "300px" }}>
          <rect x={pad.l} y={pad.t} width={pw} height={ph} fill="var(--bg-secondary)" rx="3" />

          {/* Zone bands */}
          {bands.map(({ lo, hi, z }) => {
            const x1 = Math.max(pad.l, xs(lo));
            const x2 = Math.min(pad.l + pw, xs(hi));
            if (x2 <= x1) return null;
            return (
              <rect key={z} x={x1} y={pad.t} width={x2 - x1} height={ph}
                fill={ZONE_COLORS[z]} fillOpacity={0.09} />
            );
          })}

          {/* Zone boundary dashes */}
          {bounds.slice(1).map((bnd, i) => {
            const x = xs(bnd);
            if (x <= pad.l || x >= pad.l + pw) return null;
            return (
              <line key={i} x1={x} y1={pad.t} x2={x} y2={pad.t + ph}
                stroke={ZONE_COLORS[i + 1]} strokeWidth={1} strokeOpacity={0.35} strokeDasharray="4 3" />
            );
          })}

          {/* Horizontal grid */}
          {yTicks.map(v => (
            <line key={v} x1={pad.l} y1={ys(v)} x2={pad.l + pw} y2={ys(v)}
              stroke="var(--border-color)" strokeOpacity={0.35} />
          ))}

          {/* Data points */}
          {sampled.map((pt, i) => (
            <circle key={i}
              cx={xs(pt.hr!)}
              cy={ys(isRunning ? 1000 / pt.speed! : pt.speed! * 3.6)}
              r={2.5} fill={ZONE_COLORS[getZone(pt.hr!)]} fillOpacity={0.6}
            />
          ))}

          {/* Trend line */}
          <line
            x1={xs(hrLo)} y1={ys(tY1)} x2={xs(hrHi)} y2={ys(tY2)}
            stroke="white" strokeWidth={1.5} strokeOpacity={0.55} strokeDasharray="6 3"
          />

          {/* X axis */}
          {xTicks.map(v => (
            <g key={v} transform={`translate(${xs(v)}, ${pad.t + ph})`}>
              <line y2={5} stroke="var(--border-color)" />
              <text y={17} textAnchor="middle" fontSize={10} fill="var(--text-tertiary)">{v}</text>
            </g>
          ))}
          <text x={pad.l + pw / 2} y={H - 2} textAnchor="middle"
            fontSize={11} fontWeight={600} fill="var(--text-secondary)">FC (bpm)</text>

          {/* Y axis */}
          {yTicks.map(v => (
            <g key={v} transform={`translate(${pad.l}, ${ys(v)})`}>
              <line x2={-5} stroke="var(--border-color)" />
              <text x={-8} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--text-tertiary)">
                {isRunning ? fmtPace(v) : v.toFixed(1)}
              </text>
            </g>
          ))}
          <text x={13} y={pad.t + ph / 2} textAnchor="middle"
            fontSize={11} fontWeight={600} fill="var(--text-secondary)"
            transform={`rotate(-90, 13, ${pad.t + ph / 2})`}>{yAxisLabel}</text>

          <rect x={pad.l} y={pad.t} width={pw} height={ph}
            fill="none" stroke="var(--border-color)" rx="3" />
        </svg>
      </div>

      {/* Zone legend */}
      <div style={{ display: "flex", gap: "0.5rem 1.25rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
        {["Z1", "Z2", "Z3", "Z4", "Z5"].map((z, i) => (
          <div key={z} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: ZONE_COLORS[i], flexShrink: 0 }} />
            <span style={{ color: ZONE_COLORS[i], fontWeight: 700 }}>{z}</span>
            <span>≥ {bounds[i]} bpm</span>
          </div>
        ))}
      </div>

      {/* Help toggle */}
      <button
        type="button"
        onClick={() => setShowHelp(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: "0.4rem",
          marginTop: "0.85rem", padding: "0.3rem 0",
          background: "none", border: "none", cursor: "pointer",
          fontSize: "0.78rem", color: "var(--text-tertiary)", fontWeight: 600,
        }}
      >
        <Info size={13} />
        <span>Comment lire ce graphique ?</span>
        {showHelp ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {showHelp && (
        <div style={{
          marginTop: "0.4rem", padding: "0.85rem 1rem",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-color)",
          background: "var(--bg-secondary)",
          fontSize: "0.8rem", color: "var(--text-secondary)",
          lineHeight: 1.65,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
            <div>
              <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>Chaque point</span>
              {" "}représente un instant de la séance. Sa position horizontale est la fréquence cardiaque, sa position verticale est{" "}
              {isRunning
                ? <><strong>l'allure (min/km)</strong> — <em>haut = allure rapide, bas = allure lente</em>.</>
                : <><strong>la vitesse (km/h)</strong> — <em>haut = vitesse élevée, bas = vitesse faible</em>.</>
              }
              {" "}La couleur indique la zone cardiaque (Karvonen).
            </div>
            <div>
              <span style={{ color: "white", fontWeight: 700 }}>La ligne pointillée blanche</span>
              {" "}est la tendance générale (régression linéaire).{" "}
              {isRunning
                ? "Une pente montante (↗) signifie que plus la FC augmente, plus l'allure est rapide — comportement normal d'un effort progressif."
                : "Une pente montante (↗) signifie que plus la FC augmente, plus la vitesse est élevée — comportement normal d'un effort progressif."
              }
            </div>
            <div>
              <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>Le R²</span>
              {" "}mesure la cohérence entre {isRunning ? "allure" : "vitesse"} et FC sur l'ensemble de la séance.
              {" "}<span style={{ color: "#34d399", fontWeight: 600 }}>R² ≥ 0,7</span> → effort régulier (endurance fondamentale).
              {" "}<span style={{ color: "#fbbf24", fontWeight: 600 }}>0,4–0,7</span> → allure variable, relief ou tempo.
              {" "}<span style={{ color: "#f97316", fontWeight: 600 }}>&lt; 0,4</span> → séance fractionnée ou terrain très irrégulier.
            </div>
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "0.5rem", color: "var(--text-tertiary)" }}>
              {isRunning
                ? <><strong style={{ color: "var(--text-secondary)" }}>Haut à gauche</strong> (allure rapide, FC basse) → très bonne efficacité aérobie.
                  {" "}<strong style={{ color: "var(--text-secondary)" }}>Bas à droite</strong> (allure lente, FC élevée) → fatigue, montée ou échauffement.</>
                : <><strong style={{ color: "var(--text-secondary)" }}>Haut à gauche</strong> (vitesse élevée, FC basse) → bonne efficacité aérobie.
                  {" "}<strong style={{ color: "var(--text-secondary)" }}>Bas à droite</strong> (vitesse faible, FC élevée) → fatigue, montée ou échauffement.</>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
