import { useState, type MouseEvent } from 'react';
import { Cloud, CloudOff, CloudUpload, Download, Loader2, X, History, Trash2, Flag, Search, Zap } from 'lucide-react';
import type { DriveHandle } from '../hooks/useGoogleDrive';
import type { ActivityIndexEntry } from '../utils/driveStorage';
import { entryToWeather, type WeatherInfo } from '../utils/weather';
import { parseGPX } from '../utils/gpxCore';
import { computeBestEfforts } from '../utils/bestEfforts';
import { calcTRIMP } from '../utils/trainingMetrics';

/* ── Bouton header : connexion / accès à l'historique ──────────────────── */

interface DriveSyncButtonProps {
  drive: DriveHandle;
  onLoad: (data: ArrayBuffer | string, name: string, customName?: string, storedWeather?: WeatherInfo) => void;
  fcMax: number;
  fcRest: number;
}

/**
 * Bouton Drive dans la barre de navigation — se connecte, se reconnecte,
 * ou ouvre le panneau historique selon l'état de connexion.
 */
export function DriveSyncButton({ drive, onLoad, fcMax, fcRest }: DriveSyncButtonProps) {
  const [open, setOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleLoad = async (entry: ActivityIndexEntry) => {
    if (!entry.fileId) return;
    setLoadingId(entry.fileId);
    try {
      const data = await drive.loadFile(entry.fileId, entry.fileName);
      setOpen(false);
      onLoad(data, entry.fileName, entry.name, entryToWeather(entry));
    } catch {
      alert('Impossible de charger le fichier depuis Drive.');
    } finally {
      setLoadingId(null);
    }
  };

  if (drive.status === 'unavailable') return null;

  if (drive.status === 'disconnected' || drive.status === 'error') {
    const isReconnect = drive.wasAuthorized;
    return (
      <button type="button" className="btn btn-outline" onClick={drive.signIn}
        title={isReconnect ? "Reconnecter Google Drive" : "Connecter Google Drive"}
        style={{
          padding: '0.5rem 1rem', fontSize: '0.9rem',
          // Teinte ambrée pour signaler une reconnexion nécessaire
          ...(isReconnect ? {
            borderColor: '#f59e0b',
            color: '#f59e0b',
            backgroundColor: 'rgba(245,158,11,0.08)',
          } : {}),
        }}
      >
        {isReconnect ? <CloudOff size={15} /> : <Cloud size={15} />}
        <span className="btn-text">{isReconnect ? 'Reconnecter' : 'Drive'}</span>
      </button>
    );
  }

  if (drive.status === 'connecting') {
    return (
      <button type="button" className="btn btn-outline" disabled
        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
      >
        <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} />
        <span className="btn-text">Connexion…</span>
      </button>
    );
  }

  return (
    <>
      <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}
        title="Historique Drive"
        style={{
          padding: '0.5rem 1rem', fontSize: '0.9rem',
          borderColor: '#1a73e8', color: '#1a73e8',
          backgroundColor: 'rgba(26,115,232,0.06)',
        }}
      >
        <Cloud size={15} />
        <span className="btn-text">
          {drive.history.length > 0 ? `${drive.history.length} activité${drive.history.length > 1 ? 's' : ''}` : 'Drive'}
        </span>
      </button>

      {open && (
        <DriveHistoryPanel
          drive={drive}
          loadingId={loadingId}
          onLoad={handleLoad}
          onClose={() => setOpen(false)}
          fcMax={fcMax}
          fcRest={fcRest}
        />
      )}
    </>
  );
}

/* ── Bouton sauvegarde : affiché dans le header quand une activité est ouverte ── */

interface DriveSaveButtonProps {
  drive: DriveHandle;
  onSave: () => Promise<void>;
  alreadySaved: boolean;
}

/**
 * Bouton de sauvegarde Drive — visible uniquement quand connecté ;
 * désactivé si l'activité est déjà enregistrée.
 */
export function DriveSaveButton({ drive, onSave, alreadySaved }: DriveSaveButtonProps) {
  if (drive.status !== 'connected') return null;

  return (
    <button type="button" className="btn btn-outline"
      onClick={onSave}
      disabled={drive.isSaving || alreadySaved}
      title={alreadySaved ? 'Déjà sauvegardé dans Drive' : 'Sauvegarder dans Drive'}
      style={{
        padding: '0.5rem 1rem', fontSize: '0.9rem',
        borderColor: alreadySaved ? 'var(--color-ele)' : '#1a73e8',
        color: alreadySaved ? 'var(--color-ele)' : '#1a73e8',
        backgroundColor: alreadySaved ? 'rgba(5,150,105,0.06)' : 'rgba(26,115,232,0.06)',
        opacity: drive.isSaving ? 0.7 : 1,
      }}
    >
      {drive.isSaving
        ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} />
        : alreadySaved
          ? <Cloud size={15} />
          : <CloudUpload size={15} />
      }
      <span className="btn-text">
        {drive.isSaving ? 'Sauvegarde…' : alreadySaved ? 'Sauvegardé' : 'Sauvegarder'}
      </span>
    </button>
  );
}

/** Bouton drapeau — marque/démarque une activité Drive comme course (calibration TSB, voir RaceGoal.tsx). */
function RaceFlagButton({ entry, drive }: { entry: ActivityIndexEntry; drive: DriveHandle }) {
  const [pending, setPending] = useState(false);
  const isRace = !!entry.isRace;

  const toggle = async (e: MouseEvent) => {
    e.stopPropagation();
    setPending(true);
    try {
      await drive.updateActivityMeta({ date: entry.date, name: entry.name }, { isRace: !isRace });
    } catch {
      alert("Impossible de mettre à jour l'activité.");
    } finally {
      setPending(false);
    }
  };

  return (
    <button type="button" onClick={toggle} disabled={pending}
      title={isRace ? 'Retirer le marquage course' : 'Marquer comme course (calibration objectif)'}
      style={{
        padding: '0.35rem', background: 'transparent', border: 'none',
        cursor: pending ? 'default' : 'pointer', borderRadius: 'var(--radius-sm)',
        display: 'flex', alignItems: 'center', opacity: pending ? 0.5 : 1,
        color: isRace ? '#f472b6' : 'var(--text-tertiary)',
      }}
      onMouseEnter={e => { if (!isRace) (e.currentTarget as HTMLElement).style.color = '#f472b6'; }}
      onMouseLeave={e => { if (!isRace) (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'; }}
    >
      {pending ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Flag size={14} fill={isRace ? '#f472b6' : 'none'} />}
    </button>
  );
}

/**
 * Bouton de recalcul des meilleurs efforts pour une activité déjà sauvegardée (ajoutée avant l'introduction
 * de cette fonctionnalité, ou à rafraîchir après une amélioration de l'algorithme). Télécharge et reparse le
 * fichier — plus coûteux qu'à la sauvegarde initiale (déjà en mémoire), donc laissé à l'initiative de Greg
 * activité par activité plutôt qu'en masse.
 */
function RecomputeBestEffortsButton({ entry, drive, fcMax, fcRest }: { entry: ActivityIndexEntry; drive: DriveHandle; fcMax: number; fcRest: number }) {
  const [pending, setPending] = useState(false);
  const done = !!entry.bestEfforts;

  const recompute = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!entry.fileId || pending) return;
    setPending(true);
    try {
      const data = await drive.loadFile(entry.fileId, entry.fileName);
      const isFit = entry.fileName.toLowerCase().endsWith('.fit');
      const parsed = isFit
        ? await import('../utils/fitParser').then(m => m.parseFIT(data as ArrayBuffer, entry.name))
        : parseGPX(data as string, entry.name);
      const bestEfforts = computeBestEfforts(parsed.points, entry.activityType) ?? undefined;
      const zoneMinutes = calcTRIMP(parsed.points, fcMax, fcRest)?.zoneMinutes;
      await drive.updateActivityMeta({ date: entry.date, name: entry.name }, { bestEfforts, zoneMinutes });
    } catch {
      alert("Impossible de calculer les meilleurs efforts pour cette activité.");
    } finally {
      setPending(false);
    }
  };

  return (
    <button type="button" onClick={recompute} disabled={pending || !entry.fileId}
      title={done ? 'Recalculer les meilleurs efforts et zones FC' : 'Calculer les meilleurs efforts et zones FC (télécharge et reparse le fichier)'}
      style={{
        padding: '0.35rem', background: 'transparent', border: 'none',
        cursor: pending ? 'default' : 'pointer', borderRadius: 'var(--radius-sm)',
        display: 'flex', alignItems: 'center', opacity: pending ? 0.5 : 1,
        color: done ? '#fbbf24' : 'var(--text-tertiary)',
      }}
      onMouseEnter={e => { if (!done) (e.currentTarget as HTMLElement).style.color = '#fbbf24'; }}
      onMouseLeave={e => { if (!done) (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'; }}
    >
      {pending ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Zap size={14} fill={done ? '#fbbf24' : 'none'} />}
    </button>
  );
}

/* ── Liste d'activités sur l'écran d'accueil ────────────────────────────── */

interface DriveActivityListProps {
  drive: DriveHandle;
  onLoad: (data: ArrayBuffer | string, name: string, customName?: string, storedWeather?: WeatherInfo) => void;
  fcMax: number;
  fcRest: number;
}

/**
 * Liste des activités récentes Drive affichée sur l'écran d'accueil —
 * permet de charger ou supprimer une activité.
 */
export function DriveActivityList({ drive, onLoad, fcMax, fcRest }: DriveActivityListProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  if (drive.status !== 'connected' || drive.history.length === 0) return null;

  /** Clé stable pour l'entrée : fileId si disponible, sinon date+index. */
  const entryKey = (entry: ActivityIndexEntry, i: number) => entry.fileId ?? `${entry.date}-${i}`;

  const handleLoad = async (entry: ActivityIndexEntry) => {
    if (!entry.fileId) return;
    setLoadingId(entry.fileId);
    try {
      const data = await drive.loadFile(entry.fileId, entry.fileName);
      onLoad(data, entry.fileName, entry.name, entryToWeather(entry));
    } catch {
      alert('Impossible de charger le fichier depuis Drive.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (entry: ActivityIndexEntry, key: string) => {
    setDeletingKey(key);
    setConfirmKey(null);
    try {
      await drive.deleteActivity(entry.fileId, { date: entry.date, name: entry.name });
    } catch {
      alert('Impossible de supprimer l\'activité.');
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <div style={{ marginTop: '2rem', width: '100%', maxWidth: '680px' }}>
      <h3 style={{
        fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: 'var(--text-secondary)',
        marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
      }}>
        <History size={14} /> Activités récentes · Drive
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {/* Triées par date décroissante, limitées aux 8 dernières */}
        {[...drive.history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((entry, i) => {
          const key = entryKey(entry, i);
          const isConfirming = confirmKey === key;
          const isDeleting = deletingKey === key;
          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
              border: `1px solid ${isConfirming ? '#ef4444' : 'var(--border-color)'}`,
              transition: 'border-color 0.15s',
            }}>
              <button type="button"
                disabled={!entry.fileId || loadingId !== null || isDeleting}
                onClick={() => handleLoad(entry)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem 1rem', textAlign: 'left',
                  background: 'transparent', border: 'none',
                  cursor: entry.fileId ? 'pointer' : 'default',
                  opacity: loadingId === entry.fileId || isDeleting ? 0.6 : 1,
                  borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
                  minWidth: 0,
                }}
                onMouseEnter={e => {
                  if (entry.fileId && !isDeleting) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(26,115,232,0.04)';
                  }
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>
                  {entry.activityType === 'cycling' ? '🚴' : '🏃'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 600, fontSize: '0.9rem',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: 'var(--text-primary)',
                  }}>
                    {entry.name}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(entry.date))}
                    {' · '}
                    {(entry.distance / 1000).toFixed(1)} km
                    {entry.elevationGain > 0 ? ` · +${entry.elevationGain} m` : ''}
                    {entry.trimp ? ` · TRIMP ${Math.round(entry.trimp)}` : ''}
                  </div>
                </div>
                {loadingId === entry.fileId
                  ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite', color: '#1a73e8', flexShrink: 0 }} />
                  : entry.fileId
                    ? <Download size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    : null
                }
              </button>

              {/* Zone de suppression avec confirmation en deux clics */}
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.25rem', paddingRight: '0.5rem' }}>
                <RaceFlagButton entry={entry} drive={drive} />
                <RecomputeBestEffortsButton entry={entry} drive={drive} fcMax={fcMax} fcRest={fcRest} />
                {isConfirming ? (
                  <>
                    <button type="button"
                      onClick={() => handleDelete(entry, key)}
                      title="Confirmer la suppression"
                      style={{
                        padding: '0.3rem 0.5rem', fontSize: '0.75rem', fontWeight: 700,
                        background: '#ef4444', color: '#fff', border: 'none',
                        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      }}
                    >
                      Supprimer
                    </button>
                    <button type="button"
                      onClick={() => setConfirmKey(null)}
                      title="Annuler"
                      style={{
                        padding: '0.3rem 0.5rem', fontSize: '0.75rem',
                        background: 'transparent', color: 'var(--text-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      }}
                    >
                      Annuler
                    </button>
                  </>
                ) : isDeleting ? (
                  <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite', color: '#ef4444' }} />
                ) : (
                  <button type="button"
                    onClick={e => { e.stopPropagation(); setConfirmKey(key); }}
                    title="Supprimer de Drive"
                    style={{
                      padding: '0.35rem', background: 'transparent', border: 'none',
                      cursor: 'pointer', color: 'var(--text-tertiary)', borderRadius: 'var(--radius-sm)',
                      display: 'flex', alignItems: 'center',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Panneau latéral d'historique (slide-in) ────────────────────────────── */

interface DriveHistoryPanelProps {
  drive: DriveHandle;
  loadingId: string | null;
  onLoad: (entry: ActivityIndexEntry) => void;
  onClose: () => void;
  fcMax: number;
  fcRest: number;
}

/**
 * Panneau latéral pleine hauteur listant toutes les activités Drive —
 * s'ouvre depuis DriveSyncButton, permet le chargement et la suppression.
 */
function DriveHistoryPanel({ drive, loadingId, onLoad, onClose, fcMax, fcRest }: DriveHistoryPanelProps) {
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const entryKey = (entry: ActivityIndexEntry, i: number) => entry.fileId ?? `${entry.date}-${i}`;

  /** Filtre une activité sur son nom, sa date (fr) ou sa discipline. */
  const matchesQuery = (entry: ActivityIndexEntry) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const dateStr = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(entry.date));
    const typeStr = entry.activityType === 'cycling' ? 'vélo cyclisme' : 'course running';
    return entry.name.toLowerCase().includes(q)
      || entry.date.includes(q)
      || dateStr.toLowerCase().includes(q)
      || typeStr.includes(q);
  };

  const handleDelete = async (entry: ActivityIndexEntry, key: string) => {
    setDeletingKey(key);
    setConfirmKey(null);
    try {
      await drive.deleteActivity(entry.fileId, { date: entry.date, name: entry.name });
    } catch {
      alert('Impossible de supprimer l\'activité.');
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
      }}
      // Fermeture en cliquant sur le fond semi-transparent
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '420px', maxWidth: '100vw', height: '100vh',
        background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* En-tête sticky */}
        <div style={{
          padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Cloud size={20} style={{ color: '#1a73e8' }} />
            <div>
              <h3 style={{ fontWeight: 700, fontSize: '1rem', margin: 0, color: 'var(--text-primary)' }}>
                Activités Drive
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {drive.history.length} séance{drive.history.length > 1 ? 's' : ''} sauvegardée{drive.history.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-outline"
              onClick={drive.signOut}
              title="Déconnecter Drive"
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}
            >
              <CloudOff size={13} />
            </button>
            <button type="button" className="btn btn-outline"
              onClick={onClose}
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Recherche */}
        {drive.history.length > 0 && (
          <div style={{
            padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
          }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{
                position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-tertiary)', pointerEvents: 'none',
              }} />
              <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Rechercher par nom, date, discipline…"
                style={{
                  width: '100%', padding: '0.5rem 0.6rem 0.5rem 2rem', fontSize: '0.85rem',
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)',
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                }}
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} title="Effacer"
                  style={{
                    position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)',
                    display: 'flex', padding: '0.2rem',
                  }}>
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Liste */}
        <div style={{ flex: 1, padding: '1rem' }}>
          {drive.history.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '3rem 1rem',
              color: 'var(--text-secondary)',
            }}>
              <History size={40} style={{ opacity: 0.25, marginBottom: '1rem' }} />
              <p style={{ fontWeight: 600 }}>Aucune activité sauvegardée</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>
                Chargez un fichier GPX/FIT et cliquez sur "Sauvegarder"
              </p>
            </div>
          ) : [...drive.history].filter(matchesQuery).length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '3rem 1rem',
              color: 'var(--text-secondary)',
            }}>
              <Search size={40} style={{ opacity: 0.25, marginBottom: '1rem' }} />
              <p style={{ fontWeight: 600 }}>Aucun résultat pour « {query} »</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[...drive.history].filter(matchesQuery).sort((a, b) => b.date.localeCompare(a.date)).map((entry, i) => {
                const key = entryKey(entry, i);
                const isConfirming = confirmKey === key;
                const isDeleting = deletingKey === key;
                return (
                  <div key={key} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)',
                    border: `1px solid ${isConfirming ? '#ef4444' : 'var(--border-color)'}`,
                    transition: 'border-color 0.15s',
                  }}>
                    <button type="button"
                      disabled={!entry.fileId || loadingId !== null || isDeleting}
                      onClick={() => entry.fileId && onLoad(entry)}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.9rem 1rem', textAlign: 'left',
                        background: 'transparent', border: 'none',
                        cursor: entry.fileId ? 'pointer' : 'default',
                        opacity: loadingId === entry.fileId || isDeleting ? 0.6 : 1,
                        borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
                        minWidth: 0,
                      }}
                    >
                      <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>
                        {entry.activityType === 'cycling' ? '🚴' : '🏃'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {entry.name}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                          {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(entry.date))}
                          {' · '}
                          {(entry.distance / 1000).toFixed(1)} km
                          {entry.elevationGain > 0 ? ` · +${entry.elevationGain} m` : ''}
                        </div>
                        {(entry.avgHeartRate || entry.trimp) && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>
                            {entry.avgHeartRate ? `FC moy. ${entry.avgHeartRate} bpm` : ''}
                            {entry.avgHeartRate && entry.trimp ? ' · ' : ''}
                            {entry.trimp ? `TRIMP ${Math.round(entry.trimp)}` : ''}
                          </div>
                        )}
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        {loadingId === entry.fileId
                          ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite', color: '#1a73e8' }} />
                          : entry.fileId
                            ? <Download size={14} style={{ color: 'var(--text-tertiary)' }} />
                            : null
                        }
                      </div>
                    </button>

                    {/* Zone de suppression avec confirmation en deux clics */}
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.25rem', paddingRight: '0.5rem' }}>
                      <RaceFlagButton entry={entry} drive={drive} />
                      <RecomputeBestEffortsButton entry={entry} drive={drive} fcMax={fcMax} fcRest={fcRest} />
                      {isConfirming ? (
                        <>
                          <button type="button"
                            onClick={() => handleDelete(entry, key)}
                            title="Confirmer la suppression"
                            style={{
                              padding: '0.3rem 0.5rem', fontSize: '0.75rem', fontWeight: 700,
                              background: '#ef4444', color: '#fff', border: 'none',
                              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                            }}
                          >
                            Supprimer
                          </button>
                          <button type="button"
                            onClick={() => setConfirmKey(null)}
                            title="Annuler"
                            style={{
                              padding: '0.3rem 0.5rem', fontSize: '0.75rem',
                              background: 'transparent', color: 'var(--text-secondary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                            }}
                          >
                            Annuler
                          </button>
                        </>
                      ) : isDeleting ? (
                        <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite', color: '#ef4444' }} />
                      ) : (
                        <button type="button"
                          onClick={e => { e.stopPropagation(); setConfirmKey(key); }}
                          title="Supprimer de Drive"
                          style={{
                            padding: '0.35rem', background: 'transparent', border: 'none',
                            cursor: 'pointer', color: 'var(--text-tertiary)', borderRadius: 'var(--radius-sm)',
                            display: 'flex', alignItems: 'center',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
