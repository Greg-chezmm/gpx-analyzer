import React, { useState } from "react";
import { Layers } from "lucide-react";
import type { CloudHandle } from "../hooks/useFirebaseCloud";
import { aggregateZoneDistribution, type PolarizationClass } from "../utils/polarization";

interface Props {
  cloud: CloudHandle;
}

type WindowOpt = 28 | 84 | null; // 4 sem / 12 sem / tout

const WINDOW_OPTS: { value: WindowOpt; label: string }[] = [
  { value: 28,   label: "4 sem" },
  { value: 84,   label: "12 sem" },
  { value: null, label: "Tout" },
];

const CLASS_INFO: Record<PolarizationClass, { label: string; color: string; detail: string }> = {
  polarise:    { label: "Polarisé",  color: "#34d399", detail: "≥75% de temps facile, ≤15% en zone modérée — proche du modèle 80/20 souvent associé à la progression chez les coureurs entraînés." },
  pyramidal:   { label: "Pyramidal / seuil-dominant", color: "#fbbf24", detail: "≥25% du temps en zone modérée (seuil/tempo) — plus de volume à allure moyenne que dans un modèle polarisé strict." },
  mixte:       { label: "Mixte", color: "#60a5fa", detail: "Ne suit nettement aucun des deux modèles sur cette période." },
  insuffisant: { label: "Données insuffisantes", color: "var(--text-tertiary)", detail: "Moins de 8 séances avec zones calculées sur cette période — pas assez pour classifier de façon fiable." },
};

/** Formate des minutes en h:mm ou minutes seules. */
function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return h > 0 ? `${h}h${mm.toString().padStart(2, '0')}` : `${mm}min`;
}

/**
 * Répartition polarisée de la charge — regroupe les zones FC (Z1-Z5) en 3 blocs Facile/Modéré/Intense
 * (modèle 3-zones de Seiler) et compare à la référence "polarisée" 80/20 souvent citée dans la littérature
 * entraînement. Agrégé depuis `zoneMinutes` stocké par activité (voir polarization.ts) — activités
 * sauvegardées avant l'ajout de ce champ non incluses.
 */
export const PolarizationChart: React.FC<Props> = ({ cloud }) => {
  const [windowDays, setWindowDays] = useState<WindowOpt>(84);

  if (cloud.status !== 'connected') return null;

  const result = aggregateZoneDistribution(cloud.history, windowDays ?? undefined);
  if (!result) return null;

  const info = CLASS_INFO[result.classification];
  const maxWeekTotal = Math.max(...result.weeks.map(w => w.lowMin + w.modMin + w.highMin), 1);

  return (
    <div className="card animate-slide-up" id="nav-polarization">
      <div className="panel-header">
        <h3 className="panel-title">
          <Layers size={18} style={{ color: "#34d399" }} />
          <span>Répartition polarisée de la charge</span>
        </h3>
        <div style={{ display: "flex", gap: "2px", background: "var(--bg-primary)", padding: "2px",
          borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
          {WINDOW_OPTS.map(opt => (
            <button key={opt.label} type="button" onClick={() => setWindowDays(opt.value)}
              style={{
                padding: "0.15rem 0.55rem", fontSize: "0.75rem", fontWeight: 600, border: "none", cursor: "pointer",
                borderRadius: "calc(var(--radius-sm) - 2px)",
                background: windowDays === opt.value ? "var(--accent-primary)" : "transparent",
                color: windowDays === opt.value ? "#fff" : "var(--text-secondary)",
              }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <p style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", marginBottom: "0.85rem" }}>
        <strong>Facile</strong> (Z1+Z2, sous le seuil aérobie) · <strong>Modéré</strong> (Z3+Z4, allure seuil/tempo)
        · <strong>Intense</strong> (Z5, au-dessus du seuil). Le modèle "polarisé" (recherche Seiler) vise ~80%
        facile / ≤20% modéré+intense, en minimisant surtout la zone modérée — repère indicatif, pas une règle absolue.
      </p>

      <div title={info.detail} style={{
        display: "inline-block", marginBottom: "0.75rem", cursor: 'help',
        padding: "0.3rem 0.85rem", borderRadius: "var(--radius-full)",
        backgroundColor: `${info.color}18`, border: `1px solid ${info.color}44`,
        fontSize: "0.82rem", fontWeight: 700, color: info.color,
      }}>
        {info.label}
      </div>
      <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>{info.detail}</p>

      {/* Barre empilée globale avec repère 80% */}
      <div style={{ position: 'relative', marginBottom: '0.4rem' }}>
        <div style={{ display: 'flex', height: '28px', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          <div style={{ width: `${result.lowPct}%`, background: '#34d399' }} />
          <div style={{ width: `${result.modPct}%`, background: '#fbbf24' }} />
          <div style={{ width: `${result.highPct}%`, background: '#ef4444' }} />
        </div>
        <div style={{
          position: 'absolute', left: '80%', top: 0, bottom: 0, width: 0,
          borderLeft: '2px dashed var(--text-primary)', opacity: 0.4,
        }} title="Repère 80% (référence polarisée)" />
      </div>
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.78rem', marginBottom: '1rem' }}>
        <span style={{ color: '#34d399', fontWeight: 700 }}>Facile {result.lowPct.toFixed(0)}% ({fmtMin(result.lowMin)})</span>
        <span style={{ color: '#fbbf24', fontWeight: 700 }}>Modéré {result.modPct.toFixed(0)}% ({fmtMin(result.modMin)})</span>
        <span style={{ color: '#ef4444', fontWeight: 700 }}>Intense {result.highPct.toFixed(0)}% ({fmtMin(result.highMin)})</span>
        <span style={{ color: 'var(--text-tertiary)' }}>{result.sessionCount} séance{result.sessionCount > 1 ? 's' : ''}</span>
      </div>

      {/* Détail par semaine */}
      {result.weeks.length >= 2 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '90px', marginBottom: '0.4rem', overflowX: 'auto' }}>
          {result.weeks.map(w => {
            const total = w.lowMin + w.modMin + w.highMin;
            const h = (total / maxWeekTotal) * 84;
            return (
              <div key={w.weekStart}
                title={`Semaine du ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(w.weekStart))} — ${fmtMin(total)}`}
                style={{
                  flex: '0 0 auto', width: '14px', height: `${Math.max(h, 2)}px`,
                  display: 'flex', flexDirection: 'column-reverse', borderRadius: '2px', overflow: 'hidden', cursor: 'help',
                }}>
                {total > 0 && (
                  <>
                    <div style={{ height: `${(w.lowMin / total) * 100}%`, background: '#34d399' }} />
                    <div style={{ height: `${(w.modMin / total) * 100}%`, background: '#fbbf24' }} />
                    <div style={{ height: `${(w.highMin / total) * 100}%`, background: '#ef4444' }} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {result.weeks.length >= 2 && (
        <div style={{ fontSize: '0.71rem', color: 'var(--text-tertiary)' }}>
          Une barre par semaine (hauteur = volume total), du plus ancien au plus récent.
        </div>
      )}

    </div>
  );
};
