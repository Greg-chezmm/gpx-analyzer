import { useState } from 'react';
import { Cloud, CloudOff, CloudUpload, Download, Loader2, X, History } from 'lucide-react';
import type { DriveHandle } from '../hooks/useGoogleDrive';
import type { ActivityIndexEntry } from '../utils/driveStorage';

/* ── Header button: connect / show history ─────────────────────────── */

interface DriveSyncButtonProps {
  drive: DriveHandle;
  onLoad: (data: ArrayBuffer | string, name: string, customName?: string) => void;
}

export function DriveSyncButton({ drive, onLoad }: DriveSyncButtonProps) {
  const [open, setOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleLoad = async (entry: ActivityIndexEntry) => {
    if (!entry.fileId) return;
    setLoadingId(entry.fileId);
    try {
      const data = await drive.loadFile(entry.fileId, entry.fileName);
      setOpen(false);
      onLoad(data, entry.fileName, entry.name);
    } catch {
      alert('Impossible de charger le fichier depuis Drive.');
    } finally {
      setLoadingId(null);
    }
  };

  if (drive.status === 'unavailable') return null;

  if (drive.status === 'disconnected' || drive.status === 'error') {
    return (
      <button type="button" className="btn btn-outline" onClick={drive.signIn}
        title="Connecter Google Drive"
        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
      >
        <Cloud size={15} />
        <span className="btn-text">Drive</span>
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
        />
      )}
    </>
  );
}

/* ── Save button: shown in header when activity is loaded ───────────── */

interface DriveSaveButtonProps {
  drive: DriveHandle;
  onSave: () => Promise<void>;
  alreadySaved: boolean;
}

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

/* ── Welcome screen: activity list ─────────────────────────────────── */

interface DriveActivityListProps {
  drive: DriveHandle;
  onLoad: (data: ArrayBuffer | string, name: string, customName?: string) => void;
}

export function DriveActivityList({ drive, onLoad }: DriveActivityListProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  if (drive.status !== 'connected' || drive.history.length === 0) return null;

  const handleLoad = async (entry: ActivityIndexEntry) => {
    if (!entry.fileId) return;
    setLoadingId(entry.fileId);
    try {
      const data = await drive.loadFile(entry.fileId, entry.fileName);
      onLoad(data, entry.fileName, entry.name);
    } catch {
      alert('Impossible de charger le fichier depuis Drive.');
    } finally {
      setLoadingId(null);
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
        {drive.history.slice(0, 8).map((entry, i) => (
          <button key={entry.fileId ?? i} type="button"
            disabled={!entry.fileId || loadingId !== null}
            onClick={() => handleLoad(entry)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.75rem 1rem', textAlign: 'left',
              background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)', cursor: entry.fileId ? 'pointer' : 'default',
              opacity: loadingId === entry.fileId ? 0.6 : 1,
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => {
              if (entry.fileId) {
                (e.currentTarget as HTMLElement).style.borderColor = '#1a73e8';
                (e.currentTarget as HTMLElement).style.background = 'rgba(26,115,232,0.04)';
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)';
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)';
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>
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
        ))}
      </div>
    </div>
  );
}

/* ── History slide panel ────────────────────────────────────────────── */

interface DriveHistoryPanelProps {
  drive: DriveHandle;
  loadingId: string | null;
  onLoad: (entry: ActivityIndexEntry) => void;
  onClose: () => void;
}

function DriveHistoryPanel({ drive, loadingId, onLoad, onClose }: DriveHistoryPanelProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '420px', maxWidth: '100vw', height: '100vh',
        background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Header */}
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

        {/* List */}
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
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {drive.history.map((entry, i) => (
                <button key={entry.fileId ?? i} type="button"
                  disabled={!entry.fileId || loadingId !== null}
                  onClick={() => entry.fileId && onLoad(entry)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.9rem 1rem', textAlign: 'left',
                    background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    cursor: entry.fileId ? 'pointer' : 'default',
                    opacity: loadingId === entry.fileId ? 0.6 : 1,
                    transition: 'border-color 0.15s',
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
