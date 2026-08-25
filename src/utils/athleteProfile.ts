import type { ActivityIndexEntry } from './driveStorage';
import { estimateCriticalSpeedFromHistory, dPrimeProfile } from './criticalSpeed';

// ─── Profil athlète — synthèse descriptive à partir des métriques déjà calculées ────────────────
//
// Volontairement qualitatif, pas un score validé scientifiquement : combine ce qu'on a déjà
// (D'/CS, VO2max, classification de séance, répartition course/vélo) en quelques tags lisibles,
// sans prétendre à une précision que les données ne permettent pas (pas de protocole de test dédié).

export interface ProfileTag {
  key: string;
  label: string;
  detail: string;
  color: string;
  insufficient?: boolean;
}

const MIN_SESSIONS_FOR_DISTRIBUTION = 8;

/** Discipline dominante — répartition du nombre de séances course vs vélo. */
function disciplineTag(history: ActivityIndexEntry[]): ProfileTag {
  const run = history.filter(e => e.activityType !== 'cycling').length;
  const bike = history.filter(e => e.activityType === 'cycling').length;
  const total = run + bike;
  if (total === 0) {
    return { key: 'discipline', label: 'Discipline', detail: 'Aucune activité enregistrée', color: 'var(--text-tertiary)', insufficient: true };
  }
  const runPct = run / total;
  if (runPct >= 0.8) return { key: 'discipline', label: '🏃 Coureur', detail: `${run} course${run > 1 ? 's' : ''} sur ${total} séances`, color: '#818cf8' };
  if (runPct <= 0.2) return { key: 'discipline', label: '🚴 Cycliste', detail: `${bike} vélo${bike > 1 ? 's' : ''} sur ${total} séances`, color: '#34d399' };
  return { key: 'discipline', label: '🏃🚴 Multisport', detail: `${run} course${run > 1 ? 's' : ''} · ${bike} vélo${bike > 1 ? 's' : ''}`, color: '#fbbf24' };
}

/** Répartition d'intensité (polarisé / pyramidal / mixte) déduite de la classification de séance déjà stockée. */
function intensityDistributionTag(history: ActivityIndexEntry[]): ProfileTag {
  const classified = history.filter(e => e.sessionType);
  if (classified.length < MIN_SESSIONS_FOR_DISTRIBUTION) {
    return {
      key: 'distribution', label: 'Répartition d\'intensité',
      detail: `${classified.length}/${MIN_SESSIONS_FOR_DISTRIBUTION} séances classifiées minimum`,
      color: 'var(--text-tertiary)', insufficient: true,
    };
  }
  const n = classified.length;
  const low = classified.filter(e => ['Récupération', 'Endurance aérobie', 'Sortie longue'].includes(e.sessionType!)).length / n;
  const moderate = classified.filter(e => ['Aérobie / Tempo', 'Seuil'].includes(e.sessionType!)).length / n;

  if (low >= 0.75 && moderate <= 0.15) {
    return { key: 'distribution', label: 'Polarisé', detail: `${Math.round(low * 100)}% facile/long, peu de seuil — modèle 80/20`, color: '#34d399' };
  }
  if (moderate >= 0.25) {
    return { key: 'distribution', label: 'Pyramidal / seuil-dominant', detail: `${Math.round(moderate * 100)}% séances allure seuil/tempo`, color: '#fbbf24' };
  }
  return { key: 'distribution', label: 'Mixte', detail: 'Ne suit pas nettement un modèle polarisé ni pyramidal', color: '#60a5fa' };
}

/** Profil aérobie/anaérobie déduit de D' (vitesse critique) — voir criticalSpeed.ts. */
function anaerobicProfileTag(history: ActivityIndexEntry[]): ProfileTag {
  const cs = estimateCriticalSpeedFromHistory(history);
  if (!cs) {
    return {
      key: 'anaerobic', label: 'Profil aérobie/anaérobie',
      detail: 'Pas assez de records personnels sur des segments plats pour estimer D\'',
      color: 'var(--text-tertiary)', insufficient: true,
    };
  }
  const profile = dPrimeProfile(cs.dPrime);
  const labels = {
    endurant:  { label: 'Endurant', color: '#60a5fa' },
    equilibre: { label: 'Équilibré', color: '#34d399' },
    explosif:  { label: 'Explosif', color: '#f472b6' },
  };
  return { key: 'anaerobic', ...labels[profile], detail: `D' ≈ ${Math.round(cs.dPrime)} m (fiabilité ${cs.confidence})` };
}

/** Niveau VO2max — reprend la meilleure estimation fiable (confiance ≠ faible) déjà stockée dans l'index. */
function vo2maxLevelTag(history: ActivityIndexEntry[]): ProfileTag {
  const withVo2 = history
    .filter(e => e.vo2max && e.vo2maxConfidence && e.vo2maxConfidence !== 'low')
    .sort((a, b) => b.date.localeCompare(a.date));
  if (withVo2.length === 0) {
    return { key: 'vo2max', label: 'Niveau VO2max', detail: 'Pas d\'estimation fiable disponible', color: 'var(--text-tertiary)', insufficient: true };
  }
  const v = withVo2[0].vo2max!;
  const levels: { max: number; label: string; color: string }[] = [
    { max: 30,  label: 'Faible',   color: '#ef4444' },
    { max: 40,  label: 'Moyen',    color: '#f97316' },
    { max: 50,  label: 'Correct',  color: '#fbbf24' },
    { max: 60,  label: 'Bon',      color: '#34d399' },
    { max: 70,  label: 'Très bon', color: '#60a5fa' },
    { max: Infinity, label: 'Élite', color: '#a78bfa' },
  ];
  const level = levels.find(l => v < l.max) ?? levels[levels.length - 1];
  return { key: 'vo2max', label: level.label, detail: `VO2max ≈ ${v} mL/kg/min (${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(withVo2[0].date))})`, color: level.color };
}

/** Construit les tags descriptifs du profil athlète à partir de l'historique Drive. */
export function buildAthleteProfile(history: ActivityIndexEntry[]): ProfileTag[] {
  return [
    disciplineTag(history),
    vo2maxLevelTag(history),
    anaerobicProfileTag(history),
    intensityDistributionTag(history),
  ];
}
