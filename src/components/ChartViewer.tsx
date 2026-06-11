import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { GPXTrackPoint } from "../utils/gpxParser";
import { TrendingUp, Eye, Maximize2, Minimize2, ZoomIn } from "lucide-react";
import { formatPace } from "./SplitsTable";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChartViewerProps {
  points: GPXTrackPoint[];
  hoveredPointIndex: number | null;
  onHoverPointChange: (index: number | null) => void;
  hasHeartRate: boolean;
  hasCadence: boolean;
  hasPower?: boolean;
  activityType: 'running' | 'cycling' | 'unknown';
  fcMax?: number;
  fcRest?: number;
}

type ChartType = "elevation" | "speed" | "pace" | "hr" | "cad" | "dual" | "cardiac" | "power";

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

// ─── Constantes ───────────────────────────────────────────────────────────────

/**
 * Référence de réserve cardiaque utilisée pour normaliser l'allure cardiaque.
 * Ramène toutes les allures au niveau d'effort d'un run "à 65 % de HRR",
 * ce qui correspond à une zone aérobie modérée (Z2 Karvonen).
 */
const CARDIAC_REF_HRR = 0.65;

/** Déplacement minimum (px SVG) avant de déclencher une sélection de zoom par glisser. */
const DRAG_THRESHOLD_PX = 8;

/** Largeur de la bulle de survol SVG (px coordonnées viewBox). */
const TOOLTIP_W = 148;
/** Hauteur de la bulle de survol SVG (px coordonnées viewBox). */
const TOOLTIP_H = 84;

// ─── Fonctions pures (hors composant) ────────────────────────────────────────

/**
 * Calcule les bornes min/max de chaque métrique à partir des points enrichis.
 * Les marges (+10 / ×1.1 / P5–P95) évitent que les valeurs extrêmes
 * ne soient coupées par les bords du graphique.
 */
function computeLimits(points: GPXTrackPoint[], fcMax: number, fcRest: number) {
  if (points.length === 0) {
    return {
      maxDist: 0, minEle: 0, maxEle: 0, maxSpeed: 0,
      minHr: 0, maxHr: 0, maxCad: 0,
      minPace: 180, maxPace: 420,
      minCardiacPace: 60, maxCardiacPace: 900,
      maxPower: 400,
    };
  }

  const maxDist = points[points.length - 1].distFromStart;

  const eles   = points.map(p => p.ele).filter((e): e is number => e !== null);
  const minEle = eles.length > 0 ? Math.min(...eles) : 0;
  const maxEle = eles.length > 0 ? Math.max(...eles) : 100;

  const speeds  = points.map(p => p.speed).filter((s): s is number => s !== null);
  const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 5;

  const hrs   = points.map(p => p.hr).filter((h): h is number => h !== null);
  const minHr = hrs.length > 0 ? Math.min(...hrs) : 60;
  const maxHr = hrs.length > 0 ? Math.max(...hrs) : 200;

  const cads  = points.map(p => p.cad).filter((c): c is number => c !== null);
  const maxCad = cads.length > 0 ? Math.max(...cads) : 120;

  const powers  = points.map(p => p.power).filter((w): w is number => w !== null && w > 0);
  const maxPower = powers.length > 0 ? Math.max(...powers) * 1.1 : 400;

  // Bornes d'allure : on exclut les points quasi-arrêtés (< 0.5 m/s)
  const validSpeeds = points.filter(p => p.speed && p.speed > 0.5);
  const paces = validSpeeds.map(p => 1000 / p.speed!);
  const minPace = paces.length > 0 ? Math.max(60,  Math.min(...paces) -  5) : 180;
  const maxPace = paces.length > 0 ? Math.min(900, Math.max(...paces) + 15) : 420;

  // Bornes d'allure cardiaque — P5 / P95 pour rejeter les outliers HRR extrêmes.
  // HRR < 20 % : effort trop faible, la formule amplifie les bruits FC.
  // HRR > 99 % : effort maximal, le ratio devient instable.
  const reserve = fcMax - fcRest;
  const cardiacPaces = reserve > 0
    ? points
        .filter(p => p.hr && p.speed && p.speed > 0.5)
        .map(p => {
          const hrr = (p.hr! - fcRest) / reserve;
          if (hrr < 0.2 || hrr > 0.99) return null;
          return (1000 / p.speed!) * (CARDIAC_REF_HRR / hrr);
        })
        .filter((v): v is number => v !== null && v > 30 && v < 1800)
    : [];
  const cpSorted = [...cardiacPaces].sort((a, b) => a - b);
  const cpLow  = cpSorted.length > 0 ? cpSorted[Math.floor(cpSorted.length * 0.05)] : 60;
  const cpHigh = cpSorted.length > 0 ? cpSorted[Math.floor(cpSorted.length * 0.95)] : 900;

  return {
    maxDist,
    minEle:  Math.max(0, minEle - 10),
    maxEle:  maxEle + 10,
    maxSpeed: maxSpeed * 1.1,
    minHr:   Math.max(40, minHr - 10),
    maxHr:   maxHr + 10,
    maxCad:  maxCad + 10,
    minPace, maxPace,
    minCardiacPace: Math.max(30, cpLow  -  5),
    maxCardiacPace: Math.min(1800, cpHigh + 15),
    maxPower,
  };
}

type Limits = ReturnType<typeof computeLimits>;

/**
 * Retourne les paramètres de rendu (getter valeur, couleur, échelle Y) pour l'onglet actif.
 * Le mode "dual" est géré séparément dans dualData.
 */
function getChartParams(
  tab: ChartType,
  limits: Limits,
  activityType: string,
  fcMax: number,
  fcRest: number,
): ChartParams {
  switch (tab) {
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
        invertY: true, formatY: formatPace,
      };
    case "hr":
      return {
        getValue: (pt) => pt.hr || 0,
        label: "Fréquence Cardiaque", unit: " bpm",
        color: "var(--color-hr)", colorClass: "hr",
        yMin: limits.minHr, yMax: limits.maxHr,
      };
    case "cad": {
      // La montre enregistre la cadence d'une jambe (pas/min).
      // Pour la course, la foulée = cadence × 2 (les deux jambes).
      const cadMult = activityType === 'cycling' ? 1 : 2;
      return {
        getValue: (pt) => (pt.cad || 0) * cadMult,
        label: activityType === 'cycling' ? "Cadence" : "Foulée",
        unit:  activityType === 'cycling' ? " rpm" : " ppm",
        color: "var(--color-cad)", colorClass: "cad",
        yMin: 0, yMax: limits.maxCad * cadMult,
      };
    }
    case "cardiac": {
      const reserve = Math.max(1, fcMax - fcRest);
      return {
        getValue: (pt) => {
          if (!pt.hr || !pt.speed || pt.speed < 0.3) return limits.maxCardiacPace;
          const hrr = (pt.hr - fcRest) / reserve;
          if (hrr < 0.2) return limits.maxCardiacPace;
          return (1000 / pt.speed) * (CARDIAC_REF_HRR / hrr);
        },
        label: "Allure cardiaque", unit: " /km",
        color: "var(--color-cardiac)", colorClass: "cardiac",
        yMin: limits.minCardiacPace, yMax: limits.maxCardiacPace,
        invertY: true, formatY: formatPace,
      };
    }
    case "power":
      return {
        getValue: (pt) => pt.power ?? 0,
        label: "Puissance", unit: " W",
        color: "var(--color-power)", colorClass: "power",
        yMin: 0, yMax: limits.maxPower,
      };
    case "dual":
      return {
        getValue: (pt) => pt.hr || 0,
        label: activityType === 'cycling' ? "Vitesse + FC" : "Allure + FC", unit: "",
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
}

/**
 * Génère 5 valeurs régulièrement espacées entre min et max.
 * Utilisé pour les graduations des axes Y dans le mode dual.
 */
function rangeTicks(min: number, max: number): number[] {
  return Array.from({ length: 5 }, (_, i) => min + (max - min) * i / 4);
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Visualisation SVG des profils d'entraînement (altitude, allure, FC, cadence, puissance).
 *
 * Fonctionnalités :
 * - Onglets par métrique, adaptatifs selon le type d'activité et les données disponibles.
 * - Zoom par sélection glisser–relâcher, réinitialisation au double-clic.
 * - Mode plein écran (Maximize2/Minimize2) avec sampling augmenté à 600 pts.
 * - Survol synchronisé avec la carte et les autres graphiques via hoveredPointIndex.
 */
export const ChartViewer: React.FC<ChartViewerProps> = ({
  points,
  hoveredPointIndex,
  onHoverPointChange,
  hasHeartRate,
  hasCadence,
  hasPower = false,
  activityType,
  fcMax = 195,
  fcRest = 52,
}) => {
  const defaultTab = (type: typeof activityType): ChartType =>
    type === 'cycling' ? 'speed' : type === 'running' ? 'pace' : 'elevation';

  const [activeTab, setActiveTab] = useState<ChartType>(() => defaultTab(activityType));
  const [expanded,  setExpanded]  = useState(false);
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [selBox,    setSelBox]    = useState<{ x1: number; x2: number } | null>(null);
  const dragAnchorX = useRef<number | null>(null);
  const svgRef      = useRef<SVGSVGElement>(null);

  // Dimensions SVG — le plotHeight conditionne les useMemo yTicks et dualData
  const svgWidth  = 600;
  const svgHeight = expanded ? 480 : 260;
  const padding   = { top: 20, right: 20, bottom: 40, left: 55 };
  const plotWidth  = svgWidth  - padding.left - padding.right;
  const plotHeight = svgHeight - padding.top  - padding.bottom;

  // Réinitialise zoom et onglet actif à chaque changement d'activité ou de type
  useEffect(() => {
    setZoomRange(null);
    setSelBox(null);
    dragAnchorX.current = null;
    setActiveTab(defaultTab(activityType));
  }, [points, activityType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fermeture du mode plein écran avec Échap
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const limits = useMemo(
    () => computeLimits(points, fcMax, fcRest),
    [points, fcMax, fcRest],
  );

  const chartParams = useMemo(
    () => getChartParams(activeTab, limits, activityType, fcMax, fcRest),
    [activeTab, limits, activityType, fcMax, fcRest],
  );

  /** Convertit une distance (m) en coordonnée X SVG, en tenant compte du zoom actif. */
  const getX = useCallback((dist: number) => {
    const [zStart, zEnd] = zoomRange ?? [0, limits.maxDist];
    const range = zEnd - zStart;
    if (range === 0 || limits.maxDist === 0) return padding.left;
    return padding.left + ((dist - zStart) / range) * plotWidth;
  }, [zoomRange, limits.maxDist, plotWidth]);

  /** Convertit une valeur métrique en coordonnée Y SVG (respecte l'inversion de l'axe allure). */
  const getY = (val: number, params: ChartParams = chartParams) => {
    const range = params.yMax - params.yMin;
    if (range === 0) return padding.top + plotHeight / 2;
    const pct = (val - params.yMin) / range;
    if (params.invertY) return padding.top + pct * plotHeight;
    return padding.top + plotHeight - pct * plotHeight;
  };

  // Construit le path SVG (ligne + aire) à partir des points visibles, sous-échantillonnés
  const chartPaths = useMemo(() => {
    if (points.length === 0 || activeTab === 'dual') return { line: "", area: "" };

    const [zStart, zEnd] = zoomRange ?? [0, limits.maxDist];
    const visiblePts = zoomRange
      ? points.filter(p => p.distFromStart >= zStart && p.distFromStart <= zEnd)
      : points;

    const maxSamples = expanded ? 600 : 300;
    const stride = Math.max(1, Math.floor(visiblePts.length / maxSamples));
    const pathPoints: [number, number][] = [];

    for (let i = 0; i < visiblePts.length; i += stride) {
      const pt = visiblePts[i];
      if (activeTab === 'elevation' && pt.ele === null) continue;
      // Sauter les points sans FC/vitesse pour l'allure cardiaque (évite les plongeons)
      if (activeTab === 'cardiac' && (!pt.hr || !pt.speed || pt.speed < 0.3)) continue;
      pathPoints.push([getX(pt.distFromStart), getY(chartParams.getValue(pt))]);
    }

    // Toujours inclure le dernier point visible pour éviter un tracé tronqué
    if (visiblePts.length > 1) {
      const last = visiblePts[visiblePts.length - 1];
      if (!(activeTab === 'elevation' && last.ele === null) &&
          !(activeTab === 'cardiac' && (!last.hr || !last.speed || last.speed < 0.3))) {
        const lastCoord: [number, number] = [getX(last.distFromStart), getY(chartParams.getValue(last))];
        const prev = pathPoints[pathPoints.length - 1];
        if (!prev || prev[0] !== lastCoord[0]) pathPoints.push(lastCoord);
      }
    }
    if (pathPoints.length === 0) return { line: "", area: "" };

    const linePath = pathPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
    const firstX   = pathPoints[0][0];
    const lastX    = pathPoints[pathPoints.length - 1][0];
    const baseline = padding.top + plotHeight;
    return { line: linePath, area: `${linePath} L ${lastX} ${baseline} L ${firstX} ${baseline} Z` };
  }, [points, chartParams, limits, plotHeight, activeTab, zoomRange, expanded, getX]);

  // Données pour le mode dual (Allure+FC ou Vitesse+FC) : deux axes Y indépendants
  const dualData = useMemo(() => {
    if (activeTab !== 'dual' || !hasHeartRate || points.length === 0) return null;

    const isCyclingDual = activityType === 'cycling';
    const primaryParams: ChartParams = isCyclingDual ? {
      getValue: (pt) => (pt.speed || 0) * 3.6,
      label: "Vitesse", unit: " km/h",
      color: "var(--color-speed)", colorClass: "speed",
      yMin: 0, yMax: limits.maxSpeed * 3.6,
    } : {
      getValue: (pt) => (pt.speed && pt.speed > 0.2) ? 1000 / pt.speed : limits.maxPace,
      label: "Allure", unit: " /km",
      color: "var(--color-speed)", colorClass: "speed",
      yMin: limits.minPace, yMax: limits.maxPace,
      invertY: true, formatY: formatPace,
    };
    const hrParams: ChartParams = {
      getValue: (pt) => pt.hr || 0,
      label: "FC", unit: " bpm",
      color: "var(--color-hr)", colorClass: "hr",
      yMin: limits.minHr, yMax: limits.maxHr,
    };

    const getYP = (v: number) => getY(v, primaryParams);
    const getYH = (v: number) => getY(v, hrParams);

    const [zStart, zEnd] = zoomRange ?? [0, limits.maxDist];
    const visiblePts = zoomRange
      ? points.filter(p => p.distFromStart >= zStart && p.distFromStart <= zEnd)
      : points;
    const stride = Math.max(1, Math.floor(visiblePts.length / (expanded ? 600 : 300)));
    const primaryPts: [number, number][] = [];
    const hrPts:      [number, number][] = [];

    for (let i = 0; i < visiblePts.length; i += stride) {
      const pt = visiblePts[i];
      primaryPts.push([getX(pt.distFromStart), getYP(primaryParams.getValue(pt))]);
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

    const primaryTicks = isCyclingDual
      ? rangeTicks(0, limits.maxSpeed * 3.6).map(v => ({ y: getYP(v), label: `${v.toFixed(0)}` }))
      : rangeTicks(limits.minPace, limits.maxPace).map(v => ({ y: getYP(v), label: formatPace(v) }));

    return {
      pacePaths:  { line: buildLine(primaryPts), area: buildArea(primaryPts) },
      hrPaths:    { line: buildLine(hrPts),      area: buildArea(hrPts) },
      paceTicks:  primaryTicks,
      hrTicks:    rangeTicks(limits.minHr, limits.maxHr).map(v => ({ y: getYH(v), label: String(Math.round(v)) })),
      getYP, getYH, primaryParams, hrParams, isCyclingDual,
    };
  }, [activeTab, activityType, points, hasHeartRate, limits, plotHeight, zoomRange, expanded, getX]);

  // ── Interactions souris / tactile ──────────────────────────────────────────

  /** Convertit une coordonnée cliente en unités SVG (compense la mise à l'échelle viewBox). */
  const toSvgX = (clientX: number, rect: DOMRect) =>
    (clientX - rect.left) * (svgWidth / rect.width);

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const svgX = toSvgX(e.clientX, svgRef.current.getBoundingClientRect());
    if (svgX >= padding.left && svgX <= padding.left + plotWidth) {
      dragAnchorX.current = svgX;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    let rawClientX = 0;
    if ("touches" in e) {
      if (e.touches.length === 0) return;
      rawClientX = e.touches[0].clientX;
    } else {
      rawClientX = e.clientX;
    }
    const svgX = toSvgX(rawClientX, rect);

    // Drag actif — mise à jour du rectangle de sélection (souris uniquement)
    if (!("touches" in e) && dragAnchorX.current !== null) {
      if (Math.abs(svgX - dragAnchorX.current) > DRAG_THRESHOLD_PX) {
        const x1 = Math.max(padding.left, Math.min(padding.left + plotWidth, Math.min(dragAnchorX.current, svgX)));
        const x2 = Math.max(padding.left, Math.min(padding.left + plotWidth, Math.max(dragAnchorX.current, svgX)));
        setSelBox({ x1, x2 });
        return;
      }
    }

    // Survol normal — recherche dichotomique du point le plus proche en distance
    if (svgX >= padding.left && svgX <= padding.left + plotWidth) {
      const pct = (svgX - padding.left) / plotWidth;
      const [zStart, zEnd] = zoomRange ?? [0, limits.maxDist];
      const targetDist = zStart + pct * (zEnd - zStart);
      let low = 0, high = points.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (points[mid].distFromStart < targetDist) low = mid + 1;
        else high = mid - 1;
      }
      let closestIdx = Math.min(low, points.length - 1);
      if (closestIdx > 0) {
        const d1 = Math.abs(points[closestIdx    ].distFromStart - targetDist);
        const d2 = Math.abs(points[closestIdx - 1].distFromStart - targetDist);
        if (d2 < d1) closestIdx--;
      }
      onHoverPointChange(closestIdx);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragAnchorX.current === null) return;
    if (!svgRef.current) { dragAnchorX.current = null; setSelBox(null); return; }
    const svgX   = toSvgX(e.clientX, svgRef.current.getBoundingClientRect());
    const anchor = dragAnchorX.current;
    dragAnchorX.current = null;

    if (selBox && Math.abs(svgX - anchor) > DRAG_THRESHOLD_PX) {
      const pct1 = (Math.min(anchor, svgX) - padding.left) / plotWidth;
      const pct2 = (Math.max(anchor, svgX) - padding.left) / plotWidth;
      const [zStart, zEnd] = zoomRange ?? [0, limits.maxDist];
      const range = zEnd - zStart;
      const d1 = zStart + Math.max(0, pct1) * range;
      const d2 = zStart + Math.min(1, pct2) * range;
      if (d2 - d1 > 50) setZoomRange([d1, d2]);
    }
    setSelBox(null);
  };

  const handleMouseLeave = () => {
    dragAnchorX.current = null;
    setSelBox(null);
    onHoverPointChange(null);
  };

  const handleDblClick = () => setZoomRange(null);

  // ── Graduations des axes ───────────────────────────────────────────────────

  const yTicks = useMemo(() => {
    if (activeTab === 'dual') return [];
    const { yMin, yMax, formatY } = chartParams;
    const step = (yMax - yMin) / 4;
    return Array.from({ length: 5 }, (_, i) => {
      const val = yMin + step * i;
      return { value: val, y: getY(val), label: formatY ? formatY(val) : val.toFixed(0) };
    });
  }, [chartParams, limits, activeTab, plotHeight]);

  const xTicks = useMemo(() => {
    const [zStart, zEnd] = zoomRange ?? [0, limits.maxDist];
    const range = zEnd - zStart;
    const step  = range / 5;
    return Array.from({ length: 6 }, (_, i) => {
      const dist = zStart + step * i;
      return { distance: dist, x: getX(dist) };
    });
  }, [limits, zoomRange, getX]);

  const hoveredPoint = hoveredPointIndex !== null ? points[hoveredPointIndex] : null;

  // ── Bulle de survol ────────────────────────────────────────────────────────

  /**
   * Construit le contenu de la bulle de survol SVG.
   * Retourne null si le point est hors de la zone de tracé visible.
   */
  const renderHoverTooltip = () => {
    if (!hoveredPoint || selBox) return null;
    const cx = getX(hoveredPoint.distFromStart);
    if (cx < padding.left || cx > padding.left + plotWidth) return null;

    const cy = activeTab === 'dual' && dualData
      ? dualData.getYH(hoveredPoint.hr ?? limits.maxHr)
      : getY(chartParams.getValue(hoveredPoint));

    // Positionne la bulle à gauche du curseur si on est dans la moitié droite du graphique
    const boxX = cx > padding.left + plotWidth / 2 ? cx - TOOLTIP_W - 10 : cx + 10;
    const boxY = Math.max(padding.top + 2, Math.min(cy - 20, padding.top + plotHeight - TOOLTIP_H - 2));

    // Libellé principal selon l'onglet actif
    let valLabel: string;
    if (activeTab === 'dual') {
      if (activityType === 'cycling') {
        const speedStr = hoveredPoint.speed ? `${(hoveredPoint.speed * 3.6).toFixed(1)} km/h` : '--';
        valLabel = `${speedStr}  ❤ ${hoveredPoint.hr ?? '--'} bpm`;
      } else {
        const paceStr = hoveredPoint.speed && hoveredPoint.speed > 0.2
          ? formatPace(1000 / hoveredPoint.speed) + ' /km'
          : '--';
        valLabel = `${paceStr}  ❤ ${hoveredPoint.hr ?? '--'} bpm`;
      }
    } else if (activeTab === 'power') {
      valLabel = hoveredPoint.power !== null ? `${hoveredPoint.power} W` : '--';
    } else if (activeTab === 'pace') {
      valLabel = hoveredPoint.speed && hoveredPoint.speed > 0.1
        ? formatPace(1000 / hoveredPoint.speed) + ' /km'
        : '--';
    } else if (activeTab === 'cardiac') {
      if (hoveredPoint.hr && hoveredPoint.speed && hoveredPoint.speed > 0.3) {
        const hrr = (hoveredPoint.hr - fcRest) / Math.max(1, fcMax - fcRest);
        valLabel = hrr >= 0.2 ? formatPace((1000 / hoveredPoint.speed) * (CARDIAC_REF_HRR / hrr)) + ' /km' : '--';
      } else {
        valLabel = '--';
      }
    } else if (activeTab === 'speed' && activityType !== 'cycling') {
      const s = hoveredPoint.speed ?? 0;
      valLabel = s ? `${formatPace(1000 / s)} /km` : '--';
    } else {
      const val = chartParams.getValue(hoveredPoint);
      valLabel = `${val.toFixed(activeTab === 'hr' ? 0 : 1)}${chartParams.unit}`;
    }

    // Ligne secondaire : allure (si on n'est pas déjà sur l'onglet allure)
    const showPaceLine = activityType !== 'cycling'
      && activeTab !== 'pace' && activeTab !== 'dual'
      && activeTab !== 'cardiac' && activeTab !== 'power'
      && hoveredPoint.speed && hoveredPoint.speed > 0.2;
    const paceExtra  = showPaceLine ? formatPace(1000 / hoveredPoint.speed!) + ' /km' : null;
    const gradeExtra = hoveredPoint.grade !== null
      ? `${hoveredPoint.grade > 0 ? '+' : ''}${hoveredPoint.grade}%`
      : null;

    return (
      <g>
        <line x1={cx} y1={padding.top} x2={cx} y2={padding.top + plotHeight} className="chart-tooltip-line" />
        <circle cx={cx} cy={cy} r={6} fill={chartParams.color} stroke="#ffffff" strokeWidth={2} />
        <rect x={boxX} y={boxY} width={TOOLTIP_W} height={TOOLTIP_H} rx={5}
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
  };

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <>
      {expanded && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1199, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
          onClick={() => setExpanded(false)}
        />
      )}
      <div className="card animate-slide-up" style={{
        display: "flex", flexDirection: "column", height: "100%",
        ...(expanded ? {
          position: 'fixed', inset: '0.75rem', zIndex: 1200,
          height: 'auto', boxShadow: 'var(--shadow-xl)',
        } : {}),
      }}>
        {/* En-tête : titre + bouton zoom actif + bouton plein écran + onglets */}
        <div className="panel-header" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
          <h3 className="panel-title">
            <TrendingUp size={18} style={{ color: "var(--accent-secondary)" }} />
            <span>📈 Profils d'Entraînement</span>
          </h3>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
            {zoomRange && (
              <button type="button" onClick={() => setZoomRange(null)}
                title="Réinitialiser le zoom (ou double-clic sur le graphique)"
                style={{
                  display: "flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.3rem 0.6rem", fontSize: "0.78rem", fontWeight: 600,
                  background: "color-mix(in srgb, var(--accent-primary) 10%, transparent)",
                  border: "1px solid var(--accent-primary)", borderRadius: "var(--radius-sm)",
                  color: "var(--accent-primary)", cursor: "pointer",
                }}
              >
                <ZoomIn size={12} />
                {(zoomRange[0] / 1000).toFixed(1)}–{(zoomRange[1] / 1000).toFixed(1)} km ✕
              </button>
            )}
            <button type="button" onClick={() => setExpanded(e => !e)}
              title={expanded ? 'Réduire' : 'Agrandir'}
              style={{
                background: 'none', border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)', padding: '0.3rem 0.4rem',
                cursor: 'pointer', color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center',
              }}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>

          {/* Onglets — masqués si la donnée n'est pas disponible */}
          <div className="chart-tabs">
            <button type="button" className={`chart-tab ${activeTab === "elevation" ? "active" : ""}`} onClick={() => setActiveTab("elevation")}>Altitude</button>
            {activityType === 'cycling' ? (
              <button type="button" className={`chart-tab ${activeTab === "speed" ? "active" : ""}`} onClick={() => setActiveTab("speed")}>Vitesse</button>
            ) : (
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
            {hasHeartRate && (
              <button type="button" className={`chart-tab ${activeTab === "dual" ? "active" : ""}`} onClick={() => setActiveTab("dual")}>
                {activityType === 'cycling' ? 'Vitesse + FC' : 'Allure + FC'}
              </button>
            )}
            {hasHeartRate && activityType !== 'cycling' && (
              <button type="button" className={`chart-tab ${activeTab === "cardiac" ? "active" : ""}`} onClick={() => setActiveTab("cardiac")} style={{ color: activeTab === "cardiac" ? undefined : "var(--color-cardiac)" }}>Allure cardiaque</button>
            )}
            {hasPower && activityType === 'cycling' && (
              <button type="button" className={`chart-tab ${activeTab === "power" ? "active" : ""}`} onClick={() => setActiveTab("power")} style={{ color: activeTab === "power" ? undefined : "var(--color-power)" }}>Puissance</button>
            )}
          </div>
        </div>

        {/* Zone SVG — axes, tracés, bulle de survol */}
        <div className="chart-container">
          {points.length > 0 && (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="svg-chart"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onTouchMove={handleMouseMove}
              onTouchEnd={handleMouseLeave}
              onDoubleClick={handleDblClick}
              style={{ overflow: "visible", cursor: selBox ? "col-resize" : "crosshair" }}
            >
              {/* Dégradés de remplissage (un par couleur métrique) */}
              <defs>
                <clipPath id="chart-clip">
                  <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} />
                </clipPath>
                {["ele", "speed", "hr", "cad", "cardiac", "power"].map(name => (
                  <linearGradient key={name} id={`${name}-gradient`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={`var(--color-${name})`} stopOpacity={name === "cardiac" ? 0.35 : 0.4} />
                    <stop offset="100%" stopColor={`var(--color-${name})`} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>

              {/* Axe Y — mode simple */}
              {activeTab !== 'dual' && yTicks.map((tick, idx) => (
                <g key={`y-${idx}`}>
                  <line x1={padding.left} y1={tick.y} x2={padding.left + plotWidth} y2={tick.y} className="chart-grid-line" />
                  <text x={padding.left - 8} y={tick.y + 4} className="chart-text" textAnchor="end">{tick.label}</text>
                </g>
              ))}

              {/* Axe Y — mode dual (allure/vitesse à gauche, FC à droite) */}
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

              {/* Axe X — distance en km */}
              {xTicks.map((tick, idx) => (
                <g key={`x-${idx}`}>
                  <line x1={tick.x} y1={padding.top} x2={tick.x} y2={padding.top + plotHeight} className="chart-grid-line" />
                  <text x={tick.x} y={padding.top + plotHeight + 18} className="chart-text" textAnchor="middle">{(tick.distance / 1000).toFixed(1)}k</text>
                </g>
              ))}
              <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotHeight} className="chart-axis-line" />
              <line x1={padding.left} y1={padding.top + plotHeight} x2={padding.left + plotWidth} y2={padding.top + plotHeight} className="chart-axis-line" />
              <text x={padding.left + plotWidth / 2} y={padding.top + plotHeight + 35} className="chart-text" textAnchor="middle" style={{ fontWeight: 600 }}>Distance (km)</text>

              {/* Tracés (clippés pour ne pas déborder des axes) */}
              {activeTab !== 'dual' && (
                <g clipPath="url(#chart-clip)">
                  <path d={chartPaths.area} className={`chart-area-${chartParams.colorClass}`} />
                  <path d={chartPaths.line} className={`chart-line-${chartParams.colorClass}`} />
                </g>
              )}
              {activeTab === 'dual' && dualData && (
                <g clipPath="url(#chart-clip)">
                  <path d={dualData.hrPaths.area}   className="chart-area-hr" opacity={0.5} />
                  <path d={dualData.hrPaths.line}   className="chart-line-hr" />
                  <path d={dualData.pacePaths.line} className="chart-line-speed" strokeDasharray="6 3" />
                </g>
              )}

              {/* Rectangle de sélection lors d'un glisser-zoomer */}
              {selBox && (
                <rect
                  x={selBox.x1} y={padding.top}
                  width={selBox.x2 - selBox.x1} height={plotHeight}
                  fill="var(--accent-primary)" fillOpacity={0.15}
                  stroke="var(--accent-primary)" strokeWidth={1} strokeOpacity={0.5}
                />
              )}

              {/* Bulle de survol */}
              {renderHoverTooltip()}
            </svg>
          )}
        </div>

        {/* Barre d'état en bas : métriques du point survolé ou aide contextuelle */}
        <div style={{
          marginTop: "1.25rem", minHeight: "44px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          backgroundColor: "var(--bg-primary)", padding: "0.5rem 1rem",
          borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", fontSize: "0.85rem",
        }}>
          {hoveredPoint && !selBox ? (
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
                    🏃 {formatPace(1000 / hoveredPoint.speed)} /km
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
              {selBox
                ? "Relâchez pour zoomer sur la sélection"
                : "Glissez pour zoomer · Double-clic pour réinitialiser · Survolez pour inspecter"}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
