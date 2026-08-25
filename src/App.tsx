import { useState, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import {
  parseGPX, calculateSplits, detectIntervals,
  detectClimbs, classifySession, calcCardiacDrift,
  calcTRIMP, calcNormalizedPower, estimateVO2max, calcTSB,
  calcCardiacPace, detectHillRepeats,
  type GPXActivity,
} from "./utils/gpxParser";
import { generateSampleGPX } from "./utils/sampleGPX";
import { reverseGeocode } from "./utils/geocoding";
import { useUserSettings } from "./hooks/useUserSettings";
import { useTheme } from "./hooks/useTheme";
import { useTrainingHistory, type TrainingEntry } from "./hooks/useTrainingHistory";
import { useGoogleDrive } from "./hooks/useGoogleDrive";
import { useRaceGoal } from "./hooks/useRaceGoal";
import { useFirebaseAuth } from "./hooks/useFirebaseAuth";
import { useFirebaseCloud } from "./hooks/useFirebaseCloud";
import { loadFirestoreSettings, saveFirestoreSettings } from "./utils/firestoreStorage";
import { Dropzone } from "./components/Dropzone";
import { MetricCard } from "./components/MetricCard";
import { ChartViewer } from "./components/ChartViewer";
import { SplitsTable, formatDuration, formatPace } from "./components/SplitsTable";
import { HeartRateZones } from "./components/HeartRateZones";

// Chargés à la demande — Leaflet (~150 KB) et fit-file-parser (~80 KB) absents du bundle initial
const ActivityMap     = lazy(() => import("./components/ActivityMap").then(m => ({ default: m.ActivityMap })));
const IntervalAnalysis = lazy(() => import("./components/IntervalAnalysis").then(m => ({ default: m.IntervalAnalysis })));
const ClimbAnalysis   = lazy(() => import("./components/ClimbAnalysis").then(m => ({ default: m.ClimbAnalysis })));
const HillRepeats     = lazy(() => import("./components/HillRepeats").then(m => ({ default: m.HillRepeats })));
import { FitSummary } from "./components/FitSummary";
import { CardiacDrift } from "./components/CardiacDrift";
import { ScatterPlot } from "./components/ScatterPlot";
import { TrainingLoad } from "./components/TrainingLoad";
import { AthletePage } from "./components/AthletePage";
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
import { CloudSyncButton, CloudSaveButton, CloudActivityList } from "./components/CloudSync";
import { ActivityNameEditor } from "./components/ActivityNameEditor";
import { HeaderMenu } from "./components/HeaderMenu";
import { generateSummary } from "./utils/generateSummary";
import { mergeActivities, type MergeInfo } from "./utils/fitMerger";
import { downloadGPX, exportToGPX } from "./utils/gpxExporter";
import { DataQuality } from "./components/DataQuality";
import { WeatherCard } from "./components/WeatherCard";
import { getActivityWeather, weatherToEntryFields, type WeatherInfo } from "./utils/weather";
import { computeBestEfforts } from "./utils/bestEfforts";

import {
  Activity, Timer, TrendingUp, Heart, Map as MapIcon,
  Calendar, Gauge, Loader2, Sparkles, ArrowLeftRight, X, GitMerge, LayoutDashboard,
} from "lucide-react";

/** Options de découpage des splits disponibles dans le sélecteur. */
const SPLIT_OPTIONS = [
  { value: 500,   label: "500m" },
  { value: 1000,  label: "1 km" },
  { value: 2000,  label: "2 km" },
  { value: 5000,  label: "5 km" },
  { value: 10000, label: "10 km" },
];

/** Composant racine — orchestre l'état global, les calculs dérivés et la mise en page du dashboard. */
function App() {

  /* ── Hooks — paramètres athlète, thème, historique, Drive ── */
  const { fcMax, setFcMax, fcRest, setFcRest, vma, setVma, ftp, setFtp, weight, setWeight, birthYear, setBirthYear, sex, setSex } = useUserSettings();
  const { isDark, toggleTheme } = useTheme();
  const { history, addEntry, updateEntry, replaceHistory, clearHistory } = useTrainingHistory();
  const drive = useGoogleDrive();
  const { goal: raceGoal, setGoal: setRaceGoal } = useRaceGoal();
  const firebaseAuth = useFirebaseAuth();
  const cloud = useFirebaseCloud(firebaseAuth, drive.token);

  /* ── État local — activité courante et UI ── */
  const [activity, setActivity] = useState<GPXActivity | null>(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [splitDistance, setSplitDistance] = useState(1000);
  const [isLoading, setIsLoading] = useState(false);
  const [showAISummary, setShowAISummary] = useState(false);
  const [rawFileData, setRawFileData] = useState<string | ArrayBuffer | null>(null);
  const [savedToDrive, setSavedToDrive] = useState(false);
  const [savedToCloud, setSavedToCloud] = useState(false);
  const [customActivityName, setCustomActivityName] = useState<string>('');
  const [overrideActivityType, setOverrideActivityType] = useState<'running' | 'cycling' | null>(null);
  const [mergeNotice, setMergeNotice] = useState<MergeInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showAthletePage, setShowAthletePage] = useState(false);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  // Météo déjà connue (ex. rechargée depuis Drive) — consommée par l'effet météo pour éviter un appel réseau inutile.
  const pendingStoredWeatherRef = useRef<WeatherInfo | null>(null);
  // Drapeaux pour éviter les boucles infinie lors de la synchronisation Drive ↔ localStorage.
  const skipDriveHistorySync = useRef(false);
  const skipSettingsSync = useRef(false);
  const settingsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFirestoreSettingsSync = useRef(false);
  const firestoreSettingsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mémorise le nom personnalisé venant de Drive avant que l'activité soit chargée.
  const driveCustomNameRef = useRef<string>('');

  /* ── Mémos — données dérivées de l'activité ── */

  // Applique l'override de type d'activité sans toucher à l'objet parsé.
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
    // Préfère les laps montre (séance structurée / lap manuel) à la détection par vitesse.
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

  const tsbResult = useMemo(() => calcTSB(history), [history]);

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

  /* ── Effets — synchronisation Drive, géocodage, historique ── */

  // Sauvegarde automatique dans l'historique à chaque nouvelle activité analysée (TRIMP requis).
  // customActivityName en dépendance assure la mise à jour lors d'un renommage.
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

  // Charge les paramètres athlète depuis Drive à la connexion ; skipSettingsSync évite la boucle de retour.
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

  // Sauvegarde les paramètres athlète vers Drive, debounce 800 ms pour éviter les appels trop fréquents.
  useEffect(() => {
    if (drive.status !== 'connected' || skipSettingsSync.current) return;
    if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current);
    settingsSaveTimer.current = setTimeout(() => {
      drive.saveSettings({ fcMax, fcRest, vma, ftp, weight, birthYear, sex });
    }, 800);
    return () => { if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current); };
  }, [fcMax, fcRest, vma, ftp, weight, birthYear, sex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Étape B (migration Firebase) — charge les réglages + l'objectif course depuis Firestore à la connexion.
  useEffect(() => {
    if (firebaseAuth.status !== 'signed-in' || !firebaseAuth.user) return;
    skipFirestoreSettingsSync.current = true;
    loadFirestoreSettings(firebaseAuth.user.uid).then(remote => {
      if (!remote) { skipFirestoreSettingsSync.current = false; return; }
      if (remote.fcMax   > 0)   setFcMax(remote.fcMax);
      if (remote.fcRest  > 0)   setFcRest(remote.fcRest);
      if (remote.vma     > 0)   setVma(remote.vma);
      if (remote.ftp     > 0)   setFtp(remote.ftp);
      if (remote.weight  > 0)   setWeight(remote.weight);
      if (remote.birthYear > 0) setBirthYear(remote.birthYear);
      if (remote.sex === 'M' || remote.sex === 'F') setSex(remote.sex);
      if (remote.raceGoal) setRaceGoal(remote.raceGoal);
      setTimeout(() => { skipFirestoreSettingsSync.current = false; }, 200);
    }).catch(() => { skipFirestoreSettingsSync.current = false; });
  }, [firebaseAuth.status, firebaseAuth.user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Étape B (migration Firebase) — sauvegarde débouncée des réglages + objectif course vers Firestore.
  useEffect(() => {
    if (firebaseAuth.status !== 'signed-in' || !firebaseAuth.user || skipFirestoreSettingsSync.current) return;
    const uid = firebaseAuth.user.uid;
    if (firestoreSettingsSaveTimer.current) clearTimeout(firestoreSettingsSaveTimer.current);
    firestoreSettingsSaveTimer.current = setTimeout(() => {
      saveFirestoreSettings(uid, { fcMax, fcRest, vma, ftp, weight, birthYear, sex, raceGoal });
    }, 800);
    return () => { if (firestoreSettingsSaveTimer.current) clearTimeout(firestoreSettingsSaveTimer.current); };
  }, [firebaseAuth.status, firebaseAuth.user, fcMax, fcRest, vma, ftp, weight, birthYear, sex, raceGoal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Géocodage inversé du premier point GPS pour proposer le lieu dans le renommage.
  useEffect(() => {
    setLocationName(null);
    // Restaure le nom personnalisé Drive si l'activité provient du cloud ; sinon vide.
    setCustomActivityName(driveCustomNameRef.current);
    driveCustomNameRef.current = '';
    if (!enrichedActivity?.points?.length) return;
    const firstPoint = enrichedActivity.points[0];
    if (!firstPoint.lat || !firstPoint.lon) return;
    setLocationLoading(true);
    reverseGeocode(firstPoint.lat, firstPoint.lon)
      .then(loc => setLocationName(loc))
      .finally(() => setLocationLoading(false));
  }, [enrichedActivity]);

  // Météo au 1er point GPS + heure de départ. Court-circuite l'appel réseau si déjà connue
  // (rechargement depuis Drive) ; sinon getActivityWeather() met aussi en cache par position/heure.
  useEffect(() => {
    const firstPoint = enrichedActivity?.points?.[0];
    if (!enrichedActivity || !firstPoint || !enrichedActivity.startTime) {
      setWeather(null);
      setWeatherLoading(false);
      return;
    }
    if (pendingStoredWeatherRef.current) {
      setWeather(pendingStoredWeatherRef.current);
      setWeatherLoading(false);
      pendingStoredWeatherRef.current = null;
      return;
    }
    let cancelled = false;
    setWeatherLoading(true);
    getActivityWeather(firstPoint.lat, firstPoint.lon, enrichedActivity.startTime)
      .then(w => { if (!cancelled) setWeather(w); })
      .finally(() => { if (!cancelled) setWeatherLoading(false); });
    return () => { cancelled = true; };
  }, [enrichedActivity]);

  /** Refait un appel météo en ignorant le cache (bouton de rafraîchissement) — ex. après un changement de modèle Météo-France. */
  const handleRefreshWeather = () => {
    const firstPoint = enrichedActivity?.points?.[0];
    if (!enrichedActivity || !firstPoint || !enrichedActivity.startTime) return;
    setWeatherLoading(true);
    getActivityWeather(firstPoint.lat, firstPoint.lon, enrichedActivity.startTime, true)
      .then(setWeather)
      .finally(() => setWeatherLoading(false));
  };

  // Synchronisation Drive → localStorage à la connexion (fusion remote + local, remote comble les trous).
  useEffect(() => {
    if (drive.status !== 'connected') return;
    let cancelled = false;
    skipDriveHistorySync.current = true;
    drive.loadHistory().then(remote => {
      if (cancelled) return;
      if (remote.length === 0) { skipDriveHistorySync.current = false; return; }
      // Clé de déduplication stable au renommage : date+durée+distance.
      // Fallback date+name pour les anciennes entrées sans ces champs.
      const mergeKey = (e: TrainingEntry | { date: string; trimp: number; name: string; duration?: number; distance?: number }) =>
        (e.duration && e.distance)
          ? `${e.date}|${Math.round(e.duration)}|${Math.round(e.distance)}`
          : `${e.date}|${e.name}`;
      const seen = new Map<string, TrainingEntry>();
      [...remote, ...history].forEach(e => {
        const key = mergeKey(e);
        const existing = seen.get(key);
        if (!existing) { seen.set(key, e as TrainingEntry); return; }
        // Préfère l'entrée avec un nom propre (pas le format brut suuntoapp-…).
        const existingIsSuunto = /^suuntoapp-/i.test(existing.name);
        const newIsSuunto      = /^suuntoapp-/i.test(e.name);
        if (existingIsSuunto && !newIsSuunto) seen.set(key, e as TrainingEntry);
        else if (!existingIsSuunto && newIsSuunto) { /* garde l'entrée existante */ }
        else if (Object.keys(e).length > Object.keys(existing).length) seen.set(key, e as TrainingEntry);
      });
      const merged = Array.from(seen.values()).sort((a, b) => a.date.localeCompare(b.date));
      replaceHistory(merged);
      setTimeout(() => { skipDriveHistorySync.current = false; }, 0);
    }).catch(() => { skipDriveHistorySync.current = false; });
    return () => { cancelled = true; };
  }, [drive.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronisation localStorage → Drive à chaque changement d'historique (sauf si origine Drive).
  useEffect(() => {
    if (drive.status !== 'connected' || skipDriveHistorySync.current || history.length === 0) return;
    drive.saveHistory(history).catch(() => {});
  }, [history]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Handlers — chargement, fusion, renommage, export ── */

  const handleActivityLoaded = (data: string | ArrayBuffer, name: string, customName?: string, storedWeather?: WeatherInfo) => {
    driveCustomNameRef.current = customName || '';
    const nameWithoutExtension = name.replace(/\.[^/.]+$/, "");
    const isFit = name.toLowerCase().endsWith(".fit");
    setIsLoading(true);
    // Consommé par l'effet météo dès que la nouvelle activité est en état — évite un appel réseau si déjà connue.
    pendingStoredWeatherRef.current = storedWeather ?? null;
    // Décale d'une frame + 30 ms pour laisser le spinner s'afficher avant le parse synchrone.
    requestAnimationFrame(() => setTimeout(async () => {
      try {
        const parsed = isFit && data instanceof ArrayBuffer
          ? await import("./utils/fitParser").then(m => m.parseFIT(data, nameWithoutExtension))
          : parseGPX(data as string, nameWithoutExtension);
        setActivity(parsed);
        setFileName(name);
        setHoveredPointIndex(null);
        setSplitDistance(1000);
        setRawFileData(data);
        setSavedToDrive(false);
        setSavedToCloud(false);
        setOverrideActivityType(null);
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Erreur de chargement du fichier.");
      }
      setIsLoading(false);
    }, 30));
  };

  /** Charge l'activité exemple générée dynamiquement (parcours Paris). */
  const handleLoadSample = () => handleActivityLoaded(generateSampleGPX(), "Exemple_Course_Paris.gpx");

  /** Réinitialise complètement l'état pour revenir à l'écran d'accueil. */
  const handleReset = () => {
    setActivity(null);
    setFileName("");
    setHoveredPointIndex(null);
    setSplitDistance(1000);
    setRawFileData(null);
    setSavedToDrive(false);
    setSavedToCloud(false);
    setMergeNotice(null);
    setOverrideActivityType(null);
    setCustomActivityName('');
  };

  /** Fusionne un second fichier GPX/FIT avec l'activité courante. */
  const handleMergeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activity) return;
    setIsLoading(true);
    try {
      let second: GPXActivity;
      if (file.name.toLowerCase().endsWith('.fit')) {
        const buf = await file.arrayBuffer();
        second = await import("./utils/fitParser").then(m => m.parseFIT(buf, file.name.replace(/\.fit$/i, '')));
      } else {
        const text = await file.text();
        second = parseGPX(text, file.name.replace(/\.gpx$/i, ''));
      }
      const { activity: merged, info } = mergeActivities(activity, second);
      setActivity(merged);
      setMergeNotice(info);
      setSavedToDrive(false);
      setSavedToCloud(false);
      // rawFileData devient le GPX fusionné — sauvegarde l'activité complète.
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

  /** Nom affiché : priorité au nom personnalisé, puis nom parsé, puis nom de fichier. */
  const displayName = customActivityName || enrichedActivity?.name || fileName;

  /** Met à jour le nom de l'activité localement et dans l'historique d'entraînement. */
  const handleRename = (newName: string) => {
    if (!enrichedActivity) return;
    const date = enrichedActivity.startTime
      ? enrichedActivity.startTime.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const oldName = customActivityName || enrichedActivity.name || fileName;
    setCustomActivityName(newName);
    updateEntry(date, oldName, { name: newName });
    setSavedToDrive(false); // permet une re-sauvegarde avec le nouveau nom
    setSavedToCloud(false);
  };

  /** Construit les métadonnées analytiques communes aux sauvegardes Drive et cloud. */
  const buildActivityMeta = () => {
    if (!enrichedActivity) return null;
    const date = enrichedActivity.startTime
      ? enrichedActivity.startTime.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    // Recalcul local de l'IF/TSS pour les métadonnées sauvegardées (indépendant du mémo global).
    const localIntensityFactor = normalizedPower && ftp > 0 ? normalizedPower / ftp : null;
    const tss = localIntensityFactor
      ? Math.round((enrichedActivity.movingTime * normalizedPower! * localIntensityFactor) / (ftp * 3600) * 100)
      : undefined;
    return {
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
      zoneMinutes: trimp?.zoneMinutes,
      vo2max: vo2maxEst?.value,
      vo2maxConfidence: vo2maxEst?.confidence,
      sessionType: session?.type,
      normalizedPower: normalizedPower ?? undefined,
      tss,
      driftPct: drift?.decoupling,
      avgCadence: enrichedActivity.avgCadence ?? undefined,
      bestEfforts: computeBestEfforts(enrichedActivity.points, enrichedActivity.activityType) ?? undefined,
      ...weatherToEntryFields(weather),
    };
  };

  /** Sauvegarde l'activité courante sur Firebase (source principale). */
  const handleSaveToCloud = async () => {
    const meta = buildActivityMeta();
    if (!rawFileData || !meta) return;
    await cloud.save(rawFileData, fileName, meta);
    setSavedToCloud(true);
  };

  /** Sauvegarde l'activité courante sur Google Drive (export manuel de secours). */
  const handleSaveToDrive = async () => {
    const meta = buildActivityMeta();
    if (!rawFileData || !meta) return;
    await drive.save(rawFileData, fileName, meta);
    setSavedToDrive(true);
  };

  /** Formate une date en français long + heure (ex. « 7 juin 2025 à 08:30 »). */
  const formatDate = (date: Date | null): string => {
    if (!date) return "Date inconnue";
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(date);
  };

  const hasHeartRate = enrichedActivity?.avgHeartRate != null;

  /* ── JSX — rendu ── */

  return (
    <div className="app-container">
      {/* Panneau profil athlète — déclenché depuis le burger, rendu en position:fixed indépendante du header */}
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

      {/* ── Header ── */}
      <header className="header">
        <div className="logo-container">
          <div className="logo-icon"><Activity size={22} /></div>
          <div>
            <h1 className="logo-text">GPX Analyzer</h1>
            <span className="logo-tagline">ANALYSE ET ENTRAÎNEMENT PREMIUM</span>
          </div>
        </div>

        <div className="header-actions">
          <button type="button" className="btn btn-outline"
            onClick={() => setShowAthletePage(v => !v)}
            title="Bilan athlète — profil, records, vitesse critique, charge d'entraînement"
            style={{
              padding: "0.5rem 1rem", fontSize: "0.9rem",
              ...(showAthletePage ? {
                borderColor: "var(--accent-primary)", color: "var(--accent-primary)",
                backgroundColor: "color-mix(in srgb, var(--accent-primary) 8%, transparent)",
              } : {}),
            }}
          >
            <LayoutDashboard size={15} />
            <span className="btn-text">Bilan athlète</span>
          </button>
          <CloudSyncButton cloud={cloud} onLoad={handleActivityLoaded} fcMax={fcMax} fcRest={fcRest} onConnectDrive={drive.signIn} />
          {enrichedActivity && (
            <CloudSaveButton cloud={cloud} onSave={handleSaveToCloud} alreadySaved={savedToCloud} />
          )}
          {/* Drive gardé en accès de secours pendant la migration — voir plan Firebase étape E */}
          <DriveSyncButton drive={drive} onLoad={handleActivityLoaded} fcMax={fcMax} fcRest={fcRest} />
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
          {/* Input fichier caché pour la fusion de segments */}
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

      {/* ── Contenu principal ── */}
      <ErrorBoundary key={enrichedActivity?.name ?? 'accueil'}>
      <main className="main-content">
        {showAthletePage ? (
          <AthletePage
            drive={drive}
            history={history}
            tsb={tsbResult}
            raceGoal={raceGoal}
            setRaceGoal={setRaceGoal}
            onClearHistory={clearHistory}
            onClose={() => setShowAthletePage(false)}
          />
        ) : !activity ? (
          /* ── Écran d'accueil ── */
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
            <CloudActivityList cloud={cloud} onLoad={handleActivityLoaded} fcMax={fcMax} fcRest={fcRest} />
            {/* Drive gardé en accès de secours pendant la migration — voir plan Firebase étape E */}
            <DriveActivityList drive={drive} onLoad={handleActivityLoaded} fcMax={fcMax} fcRest={fcRest} />
          </div>
        ) : (
          /* ── Dashboard activité ── */
          <>
            {/* Bannière de fusion */}
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

            {/* Titre + badge de classification de session */}
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
                  {/* Bouton bascule running ↔ vélo — utile si le type est mal détecté */}
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

              {/* Badge de classification de session (EF, Tempo, Seuil…) */}
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

            {/* Météo + moment de la journée — Open-Meteo, basée sur le 1er point GPS + l'heure de départ */}
            <WeatherCard weather={weather} loading={weatherLoading} date={enrichedActivity!.startTime} onRefresh={handleRefreshWeather} />

            {/* ── KPI primaires ── */}
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

            {/* ── KPI secondaires (visibles uniquement si FC disponible) ── */}
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
                    {/* Allure cardiaque = allure normalisée à 65% de réserve cardiaque (Karvonen) */}
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
                    {/* IF = NP / FTP — mesure l'intensité relative à la puissance seuil */}
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
                      {/* Cadence GPX stockée en demi-pas/s pour la course ; ×2 pour obtenir ppm */}
                      {enrichedActivity!.activityType === 'cycling' ? enrichedActivity!.avgCadence : (enrichedActivity!.avgCadence ?? 0) * 2}
                      {" "}{enrichedActivity!.activityType === 'cycling' ? 'rpm' : 'ppm'}
                    </strong>
                  </div>
                )}
              </div>
            )}

            {/* Qualité des données — visible uniquement si anomalies détectées */}
            <DataQuality quality={enrichedActivity!.dataQuality} hasHr={hasHeartRate} />

            {/* ── Carte + Graphiques ── */}
            <div id="nav-map" className="content-layout">
              <ErrorBoundary section="Carte">
                <Suspense fallback={<div style={{ height: "100%", minHeight: 320, background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }} />}>
                  <div style={{ height: "100%" }}>
                    <ActivityMap
                      points={enrichedActivity!.points}
                      hoveredPointIndex={hoveredPointIndex}
                      onHoverPointChange={setHoveredPointIndex}
                      hasHeartRate={hasHeartRate}
                    />
                  </div>
                </Suspense>
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

            {/* ── Zones FC Karvonen ── */}
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

            {/* Zones d'allure % VMA — running uniquement */}
            {enrichedActivity!.activityType !== 'cycling' && (
              <PaceZones
                points={enrichedActivity!.points}
                vma={vma}
                onVmaChange={setVma}
              />
            )}

            {/* Zones de puissance Coggan — vélo + capteur de puissance uniquement */}
            {hasPower && enrichedActivity!.activityType === 'cycling' && (
              <PowerZones
                points={enrichedActivity!.points}
                ftp={ftp}
                onFtpChange={setFtp}
                weight={weight}
              />
            )}

            {/* Nuage de points Allure (ou Vitesse) vs FC */}
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

            {/* ── Charge d'entraînement (séance en cours) ── */}
            {trimp && <TrainingLoad trimp={trimp} />}

            {/* Les analyses multi-séances (TSB/CTL/ATL, objectif course, meilleurs efforts, vitesse critique,
                profil athlète, progression) vivent désormais dans la page "Bilan athlète" — voir AthletePage.tsx */}

            {/* Bilan FIT — Training Effect, VO2max montre, récupération, EPOC, feeling */}
            {enrichedActivity!.fitSummary && (
              <FitSummary
                fit={enrichedActivity!.fitSummary}
                fcMax={fcMax}
                vo2maxEst={vo2maxEst}
                trimp={trimp}
              />
            )}

            {/* Estimation VO2max — running uniquement */}
            {vo2maxEst && <VO2maxEstimate estimate={vo2maxEst} />}

            {/* Prédictions VDOT Jack Daniels — running, fiabilité ≥ moyenne */}
            {vo2maxEst && <VDOTPredictor estimate={vo2maxEst} />}

            {/* Métriques de puissance NP/IF/TSS — vélo + capteur de puissance */}
            {normalizedPower !== null && enrichedActivity!.activityType === 'cycling' && (
              <PowerMetrics
                np={normalizedPower}
                ftp={ftp}
                onFtpChange={setFtp}
                movingTime={enrichedActivity!.movingTime}
                weight={weight}
              />
            )}

            {/* Analyse des fractionnés — auto-détectés ou laps montre */}
            {intervals && intervals.length > 0 && (
              <Suspense fallback={null}>
                <IntervalAnalysis
                  intervals={intervals}
                  activityType={enrichedActivity!.activityType}
                  points={enrichedActivity!.points}
                  source={enrichedActivity!.fitLaps?.length ? 'fit' : 'detected'}
                />
              </Suspense>
            )}

            {/* Analyse des montées */}
            {climbs.length > 0 && (
              <Suspense fallback={null}>
                <ClimbAnalysis climbs={climbs} points={enrichedActivity!.points} />
              </Suspense>
            )}

            {/* Répétitions de côtes — running uniquement, ≥ 2 séries détectées */}
            {hillRepeats.length > 0 && (
              <Suspense fallback={null}>
                <HillRepeats series={hillRepeats} points={enrichedActivity!.points} />
              </Suspense>
            )}

            {/* ── Splits ── */}
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

      <FloatingNav visible={!!activity && !showAthletePage} />

      {/* ── Modale résumé IA ── */}
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
            tsbResult,
            history,
            activityDate: enrichedActivity.startTime
              ? enrichedActivity.startTime.toISOString().slice(0, 10)
              : undefined,
            activityName: customActivityName || undefined,
            weather,
          })}
          onClose={() => setShowAISummary(false)}
        />
      )}

      {/* ── Overlay de chargement ── */}
      {/* Le parse GPX/FIT est synchrone sur le thread principal — requestAnimationFrame décale son démarrage. */}
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

      {/* ── Footer ── */}
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
