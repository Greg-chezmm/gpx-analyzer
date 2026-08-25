import React from "react";
import { UserCircle } from "lucide-react";
import type { DriveHandle } from "../hooks/useGoogleDrive";
import { buildAthleteProfile } from "../utils/athleteProfile";

interface Props {
  drive: DriveHandle;
}

/**
 * Profil athlète — synthèse descriptive (discipline dominante, niveau VO2max, profil
 * aérobie/anaérobie, répartition d'intensité) à partir des métriques déjà calculées sur
 * l'historique Drive. Volontairement qualitatif : pas un score validé scientifiquement,
 * juste une lecture d'ensemble de ce que l'app sait déjà de toi (voir athleteProfile.ts).
 */
export const AthleteProfile: React.FC<Props> = ({ drive }) => {
  if (drive.status !== 'connected' || drive.history.length === 0) return null;

  const tags = buildAthleteProfile(drive.history);

  return (
    <div className="card animate-slide-up" id="nav-athlete-profile">
      <div className="panel-header">
        <h3 className="panel-title">
          <UserCircle size={18} style={{ color: "#c084fc" }} />
          <span>Profil athlète</span>
        </h3>
      </div>

      <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>
        Synthèse descriptive à partir de tes séances — pas un score scientifiquement validé,
        juste une lecture d'ensemble de ce que l'app a déjà calculé sur toi.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
        {tags.map(tag => (
          <div key={tag.key} title={tag.detail} style={{
            padding: '0.55rem 0.9rem', borderRadius: 'var(--radius-md)', cursor: 'help',
            backgroundColor: tag.insufficient ? 'var(--bg-primary)' : `${tag.color}14`,
            border: `1px solid ${tag.insufficient ? 'var(--border-color)' : `${tag.color}44`}`,
            minWidth: '160px', flex: '1 1 200px',
          }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: tag.insufficient ? 'var(--text-tertiary)' : tag.color }}>
              {tag.label}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>
              {tag.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
