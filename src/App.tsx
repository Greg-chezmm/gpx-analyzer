import { useState, useMemo, useRef } from "react";
import {
  parseGPX, calculateSplits, detectIntervals, parseSuuntoWindows,
  detectClimbs, classifySession, calcCardiacDrift,
  parseSuuntoBaroSamples, enrichWithBaroAlt,
  calcTRIMP, calcNormalizedPower, estimateVO2max,
  type GPXActivity, type GPXLap, type SuuntoSessionHeader, type BaroSample,
} from "./utils/gpxParser";
import { parseFIT } from "./utils/fitParser";
import { generateSampleGPX } from "./utils/sampleGPX";
import { useUserSettings } from "./hooks/useUserSettings";
import { useTheme } from "./hooks/useTheme";
import { Dropzone } from "./components/Dropzone";
import { MetricCard } from "./components/MetricCard";
import { ActivityMap } from "./components/ActivityMap";
import { ChartViewer } from "./components/ChartViewer";
import { SplitsTable, formatDuration, formatPace } from "./components/SplitsTable";
import { HeartRateZones } from "./components/HeartRateZones";
import { IntervalAnalysis } from "./components/IntervalAnalysis";
import { LapTable } from "./components/LapTable";
import { ClimbAnalysis } from "./components/ClimbAnalysis";
import { CardiacDrift } from "./components/CardiacDrift";
import { ScatterPlot } from "./components/ScatterPlot";
import { TrainingLoad } from "./components/TrainingLoad";
import { PowerMetrics } from "./components/PowerMetrics";
import { VO2maxEstimate } from "./components/VO2maxEstimate";
import { VDOTPredictor } from "./components/VDOTPredictor";
import { SplitsBars } from "./components/SplitsBars";
import { FloatingNav } from "./components/FloatingNav";
import { AISummaryModal } from "./components/AISummary";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { generateSummary } from "./utils/generateSummary";

import {
  Activity, Timer, TrendingUp, Heart, Trash2, Map,
  Calendar, Gauge, Layers, Sun, Moon, Loader2, Sparkles,
} from "lucide-react";

const SPLIT_OPTIONS = [
  { value: 500,   label: "500m" },
  { value: 1000,  label: "1 km" },
  { value: 2000,  label: "2 km" },
  { value: 5000,  label: "5 km" },
  { value: 10000, label: "10 km" },
];

function App() {
  const { fcMax, setFcMax, fcRest, setFcRest, vma, setVma, ftp, setFtp, weight, setWeight, birthYear, setBirthYear } = useUserSettings();
  const { isDark, toggleTheme } = useTheme();

  const [activity, setActivity] = useState<GPXActivity | null>(null);
  const [laps, setLaps] = useState<GPXLap[] | null>(null);
  const [suuntoHeader, setSuuntoHeader] = useState<SuuntoSessionHeader | null>(null);
  const [baroSamples, setBaroSamples] = useState<BaroSample[]>([]);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [splitDistance, setSplitDistance] = useState(1000);
  const [isLoading, setIsLoading] = useState(false);
  const [showAISummary, setShowAISummary] = useState(false);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  // Enrich GPS elevation with barometric altitude when JSON is loaded
  const enrichedActivity = useMemo(
    () => (activity && baroSamples.length > 0 ? enrichWithBaroAlt(activity, baroSamples) : activity),
    [activity, baroSamples]
  );

  const splits = useMemo(
    () => (enrichedActivity ? calculateSplits(enrichedActivity, splitDistance) : []),
    [enrichedActivity, splitDistance]
  );

  const intervals = useMemo(
    () => (enrichedActivity ? detectIntervals(enrichedActivity) : null),
    [enrichedActivity]
  );

  const climbs = useMemo(
    () => (enrichedActivity ? detectClimbs(enrichedActivity) : []),
    [enrichedActivity]
  );

  const session = useMemo(
    () => (enrichedActivity ? classifySession(enrichedActivity.points, fcMax, fcRest, vma) : null),
    [enrichedActivity, fcMax, fcRest, vma]
  );

  const drift = useMemo(
    () => (enrichedActivity ? calcCardiacDrift(enrichedActivity) : null),
    [enrichedActivity]
  );

  const trimp = useMemo(
    () => (enrichedActivity ? calcTRIMP(enrichedActivity.points, fcMax, fcRest) : null),
    [enrichedActivity, fcMax, fcRest]
  );

  const normalizedPower = useMemo(
    () => (enrichedActivity ? calcNormalizedPower(enrichedActivity.points) : null),
    [enrichedActivity]
  );

  const vo2maxEst = useMemo(
    () => (enrichedActivity ? estimateVO2max(enrichedActivity, fcMax, fcRest) : null),
    [enrichedActivity, fcMax, fcRest]
  );

  const handleActivityLoaded = (data: string | ArrayBuffer, name: string) => {
    const cleanName = name.replace(/\.[^/.]+$/, "");
    const isFit = name.toLowerCase().endsWith(".fit");
    setIsLoading(true);
    requestAnimationFrame(() => setTimeout(async () => {
      try {
        const parsed = isFit && data instanceof ArrayBuffer
          ? await parseFIT(data, cleanName)
          : parseGPX(data as string, cleanName);
        setActivity(parsed);
        setLaps(null);
        setSuuntoHeader(null);
        setBaroSamples([]);
        setFileName(name);
        setHoveredPointIndex(null);
        setSplitDistance(1000);
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Erreur de chargement du fichier.");
      }
      setIsLoading(false);
    }, 30));
  };

  const handleJsonLoaded = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const { laps: parsed, header } = parseSuuntoWindows(text);
        const baro = parseSuuntoBaroSamples(text);
        setLaps(parsed);
        setSuuntoHeader(header);
        setBaroSamples(baro);
        if (header.fcMaxBpm && header.fcMaxBpm !== fcMax) {
          if (window.confirm(`Le fichier Suunto indique une FC max de ${header.fcMaxBpm} bpm (valeur actuelle : ${fcMax} bpm). Mettre à jour ?`)) {
            setFcMax(header.fcMaxBpm);
          }
        }
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Erreur de lecture du fichier JSON Suunto.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleLoadSample = () => handleActivityLoaded(generateSampleGPX(), "Exemple_Course_Paris.gpx");

  const handleReset = () => {
    setActivity(null);
    setLaps(null);
    setSuuntoHeader(null);
    setBaroSamples([]);
    setFileName("");
    setHoveredPointIndex(null);
    setSplitDistance(1000);
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return "Date inconnue";
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(date);
  };

  const hasHeartRate = enrichedActivity?.avgHeartRate != null;

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo-container">
          <div className="logo-icon"><Activity size={22} /></div>
          <div>
            <h1 className="logo-text">GPX Analyzer</h1>
            <span className="logo-tagline">ANALYSE ET ENTRAÎNEMENT PREMIUM</span>
          </div>
        </div>

        <div className="header-actions">
          {activity && (
            <>
              <input ref={jsonInputRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleJsonLoaded} />
              <button type="button" className="btn btn-outline" onClick={() => jsonInputRef.current?.click()}
                style={{
                  padding: "0.5rem 1rem", fontSize: "0.9rem",
                  borderColor: laps ? "var(--color-ele)" : "var(--border-color)",
                  color: laps ? "var(--color-ele)" : "var(--text-secondary)",
                  backgroundColor: laps ? "rgba(5,150,105,0.04)" : "transparent",
                }}
              >
                <Layers size={15} />
                <span className="btn-text">{laps ? `${laps.filter(l => l.intervalType === 'Interval').length} rép. chargées` : "Laps Suunto (.json)"}</span>
              </button>
            </>
          )}
          {enrichedActivity && (
            <button type="button" className="btn btn-outline"
              onClick={() => setShowAISummary(true)}
              title="Générer un résumé à coller dans Claude.ai"
              style={{
                padding: "0.5rem 0.9rem", fontSize: "0.88rem", fontWeight: 600,
                borderColor: "var(--accent-primary)", color: "var(--accent-primary)",
                backgroundColor: "color-mix(in srgb, var(--accent-primary) 6%, transparent)",
              }}
            >
              <Sparkles size={15} />
              <span className="btn-text">Résumé IA</span>
            </button>
          )}
          <button type="button" className="btn btn-outline"
            onClick={toggleTheme}
            title={isDark ? "Mode clair" : "Mode sombre"}
            style={{ padding: "0.5rem 0.75rem", fontSize: "0.9rem" }}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {activity && (
            <button type="button" className="btn btn-outline" onClick={handleReset}
              style={{
                padding: "0.5rem 1rem", fontSize: "0.9rem",
                borderColor: "var(--color-hr)", color: "var(--color-hr)",
                backgroundColor: "rgba(225,29,72,0.02)",
              }}
            >
              <Trash2 size={15} />
              <span className="btn-text">Fermer le fichier</span>
            </button>
          )}
        </div>
      </header>

      <ErrorBoundary key={enrichedActivity?.name ?? 'accueil'}>
      <main className="main-content">
        {!activity ? (
          <div className="welcome-section animate-slide-up">
            <h1 className="welcome-title">
              Visualisez et analysez vos traces sportives
            </h1>
            <p className="welcome-subtitle">
              Un outil clair, élégant et à fort contraste pour décrypter vos performances de course à pied, vélo ou randonnée avec précision.
            </p>

            <div className="athlete-settings-bar">
              <span className="settings-label">VMA :</span>
              <input
                type="number" min={10} max={30} step={0.5} value={vma}
                onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 10 && v <= 30) setVma(v); }}
                className="settings-input" style={{ width: "64px" }}
              />
              <span>km/h</span>
              <span className="settings-sep">·</span>
              <span className="settings-label">Poids :</span>
              <input
                type="number" min={30} max={200} step={1} value={weight}
                onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 30 && v <= 200) setWeight(v); }}
                className="settings-input" style={{ width: "56px" }}
              />
              <span>kg</span>
              <span className="settings-sep">·</span>
              <span className="settings-label">Né en :</span>
              <input
                type="number" min={1940} max={2010} step={1} value={birthYear}
                onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1940 && v <= 2010) setBirthYear(v); }}
                className="settings-input" style={{ width: "68px" }}
              />
              <span className="settings-sep">· FC max {fcMax} · FC repos {fcRest}</span>
            </div>

            <Dropzone onActivityLoaded={handleActivityLoaded} onLoadSample={handleLoadSample} />
          </div>
        ) : (
          <>
            {/* Activity title + session badge */}
            <div className="card animate-slide-up activity-header">
              <div>
                <h2 className="activity-title">{enrichedActivity!.name}</h2>
                <div className="activity-meta">
                  <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <Calendar size={14} />
                    {formatDate(enrichedActivity!.startTime)}
                  </span>
                  <span>•</span>
                  <span>Fichier : {fileName}</span>
                </div>
              </div>

              {/* Session classification badge */}
              {session && (
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.35rem",
                }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: "0.5rem",
                    padding: "0.45rem 1rem", borderRadius: "var(--radius-full)",
                    border: `1.5px solid ${session.color}55`,
                    backgroundColor: `${session.color}12`,
                    fontWeight: 800, fontSize: "1rem",
                    color: session.color,
                  }}>
                    <span>{session.emoji}</span>
                    <span>{session.type}</span>
                  </div>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-tertiary)" }}>
                    {session.description}
                    {" · "}{session.basis === 'speed' ? `VMA ${vma} km/h` : `Karvonen FC${fcMax}/${fcRest}`}
                  </span>
                </div>
              )}
            </div>

            {/* Primary KPI grid */}
            <div className="dashboard-grid">
              <MetricCard icon={<Map size={22} />} label="Distance totale"
                value={(enrichedActivity!.totalDistance / 1000).toFixed(2)} unit=" km" colorVar="speed" />
              <MetricCard icon={<Timer size={22} />} label="Temps en mouvement"
                value={formatDuration(enrichedActivity!.movingTime)} colorVar="time" />
              <MetricCard icon={<TrendingUp size={22} />} label="Dénivelé positif (D+)"
                value={`+${enrichedActivity!.elevationGain}`} unit=" m" colorVar="ele" />
              {hasHeartRate ? (
                <MetricCard icon={<Heart size={22} />} label="Cardio moyen"
                  value={enrichedActivity!.avgHeartRate!} unit=" bpm" colorVar="hr" />
              ) : enrichedActivity!.activityType === 'cycling' ? (
                <MetricCard icon={<Gauge size={22} />} label="Vitesse moyenne"
                  value={(enrichedActivity!.avgSpeed * 3.6).toFixed(1)} unit=" km/h" colorVar="speed" />
              ) : (
                <MetricCard icon={<Gauge size={22} />} label="Allure moyenne"
                  value={formatPace(enrichedActivity!.avgPace)} unit=" /km" colorVar="cad" />
              )}
            </div>

            {/* Secondary KPIs */}
            {hasHeartRate && (
              <div className="secondary-kpis animate-slide-up">
                <div className="card kpi-item">
                  <span className="kpi-label">Allure moyenne</span>
                  <strong className="kpi-value" style={{ color: "var(--accent-secondary)" }}>
                    {formatPace(enrichedActivity!.avgPace)} /km
                  </strong>
                </div>
                <div className="card kpi-item">
                  <span className="kpi-label">Vitesse moyenne</span>
                  <strong className="kpi-value" style={{ color: "var(--color-speed)" }}>
                    {(enrichedActivity!.avgSpeed * 3.6).toFixed(1)} km/h
                  </strong>
                </div>
                <div className="card kpi-item">
                  <span className="kpi-label">Vitesse maximale</span>
                  <strong className="kpi-value" style={{ color: "var(--color-speed)" }}>
                    {(enrichedActivity!.maxSpeed * 3.6).toFixed(1)} km/h
                  </strong>
                </div>
                {enrichedActivity!.avgCadence !== null && (
                  <div className="card kpi-item">
                    <span className="kpi-label">Cadence moyenne</span>
                    <strong className="kpi-value" style={{ color: "var(--color-cad)" }}>
                      {enrichedActivity!.activityType === 'cycling' ? enrichedActivity!.avgCadence : (enrichedActivity!.avgCadence ?? 0) * 2}
                      {" "}{enrichedActivity!.activityType === 'cycling' ? 'rpm' : 'ppm'}
                    </strong>
                  </div>
                )}
              </div>
            )}

            {/* Map + Charts */}
            <div id="nav-map" className="content-layout">
              <ErrorBoundary section="Carte">
                <div style={{ height: "100%" }}>
                  <ActivityMap
                    points={enrichedActivity!.points}
                    hoveredPointIndex={hoveredPointIndex}
                    onHoverPointChange={setHoveredPointIndex}
                    hasHeartRate={hasHeartRate}
                  />
                </div>
              </ErrorBoundary>
              <ErrorBoundary section="Graphiques">
                <div id="nav-charts" style={{ height: "100%" }}>
                  <ChartViewer
                    points={enrichedActivity!.points}
                    hoveredPointIndex={hoveredPointIndex}
                    onHoverPointChange={setHoveredPointIndex}
                    hasHeartRate={hasHeartRate}
                    hasCadence={enrichedActivity!.avgCadence !== null}
                    activityType={enrichedActivity!.activityType}
                  />
                </div>
              </ErrorBoundary>
            </div>

            {/* HR Zones (Karvonen) */}
            {hasHeartRate && (
              <div id="nav-zones">
              <HeartRateZones
                points={enrichedActivity!.points}
                fcMax={fcMax}
                fcRest={fcRest}
                onFcMaxChange={setFcMax}
                onFcRestChange={setFcRest}
              />
              </div>
            )}

            {/* Scatter plot Allure/Vitesse vs FC */}
            {hasHeartRate && (
              <ScatterPlot
                points={enrichedActivity!.points}
                fcMax={fcMax}
                fcRest={fcRest}
                activityType={enrichedActivity!.activityType}
              />
            )}

            {/* Dérive cardiaque / Efficiency Factor */}
            {drift && <CardiacDrift drift={drift} />}

            {/* Charge d'entraînement TRIMP */}
            {trimp && <TrainingLoad trimp={trimp} />}

            {/* VO2max estimation (running only) */}
            {vo2maxEst && (
              <VO2maxEstimate
                estimate={vo2maxEst}
                suuntoVO2max={suuntoHeader?.vo2max ?? null}
              />
            )}

            {/* VDOT predictions — Jack Daniels (running only, fiabilité ≥ moyenne) */}
            {vo2maxEst && <VDOTPredictor estimate={vo2maxEst} />}

            {/* Power metrics (cycling + power data) */}
            {normalizedPower !== null && enrichedActivity!.activityType === 'cycling' && (
              <PowerMetrics
                np={normalizedPower}
                ftp={ftp}
                onFtpChange={setFtp}
                movingTime={enrichedActivity!.movingTime}
                weight={weight}
              />
            )}

            {/* Interval analysis (auto-detected from GPX) */}
            {intervals && intervals.length > 0 && (
              <IntervalAnalysis intervals={intervals} activityType={enrichedActivity!.activityType} />
            )}

            {/* Suunto laps from JSON */}
            {laps && laps.length > 0 && (
              <LapTable laps={laps} activity={enrichedActivity!} header={suuntoHeader} />
            )}

            {/* Climb analysis */}
            {climbs.length > 0 && (
              <ClimbAnalysis climbs={climbs} points={enrichedActivity!.points} />
            )}

            {/* Splits — with configurable distance */}
            <div className="split-selector animate-slide-up">
              <span className="split-selector-label">Découpage :</span>
              <div style={{
                display: "flex", gap: "2px",
                backgroundColor: "var(--bg-primary)", padding: "3px",
                borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)",
              }}>
                {SPLIT_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setSplitDistance(opt.value)}
                    style={{
                      padding: "0.25rem 0.65rem", fontSize: "0.8rem",
                      borderRadius: "calc(var(--radius-sm) - 2px)", border: "none",
                      backgroundColor: splitDistance === opt.value ? "var(--accent-primary)" : "transparent",
                      color: splitDistance === opt.value ? "#ffffff" : "var(--text-secondary)",
                      cursor: "pointer", fontWeight: splitDistance === opt.value ? 700 : 400,
                      transition: "all 0.15s",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div id="nav-splits">
              <SplitsBars splits={splits} activityType={enrichedActivity!.activityType} />
              <SplitsTable splits={splits} activityType={enrichedActivity!.activityType} />
            </div>
          </>
        )}
      </main>
      </ErrorBoundary>

      <FloatingNav visible={!!activity} />

      {showAISummary && enrichedActivity && (
        <AISummaryModal
          text={generateSummary({
            activity: enrichedActivity,
            splits,
            climbs,
            intervals: intervals ? {
              efforts: intervals.filter(iv => iv.type === "effort"),
              recoveries: intervals.filter(iv => iv.type === "recovery"),
            } : null,
            fcMax, fcRest, vma, weight, birthYear,
            sessionType: session?.type ?? null,
            trimp,
            vo2max: vo2maxEst,
            drift,
          })}
          onClose={() => setShowAISummary(false)}
        />
      )}

      {/* Loading overlay — parse bloquant sur le thread principal via requestAnimationFrame */}
      {isLoading && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999, backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "var(--bg-secondary)", padding: "2rem 3rem",
            borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem",
            boxShadow: "var(--shadow-xl)",
          }}>
            <Loader2 size={36} style={{ color: "var(--accent-primary)", animation: "spin 0.8s linear infinite" }} />
            <span style={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.95rem" }}>
              Analyse en cours…
            </span>
          </div>
        </div>
      )}

      <footer style={{
        backgroundColor: "var(--bg-secondary)", borderTop: "1px solid var(--border-color)",
        padding: "1.5rem 2rem", textAlign: "center",
        fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "auto",
      }}>
        <p>© 2026 GPX Analyzer Premium. Développé en HTML5 / React & Leaflet.</p>
        <p style={{ color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
          Traitement 100% côté client pour garantir la confidentialité absolue de vos données physiques et de géolocalisation.
        </p>
      </footer>
    </div>
  );
}

export default App;
