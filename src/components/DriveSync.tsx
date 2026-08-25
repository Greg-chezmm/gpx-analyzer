import { Cloud, CloudUpload, Loader2 } from 'lucide-react';
import type { DriveHandle } from '../hooks/useGoogleDrive';

/* ── Bouton d'export manuel de secours vers Google Drive ──────────────────
   Le flux principal de sauvegarde/chargement passe désormais par Firebase
   (métadonnées Firestore + fichier brut Drive, voir CloudSync.tsx) ; ce
   bouton reste disponible pour garder une copie manuelle sur Drive seul. */

interface DriveSaveButtonProps {
  drive: DriveHandle;
  onSave: () => Promise<void>;
  alreadySaved: boolean;
}

/** Bouton de sauvegarde Drive — export manuel de secours, indépendant du flux cloud principal. */
export function DriveSaveButton({ drive, onSave, alreadySaved }: DriveSaveButtonProps) {
  if (drive.status !== 'connected') return null;

  return (
    <button type="button" className="btn btn-outline"
      onClick={onSave}
      disabled={drive.isSaving || alreadySaved}
      title={alreadySaved ? 'Déjà exportée vers Drive' : 'Exporter une copie de secours vers Drive'}
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
        {drive.isSaving ? 'Export…' : alreadySaved ? 'Exporté (Drive)' : 'Exporter (Drive)'}
      </span>
    </button>
  );
}
