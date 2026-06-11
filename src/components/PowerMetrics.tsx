import React from "react";
import { Zap } from "lucide-react";

interface PowerMetricsProps {
  np: number;
  ftp: number;
  onFtpChange: (v: number) => void;
  movingTime: number; // secondes
  weight?: number;    // kg
}

/** Retourne le niveau de charge TSS avec label, couleur et temps de récupération estimé. */
function tssLevel(tss: number): { label: string; color: string; recovery: string } {
  // Seuils TSS issus du modèle TrainingPeaks / Allen & Coggan.
  if (tss < 50)  return { label: "Facile",      color: "#34d399", recovery: "< 24h" };
  if (tss < 100) return { label: "Modérée",     color: "#fbbf24", recovery: "24–36h" };
  if (tss < 150) return { label: "Élevée",      color: "#f97316", recovery: "36–72h" };
  if (tss < 200) return { label: "Très élevée", color: "#ef4444", recovery: "72h+" };
  return             { label: "Extrême",        color: "#a78bfa", recovery: "96h+" };
}

/** Panneau NP / IF / TSS pour les activités cyclisme avec capteur de puissance. */
export const PowerMetrics: React.FC<PowerMetricsProps> = ({ np, ftp, onFtpChange, movingTime, weight }) => {
  // IF = NP / FTP — ratio d'intensité par rapport au seuil.
  const intensityFactor = ftp > 0 ? Math.round((np / ftp) * 100) / 100 : 0;
  // TSS = (durée_s × NP × IF) / (FTP × 3600) × 100 — charge normalisée à 1h à FTP = 100.
  const tss   = ftp > 0 ? Math.round((movingTime * np * intensityFactor) / (ftp * 3600) * 100) : 0;
  const wkg   = weight && weight > 0 ? Math.round((np / weight) * 100) / 100 : null;
  const level = tssLevel(tss);
  // Plafonne la jauge à 300 TSS (effort extrême).
  const gaugeWidth = Math.min(100, (tss / 300) * 100);

  return (
    <div className="card animate-slide-up">
      <div className="panel-header">
        <h3 className="panel-title">
          <Zap size={18} style={{ color: "#a78bfa" }} />
          <span>Métriques de Puissance</span>
        </h3>
        {/* Saisie FTP inline — modifie le profil athlète en temps réel */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
          <span style={{ fontWeight: 600 }}>FTP :</span>
          <input
            type="number" min={50} max={500} step={5} value={ftp}
            onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 50 && v <= 500) onFtpChange(v); }}
            style={{
              width: "64px", padding: "0.2rem 0.4rem",
              border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)",
              fontSize: "0.9rem", fontWeight: 700, color: "#a78bfa",
              background: "var(--bg-primary)", textAlign: "center", outline: "none",
            }}
          />
          <span>W</span>
        </div>
      </div>

      {/* Grille NP / IF / TSS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
        {[
          {
            label: "NP (Normalized Power)",
            value: `${np} W`,
            sub: wkg ? `${wkg} W/kg` : "Puissance normalisée",
            color: "#a78bfa",
          },
          {
            label: "IF (Intensity Factor)",
            value: intensityFactor.toFixed(2),
            sub: intensityFactor >= 1.05 ? "Au-dessus du seuil" : intensityFactor >= 0.85 ? "Effort intense" : "Effort modéré",
            // Rouge > seuil, orange ≥ 0,85, jaune sinon
            color: intensityFactor >= 1.0 ? "#ef4444" : intensityFactor >= 0.85 ? "#f97316" : "#fbbf24",
          },
          {
            label: "TSS (Training Stress)",
            value: String(tss),
            sub: level.label,
            color: level.color,
          },
        ].map(m => (
          <div key={m.label} style={{ padding: "0.85rem 1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--bg-secondary)" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", fontWeight: 600, marginBottom: "0.35rem" }}>{m.label}</div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.75rem", color: m.color, lineHeight: 1 }}>{m.value}</div>
            <div style={{ fontSize: "0.72rem", color: m.color, marginTop: "0.3rem", fontWeight: 600 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Jauge TSS */}
      <div style={{ marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "0.35rem" }}>
          <span>TSS</span>
          <span style={{ color: level.color, fontWeight: 600 }}>Récupération : {level.recovery}</span>
        </div>
        <div style={{ height: "8px", borderRadius: "4px", background: "var(--border-color)", overflow: "hidden" }}>
          <div style={{ width: `${gaugeWidth}%`, height: "100%", borderRadius: "4px", background: level.color, transition: "width 0.4s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
          <span>0</span><span>50</span><span>100</span><span>150</span><span>200</span><span>300</span>
        </div>
      </div>

      <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", borderTop: "1px solid var(--border-color)", paddingTop: "0.6rem" }}>
        TSS = (durée × NP × IF) / (FTP × 3600) × 100 · NP = racine⁴ de la moyenne des puissances lissées 30s
      </div>
    </div>
  );
};
