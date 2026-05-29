import React, { useState, useMemo, useRef } from "react";
import type { GPXTrackPoint } from "../utils/gpxParser";
import { TrendingUp, Eye } from "lucide-react";

interface ChartViewerProps {
  points: GPXTrackPoint[];
  hoveredPointIndex: number | null;
  onHoverPointChange: (index: number | null) => void;
  hasHeartRate: boolean;
  hasCadence: boolean;
  activityType: 'running' | 'cycling' | 'unknown';
}

type ChartType = "elevation" | "speed" | "pace" | "hr" | "cad" | "dual";

interface ChartParams {
  getValue: (pt: GPXTrackPoint) => number;
  label: string;
  unit: string;
  color: string;
  colorClass: string;
  yMin: number;
  yMax: number;
  invertY?: boolean;
  formatY?: (v: number) => string;
}

function fmtPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const ChartViewer: React.FC<ChartViewerProps> = ({
  points,
  hoveredPointIndex,
  onHoverPointChange,
  hasHeartRate,
  hasCadence,
  activityType,
}) => {
  const [activeTab, setActiveTab] = useState<ChartType>("elevation");
  const svgRef = useRef<SVGSVGElement>(null);

  const svgWidth = 600;
  const svgHeight = 260;
  const padding = { top: 20, right: 20, bottom: 40, left: 55 };
  const plotWidth = svgWidth - padding.left - padding.right;
  const plotHeight = svgHeight - padding.top - padding.bottom;

  const limits = useMemo(() => {
    if (points.length === 0) return { maxDist: 0, minEle: 0, maxEle: 0, maxSpeed: 0, minHr: 0, maxHr: 0, maxCad: 0, minPace: 180, maxPace: 420 };

    const maxDist = points[points.length - 1].distFromStart;

    const eles = points.map(p => p.ele).filter((e): e is number => e !== null);
    const minEle = eles.length > 0 ? Math.min(...eles) : 0;
    const maxEle = eles.length > 0 ? Math.max(...eles) : 100;

    const speeds = points.map(p => p.speed).filter((s): s is number => s !== null);
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 5;

    const hrs = points.map(p => p.hr).filter((h): h is number => h !== null);
    const minHr = hrs.length > 0 ? Math.min(...hrs) : 60;
    const maxHr = hrs.length > 0 ? Math.max(...hrs) : 200;

    const cads = points.map(p => p.cad).filter((c): c is number => c !== null);
    const maxCad = cads.length > 0 ? Math.max(...cads) : 120;

    const validSpeeds = points.filter(p => p.speed && p.speed > 0.5);
    const paces = validSpeeds.map(p => 1000 / p.speed!);
    const minPace = paces.length > 0 ? Math.max(60, Math.min(...paces) - 5) : 180;
    const maxPace = paces.length > 0 ? Math.min(900, Math.max(...paces) + 15) : 420;

    return {
      maxDist,
      minEle: Math.max(0, minEle - 10),
      maxEle: maxEle + 10,
      maxSpeed: maxSpeed * 1.1,
      minHr: Math.max(40, minHr - 10),
      maxHr: maxHr + 10,
      maxCad: maxCad + 10,
      minPace,
      maxPace,
    };
  }, [points]);

  const chartParams = useMemo((): ChartParams => {
    switch (activeTab) {
      case "speed":
        return {
          getValue: (pt) => (pt.speed || 0) * 3.6,
          label: "Vitesse", unit: " km/h",
          color: "var(--color-speed)", colorClass: "speed",
          yMin: 0, yMax: limits.maxSpeed * 3.6,
        };
      case "pace":
        return {
          getValue: (pt) => (pt.speed && pt.speed > 0.2) ? 1000 / pt.speed : limits.maxPace,
          label: "Allure", unit: " /km",
          color: "var(--color-speed)", colorClass: "speed",
          yMin: limits.minPace, yMax: limits.maxPace,
          invertY: true,
          formatY: fmtPace,
        };
      case "hr":
        return {
          getValue: (pt) => pt.hr || 0,
          label: "Fréquence Cardiaque", unit: " bpm",
          color: "var(--color-hr)", colorClass: "hr",
          yMin: limits.minHr, yMax: limits.maxHr,
        };
      case "cad": {
        const cadMult = activityType === 'cycling' ? 1 : 2;
        return {
          getValue: (pt) => (pt.cad || 0) * cadMult,
          label: activityType === 'cycling' ? "Cadence" : "Foulée",
          unit: activityType === 'cycling' ? " rpm" : " ppm",
          color: "var(--color-cad)", colorClass: "cad",
          yMin: 0, yMax: limits.maxCad * cadMult,
        };
      }
      case "dual":
        // Dual uses its own rendering; return HR params as placeholder
        return {
          getValue: (pt) => pt.hr || 0,
          label: "Allure + FC", unit: "",
          color: "var(--color-hr)", colorClass: "hr",
          yMin: limits.minHr, yMax: limits.maxHr,
        };
      case "elevation":
      default:
        return {
          getValue: (pt) => pt.ele ?? 0,
          label: "Altitude", unit: " m",
          color: "var(--color-ele)", colorClass: "ele",
          yMin: limits.minEle, yMax: limits.maxEle,
        };
    }
  }, [activeTab, limits, activityType]);

  const getX = (dist: number) => {
    if (limits.maxDist === 0) return padding.left;
    return padding.left + (dist / limits.maxDist) * plotWidth;
  };

  const getY = (val: number, params: ChartParams = chartParams) => {
    const range = params.yMax - params.yMin;
    if (range === 0) return padding.top + plotHeight / 2;
    const pct = (val - params.yMin) / range;
    if (params.invertY) return padding.top + pct * plotHeight;
    return padding.top + plotHeight - pct * plotHeight;
  };

  const chartPaths = useMemo(() => {
    if (points.length === 0 || activeTab === 'dual') return { line: "", area: "" };

    const samplingInterval = Math.max(1, Math.floor(points.length / 300));
    const pathPoints: [number, number][] = [];

    for (let i = 0; i < points.length; i += samplingInterval) {
      const pt = points[i];
      // Skip null-elevation points so they don't draw a line down to y=0
      if (activeTab === 'elevation' && pt.ele === null) continue;
      pathPoints.push([getX(pt.distFromStart), getY(chartParams.getValue(pt))]);
    }
    if (points.length > 1 && (points.length - 1) % samplingInterval !== 0) {
      const last = points[points.length - 1];
      if (!(activeTab === 'elevation' && last.ele === null)) {
        pathPoints.push([getX(last.distFromStart), getY(chartParams.getValue(last))]);
      }
    }
    if (pathPoints.length === 0) return { line: "", area: "" };

    const linePath = pathPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
    const firstX = pathPoints[0][0];
    const lastX = pathPoints[pathPoints.length - 1][0];
    const baseline = padding.top + plotHeight;
    return { line: linePath, area: `${linePath} L ${lastX} ${baseline} L ${firstX} ${baseline} Z` };
  }, [points, chartParams, limits, plotHeight, activeTab]);

  // Dual-axis data (Allure + FC)
  const dualData = useMemo(() => {
    if (activeTab !== 'dual' || !hasHeartRate || points.length === 0) return null;

    const paceParams: ChartParams = {
      getValue: (pt) => (pt.speed && pt.speed > 0.2) ? 1000 / pt.speed : limits.maxPace,
      label: "Allure", unit: " /km",
      color: "var(--color-speed)", colorClass: "speed",
      yMin: limits.minPace, yMax: limits.maxPace,
      invertY: true, formatY: fmtPace,
    };
    const hrParams: ChartParams = {
      getValue: (pt) => pt.hr || 0,
      label: "FC", unit: " bpm",
      color: "var(--color-hr)", colorClass: "hr",
      yMin: limits.minHr, yMax: limits.maxHr,
    };

    const getYP = (v: number) => getY(v, paceParams);
    const getYH = (v: number) => getY(v, hrParams);

    const stride = Math.max(1, Math.floor(points.length / 300));
    const pacePts: [number, number][] = [];
    const hrPts: [number, number][] = [];

    for (let i = 0; i < points.length; i += stride) {
      const pt = points[i];
      pacePts.push([getX(pt.distFromStart), getYP(paceParams.getValue(pt))]);
      if (pt.hr) hrPts.push([getX(pt.distFromStart), getYH(pt.hr)]);
    }

    const buildLine = (pts: [number, number][]) =>
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
    const buildArea = (pts: [number, number][]) => {
      if (pts.length === 0) return '';
      const line = buildLine(pts);
      const base = padding.top + plotHeight;
      return `${line} L ${pts[pts.length - 1][0]} ${base} L ${pts[0][0]} ${base} Z`;
    };

    const step4 = (min: number, max: number) =>
      Array.from({ length: 5 }, (_, i) => min + (max - min) * i / 4);

    return {
      pacePaths: { line: buildLine(pacePts), area: buildArea(pacePts) },
      hrPaths: { line: buildLine(hrPts), area: buildArea(hrPts) },
      paceTicks: step4(limits.minPace, limits.maxPace).map(v => ({ y: getYP(v), label: fmtPace(v) })),
      hrTicks: step4(limits.minHr, limits.maxHr).map(v => ({ y: getYH(v), label: String(Math.round(v)) })),
      getYP, getYH, paceParams, hrParams,
    };
  }, [activeTab, points, hasHeartRate, limits]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    let clientX = 0;
    if ("touches" in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
    } else {
      clientX = e.clientX;
    }
    const mouseX = clientX - rect.left;
    if (mouseX >= padding.left && mouseX <= padding.left + plotWidth) {
      const pct = (mouseX - padding.left) / plotWidth;
      const targetDist = pct * limits.maxDist;
      let low = 0, high = points.length - 1, closestIdx = 0;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (points[mid].distFromStart < targetDist) low = mid + 1;
        else high = mid - 1;
      }
      closestIdx = low;
      if (closestIdx >= points.length) closestIdx = points.length - 1;
      if (closestIdx > 0) {
        const d1 = Math.abs(points[closestIdx].distFromStart - targetDist);
        const d2 = Math.abs(points[closestIdx - 1].distFromStart - targetDist);
        if (d2 < d1) closestIdx--;
      }
      onHoverPointChange(closestIdx);
    }
  };

  const handleMouseLeave = () => { onHoverPointChange(null); };

  const yTicks = useMemo(() => {
    if (activeTab === 'dual') return [];
    const { yMin, yMax, formatY } = chartParams;
    const step = (yMax - yMin) / 4;
    return Array.from({ length: 5 }, (_, i) => {
      const val = yMin + step * i;
      return { value: val, y: getY(val), label: formatY ? formatY(val) : val.toFixed(0) };
    });
  }, [chartParams, limits, activeTab]);

  const xTicks = useMemo(() => {
    const step = limits.maxDist / 5;
    return Array.from({ length: 6 }, (_, i) => ({ distance: step * i, x: getX(step * i) }));
  }, [limits]);

  const hoveredPoint = hoveredPointIndex !== null ? points[hoveredPointIndex] : null;

  return (
    <div className="card animate-slide-up" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="panel-header" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <h3 className="panel-title">
          <TrendingUp size={18} style={{ color: "var(--accent-secondary)" }} />
          <span>📈 Profils d'Entraînement</span>
        </h3>

        <div className="chart-tabs">
          <button type="button" className={`chart-tab ${activeTab === "elevation" ? "active" : ""}`} onClick={() => setActiveTab("elevation")}>Altitude</button>
          <button type="button" className={`chart-tab ${activeTab === "speed" ? "active" : ""}`} onClick={() => setActiveTab("speed")}>Vitesse</button>
          {activityType !== 'cycling' && (
            <button type="button" className={`chart-tab ${activeTab === "pace" ? "active" : ""}`} onClick={() => setActiveTab("pace")} style={{ color: activeTab === "pace" ? undefined : "var(--color-speed)" }}>Allure</button>
          )}
          {hasHeartRate && (
            <button type="button" className={`chart-tab ${activeTab === "hr" ? "active" : ""}`} onClick={() => setActiveTab("hr")} style={{ color: activeTab === "hr" ? undefined : "var(--color-hr)" }}>Freq. Cardiaque</button>
          )}
          {hasCadence && (
            <button type="button" className={`chart-tab ${activeTab === "cad" ? "active" : ""}`} onClick={() => setActiveTab("cad")} style={{ color: activeTab === "cad" ? undefined : "var(--color-cad)" }}>
              {activityType === 'cycling' ? 'Cadence (rpm)' : 'Foulée (ppm)'}
            </button>
          )}
          {hasHeartRate && activityType !== 'cycling' && (
            <button type="button" className={`chart-tab ${activeTab === "dual" ? "active" : ""}`} onClick={() => setActiveTab("dual")}>Allure + FC</button>
          )}
        </div>
      </div>

      <div className="chart-container">
        {points.length > 0 && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="svg-chart"
            onMouseMove={handleMouseMove}
            onTouchMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onTouchEnd={handleMouseLeave}
            style={{ overflow: "visible" }}
          >
            <defs>
              <linearGradient id="ele-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-ele)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--color-ele)" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="speed-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-speed)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--color-speed)" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="hr-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-hr)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--color-hr)" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="cad-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-cad)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--color-cad)" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Y axis — single series */}
            {activeTab !== 'dual' && yTicks.map((tick, idx) => (
              <g key={`y-${idx}`}>
                <line x1={padding.left} y1={tick.y} x2={padding.left + plotWidth} y2={tick.y} className="chart-grid-line" />
                <text x={padding.left - 8} y={tick.y + 4} className="chart-text" textAnchor="end">{tick.label}</text>
              </g>
            ))}

            {/* Y axes — dual */}
            {activeTab === 'dual' && dualData && (
              <>
                {dualData.paceTicks.map((tick, i) => (
                  <g key={`dp-${i}`}>
                    <line x1={padding.left} y1={tick.y} x2={padding.left + plotWidth} y2={tick.y} className="chart-grid-line" />
                    <text x={padding.left - 8} y={tick.y + 4} className="chart-text" textAnchor="end" fill="var(--color-speed)">{tick.label}</text>
                  </g>
                ))}
                {dualData.hrTicks.map((tick, i) => (
                  <text key={`dh-${i}`} x={padding.left + plotWidth + 6} y={tick.y + 4} className="chart-text" textAnchor="start" fill="var(--color-hr)">{tick.label}</text>
                ))}
              </>
            )}

            {/* X axis */}
            {xTicks.map((tick, idx) => (
              <g key={`x-${idx}`}>
                <line x1={tick.x} y1={padding.top} x2={tick.x} y2={padding.top + plotHeight} className="chart-grid-line" />
                <text x={tick.x} y={padding.top + plotHeight + 18} className="chart-text" textAnchor="middle">{(tick.distance / 1000).toFixed(1)}k</text>
              </g>
            ))}

            <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotHeight} className="chart-axis-line" />
            <line x1={padding.left} y1={padding.top + plotHeight} x2={padding.left + plotWidth} y2={padding.top + plotHeight} className="chart-axis-line" />
            <text x={padding.left + plotWidth / 2} y={padding.top + plotHeight + 35} className="chart-text" textAnchor="middle" style={{ fontWeight: 600 }}>Distance (km)</text>

            {/* Single-series chart */}
            {activeTab !== 'dual' && (
              <>
                <path d={chartPaths.area} className={`chart-area-${chartParams.colorClass}`} />
                <path d={chartPaths.line} className={`chart-line-${chartParams.colorClass}`} />
              </>
            )}

            {/* Dual-axis chart */}
            {activeTab === 'dual' && dualData && (
              <>
                <path d={dualData.hrPaths.area} className="chart-area-hr" opacity={0.5} />
                <path d={dualData.hrPaths.line} className="chart-line-hr" />
                <path d={dualData.pacePaths.line} className="chart-line-speed" strokeDasharray="6 3" />
              </>
            )}

            {/* Hover overlay */}
            {hoveredPoint && (() => {
              const cx = getX(hoveredPoint.distFromStart);
              let cy: number;
              if (activeTab === 'dual' && dualData) {
                cy = dualData.getYH(hoveredPoint.hr ?? limits.maxHr);
              } else {
                cy = getY(chartParams.getValue(hoveredPoint));
              }

              const BOX_W = 148, BOX_H = 84;
              const boxX = cx > padding.left + plotWidth / 2 ? cx - BOX_W - 10 : cx + 10;
              const boxY = Math.max(padding.top + 2, Math.min(cy - 20, padding.top + plotHeight - BOX_H - 2));

              let valLabel: string;
              if (activeTab === 'dual') {
                const paceStr = hoveredPoint.speed && hoveredPoint.speed > 0.2
                  ? fmtPace(1000 / hoveredPoint.speed) + ' /km'
                  : '--';
                valLabel = `${paceStr}  ❤ ${hoveredPoint.hr ?? '--'} bpm`;
              } else if (activeTab === 'pace') {
                valLabel = hoveredPoint.speed && hoveredPoint.speed > 0.1
                  ? fmtPace(1000 / hoveredPoint.speed) + ' /km'
                  : '--';
              } else if (activeTab === 'speed' && activityType !== 'cycling') {
                const s = hoveredPoint.speed ?? 0;
                valLabel = s ? `${fmtPace(1000 / s)} /km` : '--';
              } else {
                const val = chartParams.getValue(hoveredPoint);
                valLabel = `${val.toFixed(activeTab === 'hr' ? 0 : 1)}${chartParams.unit}`;
              }

              // Build extra info line (pace + grade, when relevant)
              const showPaceLine = activityType !== 'cycling' && activeTab !== 'pace' && activeTab !== 'dual' && hoveredPoint.speed && hoveredPoint.speed > 0.2;
              const paceExtra = showPaceLine ? fmtPace(1000 / hoveredPoint.speed!) + ' /km' : null;
              const gradeExtra = hoveredPoint.grade !== null ? `${hoveredPoint.grade > 0 ? '+' : ''}${hoveredPoint.grade}%` : null;

              return (
                <g>
                  <line x1={cx} y1={padding.top} x2={cx} y2={padding.top + plotHeight} className="chart-tooltip-line" />
                  <circle cx={cx} cy={cy} r={6} fill={chartParams.color} stroke="#ffffff" strokeWidth={2} />
                  <rect x={boxX} y={boxY} width={BOX_W} height={BOX_H} rx={5}
                    fill="var(--bg-primary)" fillOpacity={0.96} stroke="var(--border-color)" strokeWidth={1} />
                  <text x={boxX + 8} y={boxY + 15} fontSize={10} fill="var(--text-tertiary)" fontWeight={600}>
                    {(hoveredPoint.distFromStart / 1000).toFixed(2)} km
                  </text>
                  <text x={boxX + 8} y={boxY + 36} fontSize={activeTab === 'dual' ? 11 : 15} fontWeight={800} fill={chartParams.color}>
                    {valLabel}
                  </text>
                  {hoveredPoint.ele !== null && activeTab !== 'elevation' && (
                    <text x={boxX + 8} y={boxY + 54} fontSize={10} fill="var(--color-ele)" fontWeight={600}>
                      ⛰ {Math.round(hoveredPoint.ele)}m
                      {hoveredPoint.hr != null && activeTab !== 'hr' && activeTab !== 'dual' && ` · ❤ ${hoveredPoint.hr} bpm`}
                    </text>
                  )}
                  {hoveredPoint.ele === null && hoveredPoint.hr != null && activeTab !== 'hr' && activeTab !== 'dual' && (
                    <text x={boxX + 8} y={boxY + 54} fontSize={10} fill="var(--color-hr)" fontWeight={600}>
                      ❤ {hoveredPoint.hr} bpm
                    </text>
                  )}
                  {(paceExtra || gradeExtra) && (
                    <text x={boxX + 8} y={boxY + 72} fontSize={10} fill="var(--text-secondary)" fontWeight={600}>
                      {[paceExtra && `🏃 ${paceExtra}`, gradeExtra && `📐 ${gradeExtra}`].filter(Boolean).join('  ')}
                    </text>
                  )}
                </g>
              );
            })()}
          </svg>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{
        marginTop: "1.25rem", minHeight: "44px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        backgroundColor: "var(--bg-primary)", padding: "0.5rem 1rem",
        borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", fontSize: "0.85rem",
      }}>
        {hoveredPoint ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Eye size={14} style={{ color: "var(--text-secondary)" }} />
              <span style={{ color: "var(--text-secondary)" }}>Point sélectionné :</span>
              <strong style={{ color: "var(--text-primary)" }}>{(hoveredPoint.distFromStart / 1000).toFixed(2)} km</strong>
            </div>
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
              <span style={{ color: "var(--color-ele)", fontWeight: "600" }}>
                ⛰️ {hoveredPoint.ele !== null ? `${Math.round(hoveredPoint.ele)}m` : "--"}
              </span>
              {activityType !== 'cycling' && hoveredPoint.speed !== null && hoveredPoint.speed > 0 ? (
                <span style={{ color: "var(--color-speed)", fontWeight: "600" }}>
                  {(() => { const m = Math.floor(1000/hoveredPoint.speed/60); const s = Math.round((1000/hoveredPoint.speed)%60); return `🏃 ${m}:${String(s).padStart(2,'0')} /km`; })()}
                </span>
              ) : (
                <span style={{ color: "var(--color-speed)", fontWeight: "600" }}>
                  ⚡ {hoveredPoint.speed !== null ? `${(hoveredPoint.speed * 3.6).toFixed(1)} km/h` : "--"}
                </span>
              )}
              {hasHeartRate && (
                <span style={{ color: "var(--color-hr)", fontWeight: "600" }}>❤️ {hoveredPoint.hr !== null ? `${hoveredPoint.hr} bpm` : "--"}</span>
              )}
              {hoveredPoint.grade !== null && (
                <span style={{ color: "var(--color-ele)", fontWeight: "600" }}>📐 {hoveredPoint.grade > 0 ? "+" : ""}{hoveredPoint.grade}%</span>
              )}
            </div>
          </>
        ) : (
          <div style={{ color: "var(--text-tertiary)", textAlign: "center", width: "100%", fontStyle: "italic" }}>
            Survolez le graphique ou le tracé de la carte pour inspecter les données point par point
          </div>
        )}
      </div>
    </div>
  );
};
