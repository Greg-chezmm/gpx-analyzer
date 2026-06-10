import { useState, useMemo, useRef, useEffect } from "react";
import {
  parseGPX, calculateSplits, detectIntervals,
  detectClimbs, classifySession, calcCardiacDrift,
  calcTRIMP, calcNormalizedPower, estimateVO2max, calcTSB,
  calcCardiacPace, detectHillRepeats,
  type GPXActivity,
} from "./utils/gpxParser";
import { parseFIT } from "./utils/fitParser";
import { generateSampleGPX } from "./utils/sampleGPX";
import { reverseGeocode } from "./utils/geocoding";
import { useUserSettings } from "./hooks/useUserSettings";
import { useTheme } from "./hooks/useTheme";
import { useTrainingHistory, type TrainingEntry } from "./hooks/useTrainingHistory";
import { useGoogleDrive } from "./hooks/useGoogleDrive";
import { Dropzone } from "./components/Dropzone";
import { MetricCard } from "./components/MetricCard";
import { ActivityMap } from "./components/ActivityMap";
import { ChartViewer } from "./components/ChartViewer";
import { SplitsTable, formatDuration, formatPace } from "./components/SplitsTable";
import { HeartRateZones } from "./components/HeartRateZones";
import { IntervalAnalysis } from "./components/IntervalAnalysis";
import { ClimbAnalysis } from "./components/ClimbAnalysis";
import { HillRepeats } from "./components/HillRepeats";
import { FitSummary } from "./components/FitSummary";
import { CardiacDrift } from "./components/CardiacDrift";
import { ScatterPlot } from "./components/ScatterPlot";
import { TrainingLoad } from "./components/TrainingLoad";
import { TrainingBalance } from "./components/TrainingBalance";
import { PowerMetrics } from "./components/PowerMetrics";
import { PowerZones } from "./components/PowerZones";
import { PaceZones } from "./components/PaceZones";
import { VO2maxEstimate } from "./components/VO2maxEstimate";
import { VDOTPredictor } from "./components/VDOTPredictor";
import { SplitsBars } from "./components/SplitsBars";
import { FloatingNav } from "./components/FloatingNav";
import { AISummaryModal } from "./components/AISummary";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AthleteSettingsButton } from "./components/AthleteSettings";
import { DriveSyncButton, DriveSaveButton, DriveActivityList } from "./components/DriveSync";
import { ActivityNameEditor } from "./components/ActivityNameEditor";
import { HeaderMenu } from "./components/HeaderMenu";
import { generateSummary } from "./utils/generateSummary";
import { mergeActivities, type MergeInfo } from "./utils/fitMerger";
import { downloadGPX, exportToGPX } from "./utils/gpxExporter";

import {
  Activity, Timer, TrendingUp, Heart, Map as MapIcon,
  Calendar, Gauge, Loader2, Sparkles, ArrowLeftRight, X, GitMerge,
} from "lucide-react";

const SPLIT_OPTIONS = [
  { value: 500,   label: "500m" },
  { value: 1000,  label: "1 km" },
  { value: 2000,  label: "2 km" },
  { value: 5000,  label: "5 km" },
  { value: 10000, label: "10 km" },
];

function App() {
  const { fcMax, setFcMax, fcRest, setFcRest, vma, setVma, ftp, setFtp, weight, setWeight, birthYear, setBirthYear, sex, setSex } = useUserSettings();
  const { isDark, toggleTheme } = useTheme();
  const { history, addEntry, updateEntry, replaceHistory, clearHistory } = useTrainingHistory();
  const drive = useGoogleDrive();

  const [activity, setActivity] = useState<GPXActivity | null>(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [splitDistance, setSplitDistance] = useState(1000);
  const [isLoading, setIsLoading] = useState(false);
  const [showAISummary, setShowAISummary] = useState(false);
  const [rawFileData, setRawFileData] = useState<string | ArrayBuffer | null>(null);
  const [savedToDrive, setSavedToDrive] = useState(false);
  const [customActivityName, setCustomActivityName] = useState<string>('');
  const [overrideActivityType, setOverrideActivityType] = useState<'running' | 'cycling' | null>(null);
  const [mergeNotice, setMergeNotice] = useState<MergeInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const skipDriveHistorySync = useRef(false);
  const skipSettingsSync = useRef(false);
  const settingsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const driveCustomNameRef = useRef<string>('');

  // Enrich GPS elevation with barometric altitude when JSON is loaded
  const enrichedActivity = useMemo(() => {
    if (!activity || !overrideActivityType) return activity;
    return { ...activity, activityType: overrideActivityType };
  }, [activity, overrideActivityType]);

  const splits = useMemo(
    () => (enrichedActivity ? calculateSplits(enrichedActivity, splitDistance) : []),
    [enrichedActivity, splitDistance]
  );

  const intervals = useMemo(() => {
    if (!enrichedActivity) return null;
    // Prefer watch laps (structured workout / manual lap) over speed-based detection
    if (enrichedActivity.fitLaps?.length) return enrichedActivity.fitLaps;
    return detectIntervals(enrichedActivity);
  }, [enrichedActivity]);

  const climbs = useMemo(
    () => (enrichedActivity ? detectClimbs(enrichedActivity) : []),
    [enrichedActivity]
  );

  const session = useMemo(
    () => enrichedActivity ? classifySession(
      enrichedActivity.points, fcMax, fcRest, vma,
      enrichedActivity.movingTime / 60,
      intervals?.filter(iv => iv.type === 'effort').length ?? 0,
    ) : null,
    [enrichedActivity, fcMax, fcRest, vma, intervals]
  );

  const drift = useMemo(
    () => (enrichedActivity ? calcCardiacDrift(enrichedActivity) : null),
    [enrichedActivity]
  );

  const trimp = useMemo(
    () => (enrichedActivity ? calcTRIMP(enrichedActivity.points, fcMax, fcRest, sex) : null),
    [enrichedActivity, fcMax, fcRest, sex]
  );

  // Auto-save current activity to training history when TRIMP is available.
  // customActivityName in deps ensures the entry is updated when the user renames.
  useEffect(() => {
    if (!trimp || !enrichedActivity) return;
    const date = enrichedActivity.startTime
      ? enrichedActivity.startTime.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    addEntry({
      date,
      trimp: trimp.edwards,
      name: displayName,
      activityType: enrichedActivity.activityType,
      distance: enrichedActivity.totalDistance,
      duration: enrichedActivity.movingTime,
      elevationGain: enrichedActivity.elevationGain,
      avgPace: enrichedActivity.activityType !== 'cycling' ? enrichedActivity.avgPace : undefined,
      avgSpeed: enrichedActivity.avgSpeed * 3.6,
      avgHeartRate: enrichedActivity.avgHeartRate ?? undefined,
    });
  }, [trimp, enrichedActivity, customActivityName]); // eslint-disable-line react-hooks/exhaustive-deps

  const tsbResult = useMemo(() => calcTSB(history), [history]);

  // Load settings from Drive on connect, apply to local state
  useEffect(() => {
    if (drive.status !== 'connected') return;
    skipSettingsSync.current = true;
    drive.loadSettings().then(remote => {
      if (!remote) { skipSettingsSync.current = false; return; }
      if (remote.fcMax   > 0)   setFcMax(remote.fcMax);
      if (remote.fcRest  > 0)   setFcRest(remote.fcRest);
      if (remote.vma     > 0)   setVma(remote.vma);
      if (remote.ftp     > 0)   setFtp(remote.ftp);
      if (remote.weight  > 0)   setWeight(remote.weight);
      if (remote.birthYear > 0) setBirthYear(remote.birthYear);
      if (remote.sex === 'M' || remote.sex === 'F') setSex(remote.sex);
      setTimeout(() => { skipSettingsSync.current = false; }, 200);
    }).catch(() => { skipSettingsSync.current = false; });
  }, [drive.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save settings to Drive when any value changes (debounced 800ms)
  useEffect(() => {
    if (drive.status !== 'connected' || skipSettingsSync.current) return;
    if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current);
    settingsSaveTimer.current = setTimeout(() => {
      drive.saveSettings({ fcMax, fcRest, vma, ftp, weight, birthYear, sex });
    }, 800);
    return () => { if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current); };
  }, [fcMax, fcRest, vma, ftp, weight, birthYear, sex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reverse geocode start point when activity changes
  useEffect(() => {
    setLocationName(null);
    // Restore Drive custom name if the activity was loaded from Drive; otherwise clear
    setCustomActivityName(driveCustomNameRef.current);
    driveCustomNameRef.current = '';
    if (!enrichedActivity?.points?.length) return;
    const pt = enrichedActivity.points[0];
    if (!pt.lat || !pt.lon) return;
    setLocationLoading(true);
    reverseGeocode(pt.lat, pt.lon)
      .then(loc => setLocationName(loc))
      .finally(() => setLocationLoading(false));
  }, [enrichedActivity]);

  // Sync Drive → localStorage on connect (merge remote + local, remote fills gaps)
  useEffect(() => {
    if (drive.status !== 'connected') return;
    let cancelled = false;
    skipDriveHistorySync.current = true;
    drive.loadHistory().then(remote => {
      if (cancelled) return;
      if (remote.length === 0) { skipDriveHistorySync.current = false; return; }
      // Dedup by physical identity (date+duration+distance) to survive renames;
      // fallback to date+name for old entries without those fields.
      const mergeKey = (e: TrainingEntry | { date: string; trimp: number; name: string; duration?: number; distance?: number }) =>
        (e.duration && e.distance)
          ? `${e.date}|${Math.round(e.duration)}|${Math.round(e.distance)}`
          : `${e.date}|${e.name}`;
      const seen = new Map<string, TrainingEntry>();
      [...remote, ...history].forEach(e => {
        const key = mergeKey(e);
        const ex = seen.get(key);
        if (!ex) { seen.set(key, e as TrainingEntry); return; }
        // Prefer the entry with a custom name (not raw suuntoapp- format) or more fields
        const exIsSuunto = /^suuntoapp-/i.test(ex.name);
        const newIsSuunto = /^suuntoapp-/i.test(e.name);
        if (exIsSuunto && !newIsSuunto) seen.set(key, e as TrainingEntry);
        else if (!exIsSuunto && newIsSuunto) { /* keep existing */ }
        else if (Object.keys(e).length > Object.keys(ex).length) seen.set(key, e as TrainingEntry);
      });
      const merged = Array.from(seen.values()).sort((a, b) => a.date.localeCompare(b.date));
      replaceHistory(merged);
      setTimeout(() => { skipDriveHistorySync.current = false; }, 0);
    }).catch(() => { skipDriveHistorySync.current = false; });
    return () => { cancelled = true; };
  }, [drive.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync localStorage → Drive on history change (skip when change came from Drive)
  useEffect(() => {
    if (drive.status !== 'connected' || skipDriveHistorySync.current || history.length === 0) return;
    drive.saveHistory(history).catch(() => {});
  }, [history]); // eslint-disable-line react-hooks/exhaustive-deps

  const normalizedPower = useMemo(
    () => (enrichedActivity ? calcNormalizedPower(enrichedActivity.points) : null),
    [enrichedActivity]
  );

  const hasPower = useMemo(
    () => enrichedActivity?.points.some(p => p.power !== null && p.power > 0) ?? false,
    [enrichedActivity]
  );

  const intensityFactor = useMemo(
    () => (normalizedPower && ftp > 0 ? normalizedPower / ftp : null),
    [normalizedPower, ftp]
  );

  const vo2maxEst = useMemo(
    () => (enrichedActivity ? estimateVO2max(enrichedActivity, fcMax, fcRest) : null),
    [enrichedActivity, fcMax, fcRest]
  );

  const cardiacPaceResult = useMemo(
    () => (enrichedActivity && enrichedActivity.avgHeartRate != null && enrichedActivity.activityType !== 'cycling'
      ? calcCardiacPace(enrichedActivity.points, fcMax, fcRest)
      : null),
    [enrichedActivity, fcMax, fcRest]
  );

  const hillRepeats = useMemo(
    () => (enrichedActivity?.activityType === 'running' && climbs.length >= 2
      ? detectHillRepeats(climbs, enrichedActivity)
      : []),
    [climbs, enrichedActivity]
  );

  const handleActivityLoaded = (data: string | ArrayBuffer, name: string, customName?: string) => {
    driveCustomNameRef.current = customName || '';
    const cleanName = name.replace(/\.[^/.]+$/, "");
    const isFit = name.toLowerCase().endsWith(".fit");
    setIsLoading(true);
    // Defer by one frame so the spinner renders before the synchronous parse.
    requestAnimationFrame(() => setTimeout(async () => {
      try {
        const parsed = isFit && data instanceof ArrayBuffer
          ? await parseFIT(data, cleanName)
          : parseGPX(data as string, cleanName);
        setActivity(parsed);
        setFileName(name);
        setHoveredPointIndex(null);
        setSplitDistance(1000);
        setRawFileData(data);
        setSavedToDrive(false);
        setOverrideActivityType(null);
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Erreur de chargement du fichier.");
      }
      setIsLoading(false);
    }, 30));
  };

  const handleLoadSample = () => handleActivityLoaded(generateSampleGPX(), "Exemple_Course_Paris.gpx");

  const handleReset = () => {
    setActivity(null);
    setFileName("");
    setHoveredPointIndex(null);
    setSplitDistance(1000);
    setRawFileData(null);
    setSavedToDrive(false);
    setMergeNotice(null);
    setOverrideActivityType(null);
    setCustomActivityName('');
  };

  const handleMergeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activity) return;
    setIsLoading(true);
    try {
      let second: GPXActivity;
      if (file.name.toLowerCase().endsWith('.fit')) {
        const buf = await file.arrayBuffer();
        second = await parseFIT(buf, file.name.replace(/\.fit$/i, ''));
      } else {
        const text = await file.text();
        second = parseGPX(text, file.name.replace(/\.gpx$/i, ''));
      }
      const { activity: merged, info } = mergeActivities(activity, second);
      setActivity(merged);
      setMergeNotice(info);
      setSavedToDrive(false);
      // rawFileData devient le GPX fusionné — Drive sauvegarde l'activité complète
      const mergedGpx = exportToGPX(merged, merged.fitLaps ?? null);
      setRawFileData(mergedGpx);
      const mergedFileName = merged.name.replace(/[^a-zA-Z0-9_\-.]/g, '_') + '.gpx';
      setFileName(mergedFileName);
    } catch (err) {
      alert(`Impossible de fusionner : ${err instanceof Error ? err.message : 'Erreur inconnue'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const displayName = customActivityName || enrichedActivity?.name || fileName;

  const handleRename = (newName: string) => {
    if (!enrichedActivity) return;
    const date = enrichedActivity.startTime
      ? enrichedActivity.startTime.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const oldName = customActivityName || enrichedActivity.name || fileName;
    setCustomActivityName(newName);
    updateEntry(date, oldName, { name: newName });
    setSavedToDrive(false); // allow re-save to Drive with new name
  };

  const handleSaveToDrive = async () => {
    if (!rawFileData || !enrichedActivity) return;
    const date = enrichedActivity.startTime
      ? enrichedActivity.startTime.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const intensityFactor = normalizedPower && ftp > 0 ? normalizedPower / ftp : null;
    const tss = intensityFactor
      ? Math.round((enrichedActivity.movingTime * normalizedPower! * intensityFactor) / (ftp * 3600) * 100)
      : undefined;
    await drive.save(rawFileData, fileName, {
      name: displayName,
      date,
      distance: enrichedActivity.totalDistance,
      duration: enrichedActivity.movingTime,
      activityType: enrichedActivity.activityType,
      elevationGain: enrichedActivity.elevationGain,
      fileName,
      avgHeartRate: enrichedActivity.avgHeartRate ?? undefined,
      trimp: trimp?.edwards,
      trimpBanister: trimp?.banister,
      vo2max: vo2maxEst?.value,
      vo2maxConfidence: vo2maxEst?.confidence,
      sessionType: session?.type,
      normalizedPower: normalizedPower ?? undefined,
      tss,
      driftPct: drift?.decoupling,
      avgCadence: enrichedActivity.avgCadence ?? undefined,
    });
    setSavedToDrive(true);
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return "Date inconnue";
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(date);
  };

  const hasHeartRate = enrichedActivity?.avgHeartRate != null;

  return (
    <div className="app-container">
      {/* Panneau profil athlète — déclenché depuis le burger, position:fixed indépendante du header */}
      <AthleteSettingsButton
        fcMax={fcMax}       onFcMaxChange={setFcMax}
        fcRest={fcRest}     onFcRestChange={setFcRest}
        vma={vma}           onVmaChange={setVma}
        ftp={ftp}           onFtpChange={setFtp}
        weight={weight}     onWeightChange={setWeight}
        birthYear={birthYear} onBirthYearChange={setBirthYear}
        sex={sex}           onSexChange={setSex}
        isCycling={enrichedActivity?.activityType === 'cycling'}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      <header className="header">
        <div className="logo-container">
          <div className="logo-icon"><Activity size={22} /></div>
          <div>
            <h1 className="logo-text">GPX Analyzer</h1>
            <span className="logo-tagline">ANALYSE ET ENTRAÎNEMENT PREMIUM</span>
          </div>
        </div>

        <div className="header-actions">
          <DriveSyncButton drive={drive} onLoad={handleActivityLoaded} />
          {enrichedActivity && (
            <DriveSaveButton drive={drive} onSave={handleSaveToDrive} alreadySaved={savedToDrive} />
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
          <input
            ref={mergeInputRef}
            type="file"
            accept=".fit,.gpx"
            style={{ display: "none" }}
            onChange={handleMergeFile}
          />
          <HeaderMenu
            isDark={isDark}
            onToggleTheme={toggleTheme}
            onOpenSettings={() => setSettingsOpen(true)}
            hasActivity={!!activity}
            onExportGPX={() => downloadGPX(enrichedActivity!, intervals)}
            onMerge={() => mergeInputRef.current?.click()}
            onReset={handleReset}
          />
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
            <DriveActivityList drive={drive} onLoad={handleActivityLoaded} />
          </div>
        ) : (
          <>
            {/* Merge notice */}
            {mergeNotice && (
              <div style={{
                display: "flex", alignItems: "center", gap: "0.75rem",
                padding: "0.6rem 1rem", marginBottom: "0.75rem",
                background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.35)",
                borderRadius: "var(--radius-md)", fontSize: "0.85rem", color: "var(--text-secondary)",
              }}>
                <GitMerge size={15} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
                <span style={{ flex: 1 }}>
                  <strong style={{ color: "var(--text-primary)" }}>Segments fusionnés</strong>
                  {" — "}gap GPS {Math.round(mergeNotice.gapMeters)} m
                  {mergeNotice.gapSeconds > 0 && `, pause ${formatDuration(Math.round(mergeNotice.gapSeconds))}`}
                </span>
                <button onClick={() => setMergeNotice(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: "0.15rem", display: "flex" }}>
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Activity title + session badge */}
            <div className="card animate-slide-up activity-header">
              <div style={{ flex: 1, minWidth: 0 }}>
                <ActivityNameEditor
                  name={displayName}
                  location={locationName}
                  locationLoading={locationLoading}
                  date={enrichedActivity!.startTime}
                  onSave={handleRename}
                />
                <div className="activity-meta">
                  <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <Calendar size={14} />
                    {formatDate(enrichedActivity!.startTime)}
                  </span>
                  <span>•</span>
                  <span>Fichier : {fileName}</span>
                  <span>•</span>
                  <button
                    type="button"
                    title="Changer le type d'activité"
                    onClick={() => setOverrideActivityType(
                      enrichedActivity!.activityType === 'cycling' ? 'running' : 'cycling'
                    )}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "0.3rem",
                      padding: "0.15rem 0.55rem", fontSize: "0.78rem", fontWeight: 600,
                      borderRadius: "var(--radius-full)", cursor: "pointer",
                      border: `1px solid ${overrideActivityType ? "var(--accent-primary)" : "var(--border-color)"}`,
                      color: overrideActivityType ? "var(--accent-primary)" : "var(--text-secondary)",
                      background: overrideActivityType ? "color-mix(in srgb, var(--accent-primary) 8%, transparent)" : "transparent",
                      transition: "all 0.15s",
                    }}
                  >
                    <span>{enrichedActivity!.activityType === 'cycling' ? '🚴' : '🏃'}</span>
                    <span>{enrichedActivity!.activityType === 'cycling' ? 'Vélo' : 'Course'}</span>
                    <ArrowLeftRight size={10} />
                  </button>
                </div>
              </div>

              {/* Session classification badge */}
              {session && (
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.35rem",
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
              <MetricCard icon={<MapIcon size={22} />} label="Distance totale"
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
                {enrichedActivity!.activityType !== 'cycling' && (
                  <div className="card kpi-item">
                    <span className="kpi-label">Allure moyenne</span>
                    <strong className="kpi-value" style={{ color: "var(--accent-secondary)" }}>
                      {formatPace(enrichedActivity!.avgPace)} /km
                    </strong>
                  </div>
                )}
                {cardiacPaceResult?.avgCardiacPace != null && enrichedActivity!.activityType !== 'cycling' && (
                  <div className="card kpi-item">
                    <span className="kpi-label" title="Allure normalisée à 65% de réserve cardiaque">Allure cardiaque</span>
                    <strong className="kpi-value" style={{ color: "var(--color-cardiac)" }}>
                      {formatPace(cardiacPaceResult.avgCardiacPace)} /km
                    </strong>
                  </div>
                )}
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
                {intensityFactor !== null && enrichedActivity!.activityType === 'cycling' && (
                  <div className="card kpi-item">
                    <span className="kpi-label" title="Puissance normalisée / FTP">IF (Intensity Factor)</span>
                    <strong className="kpi-value" style={{ color: "var(--color-power, #f59e0b)" }}>
                      {intensityFactor.toFixed(2)}
                    </strong>
                  </div>
                )}
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
                    hasPower={hasPower}
                    activityType={enrichedActivity!.activityType}
                    fcMax={fcMax}
                    fcRest={fcRest}
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

            {/* Zones d'allure % VMA (running uniquement) */}
            {enrichedActivity!.activityType !== 'cycling' && (
              <PaceZones
                points={enrichedActivity!.points}
                vma={vma}
                onVmaChange={setVma}
              />
            )}

            {/* Zones de puissance Coggan (vélo + puissance) */}
            {hasPower && enrichedActivity!.activityType === 'cycling' && (
              <PowerZones
                points={enrichedActivity!.points}
                ftp={ftp}
                onFtpChange={setFtp}
                weight={weight}
              />
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

            {/* TSB / CTL / ATL — historique multi-séances */}
            <TrainingBalance tsb={tsbResult} history={history} onClear={clearHistory} />

            {/* Bilan FIT — TE, VO2max montre, récupération, EPOC, feeling, zones */}
            {enrichedActivity!.fitSummary && (
              <FitSummary
                fit={enrichedActivity!.fitSummary}
                fcMax={fcMax}
                vo2maxEst={vo2maxEst}
                trimp={trimp}
              />
            )}

            {/* VO2max estimation (running only) */}
            {vo2maxEst && <VO2maxEstimate estimate={vo2maxEst} />}

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
              <IntervalAnalysis
                intervals={intervals}
                activityType={enrichedActivity!.activityType}
                points={enrichedActivity!.points}
                source={enrichedActivity!.fitLaps?.length ? 'fit' : 'detected'}
              />
            )}

            {/* Climb analysis */}
            {climbs.length > 0 && (
              <ClimbAnalysis climbs={climbs} points={enrichedActivity!.points} />
            )}

            {/* Hill repeats — running only, ≥2 séries détectées */}
            {hillRepeats.length > 0 && (
              <HillRepeats series={hillRepeats} points={enrichedActivity!.points} />
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
            hillRepeats,
            fcMax, fcRest, vma, ftp, weight, birthYear,
            sessionType: session?.type ?? null,
            trimp,
            fitSummary: enrichedActivity.fitSummary ?? null,
            vo2max: vo2maxEst,
            drift,
            normalizedPower,
            intensityFactor,
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
