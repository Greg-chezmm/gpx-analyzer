import React from "react";
import { Gauge } from "lucide-react";
import type { CloudHandle } from "../hooks/useFirebaseCloud";
import type { ManualBests } from "../hooks/useManualBests";
import { estimateCriticalSpeedFromHistory, dPrimeProfile } from "../utils/criticalSpeed";
import { formatPace as fmtPace } from "./SplitsTable";

interface Props {
  cloud: CloudHandle;
  manualBests: ManualBests;
}

const CONFIDENCE_LABELS = {
  high:   { label: "Élevée",  color: "#34d399", title: "≥3 records dans la fenêtre 2-30 min, avec un bon ajustement au modèle (R² ≥ 0,98)." },
  medium: { label: "Moyenne", color: "#fbbf24", title: "2 records seulement — une droite passe toujours exactement par 2 points, donc ça ne confirme pas la validité du modèle." },
  low:    { label: "Faible",  color: "#f97316", title: "L'ajustement est imprécis (R² faible) — tes records ne suivent pas bien la relation distance/temps attendue." },
};

const D_PRIME_DESCRIPTIONS: Record<ReturnType<typeof dPrimeProfile>, string> = {
  endurant:  "réserve modeste — profil plutôt endurant, peu de marge pour un finish sprinté au-delà de ton allure critique",
  equilibre: "réserve dans la norme des coureurs entraînés (repère usuel ~150-400 m)",
  explosif:  "réserve confortable — bonne capacité à accélérer/sprinter au-delà de ton allure critique",
};

/**
 * Vitesse critique (Critical Speed, modèle de Monod & Scherrer) — ajustée par régression linéaire
 * sur les meilleurs efforts personnels (course à pied), agrégés depuis l'index Drive.
 * Complémentaire au VDOT : basée sur tes performances réelles plutôt qu'une formule générique.
 */
export const CriticalSpeed: React.FC<Props> = ({ cloud, manualBests }) => {
  if (cloud.status !== 'connected') return null;

  const result = estimateCriticalSpeedFromHistory(cloud.history, manualBests);
  if (!result) return null;

  const confidence = CONFIDENCE_LABELS[result.confidence];

  return (
    <div className="card animate-slide-up" id="nav-critical-speed">
      <div className="panel-header">
        <h3 className="panel-title">
          <Gauge size={18} style={{ color: "#22d3ee" }} />
          <span>Vitesse critique</span>
        </h3>
        <div title={confidence.title} style={{
          padding: "0.3rem 0.85rem", borderRadius: "var(--radius-full)", cursor: 'help',
          backgroundColor: `${confidence.color}18`, border: `1px solid ${confidence.color}44`,
          fontSize: "0.78rem", fontWeight: 700, color: confidence.color,
        }}>
          Fiabilité {confidence.label}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: "1.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem" }}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: "3rem", color: "#22d3ee", lineHeight: 1 }}>
              {fmtPace(result.csPaceSecPerKm)} <span style={{ fontSize: "1.3rem", fontWeight: 700 }}>/km</span>
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-tertiary)" }}>
              ({(result.cs * 3.6).toFixed(1)} km/h)
            </div>
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
            <strong>CS</strong>, l'allure la plus rapide soutenable "indéfiniment" sans dette d'oxygène (ta limite aérobie)
          </div>
        </div>
        <div style={{ paddingBottom: "0.5rem" }}>
          <div title="D' (D-prime) : réserve de distance anaérobie, en mètres" style={{
            display: "inline-block", padding: "0.3rem 0.85rem", cursor: 'help',
            borderRadius: "var(--radius-full)",
            backgroundColor: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.4)",
            fontSize: "0.95rem", fontWeight: 800, color: "#a78bfa",
          }}>
            D' {Math.round(result.dPrime)} m
          </div>
        </div>
      </div>

      <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
        <strong>D'</strong> est la distance que tu peux courir <em>au-delà</em> de ta vitesse critique avant l'épuisement —
        une réserve d'énergie anaérobie qui se consomme dès que tu vas plus vite que CS (accélération, sprint final),
        quelle que soit la vitesse à laquelle tu la puises. Ici : {D_PRIME_DESCRIPTIONS[dPrimeProfile(result.dPrime)]}.
      </p>

      <p style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>
        Modèle hyperbolique (Monod &amp; Scherrer, 1965) : distance = CS × temps + D', ajusté par régression sur{' '}
        {result.points.length} record{result.points.length > 1 ? 's' : ''} personnel{result.points.length > 1 ? 's' : ''} (R² {result.rSquared.toFixed(3)}).
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {result.points.map(p => (
          <span key={p.key}
            title={`${p.entryName} · ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(p.entryDate))}`}
            style={{
              fontSize: '0.75rem', color: 'var(--text-tertiary)', padding: '0.25rem 0.6rem', cursor: 'help',
              background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-full)',
            }}>
            {p.label} en {Math.floor(p.timeSeconds / 60)}:{Math.round(p.timeSeconds % 60).toString().padStart(2, '0')}
            {' — '}{p.entryName.length > 22 ? p.entryName.slice(0, 20) + '…' : p.entryName}
            {' · '}{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(new Date(p.entryDate))}
          </span>
        ))}
      </div>

      {result.confidence !== 'high' && (
        <div style={{ fontSize: '0.71rem', color: 'var(--text-tertiary)', marginTop: '0.75rem',
          borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
          {result.points.length < 3
            ? "Basé sur seulement 2 records — enregistre un record supplémentaire entre 2 et 30 minutes (souvent 1km/5km/10km) pour fiabiliser l'estimation."
            : "L'ajustement est imprécis (R² faible) — tes records dans cette fenêtre de durée ne suivent pas bien le modèle, résultat à prendre avec prudence."}
        </div>
      )}
    </div>
  );
};
