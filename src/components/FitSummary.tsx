import React from "react";
import { Watch } from "lucide-react";
import type { FitSummary as FitSummaryData } from "../utils/gpxCore";
import type { TRIMPResult, VO2maxEstimate } from "../utils/gpxParser";
import { formatDuration } from "./SplitsTable";

interface Props {
  fit: FitSummaryData;
  fcMax: number;
  vo2maxEst?: VO2maxEstimate | null;
  trimp?: TRIMPResult | null;
}

// ─── Training Effect ──────────────────────────────────────────────────────────

/**
 * Retourne le libellé et la couleur selon le Training Effect (échelle 0–5 Garmin/Suunto).
 * < 2 = maintien, 2–3 = amélioration, > 4 = surcompensation.
 */
function teInfo(te: number): { label: string; color: string } {
  if (te < 1.0) return { label: "Aucun effet",      color: "#94a3b8" };
  if (te < 2.0) return { label: "Maintien",         color: "#34d399" };
  if (te < 3.0) return { label: "Amélioration",     color: "#60a5fa" };
  if (te < 4.0) return { label: "Optimisation",     color: "#a78bfa" };
  return              { label: "Surcompensation",   color: "#f97316" };
}

// ─── Ressenti subjectif ───────────────────────────────────────────────────────

/** Correspondance entre l'entier de ressenti FIT (1–5) et son libellé/emoji. */
const FEELING: Record<number, { label: string; emoji: string }> = {
  1: { label: "Très difficile", emoji: "😞" },
  2: { label: "Difficile",      emoji: "😕" },
  3: { label: "Normal",         emoji: "😐" },
  4: { label: "Bon",            emoji: "🙂" },
  5: { label: "Excellent",      emoji: "😄" },
};

// ─── Tuile KPI ────────────────────────────────────────────────────────────────

/** Tuile KPI centrée avec valeur numérique et badge coloré. */
function KPI({ label, value, sub, color, title }: {
  label: string; value: string; sub: string; color: string; title?: string;
}) {
  return (
    <div style={{ textAlign: "center", minWidth: "80px" }} title={title}>
      <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", fontWeight: 600, marginBottom: "0.2rem" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: "1.75rem", color, lineHeight: 1 }}>{value}</div>
      <div style={{
        fontSize: "0.7rem", color, fontWeight: 700, marginTop: "0.25rem",
        padding: "0.1rem 0.4rem", borderRadius: "var(--radius-full)",
        background: `${color}18`, border: `1px solid ${color}44`, display: "inline-block",
      }}>{sub}</div>
    </div>
  );
}

// ─── Comparaison zones FC ─────────────────────────────────────────────────────

const ZONE_COLORS = ["#34d399", "#60a5fa", "#fbbf24", "#f97316", "#ef4444"];
const ZONE_LABELS = ["Z1", "Z2", "Z3", "Z4", "Z5"];

/** Seuils zones montre : % FCmax fixes (standard Garmin/Suunto). */
const WATCH_ZONE_PCT = [
  "< 60 %",
  "60–70 %",
  "70–80 %",
  "80–90 %",
  "> 90 %",
];

/** Seuils zones Karvonen : % de la réserve cardiaque (HRR). */
const KARV_ZONE_PCT = [
  "50–60 % HRR",
  "60–70 % HRR",
  "70–80 % HRR",
  "80–90 % HRR",
  "> 90 % HRR",
];

/** Barre de pourcentage animée. */
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flex: 1 }}>
      <div style={{ flex: 1, height: "8px", background: "var(--bg-primary)", borderRadius: "4px", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "4px", transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", minWidth: "32px", textAlign: "right" }}>
        {pct}%
      </span>
    </div>
  );
}

/**
 * Panneau de résumé des données issues du fichier FIT (montre) —
 * Training Effect, VO2max, récupération, EPOC, ressenti et comparaison des zones FC.
 */
export const FitSummary: React.FC<Props> = ({ fit, fcMax, vo2maxEst, trimp }) => {
  const te = fit.trainingEffect != null ? teInfo(fit.trainingEffect) : null;
  const feel = fit.feeling != null ? FEELING[Math.round(fit.feeling)] : null;

  // Zones montre : secondes par zone → pourcentages du temps total
  const watchTotal = fit.timeInHrZone?.reduce((a, b) => a + b, 0) ?? 0;
  const watchPct = fit.timeInHrZone?.map(s => watchTotal > 0 ? Math.round((s / watchTotal) * 100) : 0) ?? null;

  // Zones Karvonen depuis trimp.zoneMinutes (minutes) → pourcentages
  const karvTotal = trimp?.zoneMinutes.reduce((a, b) => a + b, 0) ?? 0;
  const karvPct = trimp?.zoneMinutes.map(m => karvTotal > 0 ? Math.round((m / karvTotal) * 100) : 0) ?? null;

  const showZones = watchPct !== null || karvPct !== null;

  // Écart VO2max montre vs estimation interne (arrondi à 1 décimale)
  const vo2diff = (fit.estimatedVO2max != null && vo2maxEst != null)
    ? Math.round((vo2maxEst.value - fit.estimatedVO2max) * 10) / 10
    : null;

  return (
    <div className="card animate-slide-up">
      <div className="panel-header">
        <h3 className="panel-title">
          <Watch size={18} style={{ color: "#60a5fa" }} />
          <span>Bilan montre (FIT)</span>
        </h3>
      </div>

      {/* Tuiles KPI */}
      <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        {te && fit.trainingEffect != null && (
          <KPI
            label="Training Effect"
            value={fit.trainingEffect.toFixed(1)}
            sub={te.label}
            color={te.color}
            title="Effet d'entraînement mesuré par la montre (0–5)"
          />
        )}
        {fit.estimatedVO2max != null && (
          <div style={{ textAlign: "center", minWidth: "80px" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", fontWeight: 600, marginBottom: "0.2rem" }}>VO2max montre</div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: "1.75rem", color: "#a78bfa", lineHeight: 1 }}>
              {fit.estimatedVO2max.toFixed(1)}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>mL/kg/min</div>
            {/* Écart ≤ 2 mL/kg/min = concordance acceptable */}
            {vo2diff !== null && (
              <div style={{ fontSize: "0.7rem", fontWeight: 700, marginTop: "0.2rem", color: Math.abs(vo2diff) <= 2 ? "#34d399" : "#f97316" }}>
                {vo2diff >= 0 ? "+" : ""}{vo2diff} vs notre calc.
              </div>
            )}
          </div>
        )}
        {fit.recoveryTimeH != null && (
          <KPI
            label="Récupération"
            value={`${fit.recoveryTimeH}h`}
            sub="recommandée"
            color="#f97316"
          />
        )}
        {fit.peakEpoc != null && (
          <KPI
            label="EPOC"
            value={fit.peakEpoc.toFixed(1)}
            sub="mL/kg"
            color="#fbbf24"
            title="Excès de consommation d'oxygène post-exercice"
          />
        )}
        {feel && (
          <div style={{ textAlign: "center", minWidth: "80px" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", fontWeight: 600, marginBottom: "0.2rem" }}>Ressenti</div>
            <div style={{ fontSize: "2rem", lineHeight: 1 }}>{feel.emoji}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: 600, marginTop: "0.25rem" }}>{feel.label}</div>
          </div>
        )}
        {fit.tss != null && (
          <KPI
            label="TSS montre"
            value={fit.tss.toFixed(1)}
            sub="Training Stress"
            color="#94a3b8"
            title="Training Stress Score calculé par la montre"
          />
        )}
      </div>

      {/* Tableau de comparaison des zones FC montre vs Karvonen */}
      {showZones && (
        <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
            Comparaison zones cardiaques
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <th style={{ padding: "0.3rem 0.5rem", textAlign: "left", color: "var(--text-tertiary)", fontWeight: 600, width: "28px" }}>Zone</th>
                  {watchPct && (
                    <th style={{ padding: "0.3rem 0.75rem", textAlign: "left", color: "#60a5fa", fontWeight: 600 }}>
                      Montre (% FCmax) — FCmax {fcMax} bpm
                    </th>
                  )}
                  {karvPct && (
                    <th style={{ padding: "0.3rem 0.75rem", textAlign: "left", color: "var(--color-hr)", fontWeight: 600 }}>
                      Karvonen (% HRR)
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {ZONE_LABELS.map((z, i) => {
                  const wPct = watchPct?.[i] ?? null;
                  const kPct = karvPct?.[i] ?? null;
                  const wSec = fit.timeInHrZone?.[i] ?? null;
                  const kMin = trimp?.zoneMinutes[i] ?? null;
                  return (
                    <tr key={z} style={{ borderBottom: "1px solid var(--border-color)" }}>
                      <td style={{ padding: "0.45rem 0.5rem" }}>
                        <span style={{ fontWeight: 700, color: ZONE_COLORS[i], fontSize: "0.78rem" }}>{z}</span>
                      </td>
                      {watchPct && (
                        <td style={{ padding: "0.45rem 0.75rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ color: "var(--text-tertiary)", minWidth: "60px", fontSize: "0.7rem" }}>{WATCH_ZONE_PCT[i]}</span>
                            <Bar pct={wPct ?? 0} color={ZONE_COLORS[i]} />
                            {wSec != null && <span style={{ color: "var(--text-tertiary)", fontSize: "0.7rem", minWidth: "38px" }}>{formatDuration(Math.round(wSec))}</span>}
                          </div>
                        </td>
                      )}
                      {karvPct && (
                        <td style={{ padding: "0.45rem 0.75rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ color: "var(--text-tertiary)", minWidth: "72px", fontSize: "0.7rem" }}>{KARV_ZONE_PCT[i]}</span>
                            <Bar pct={kPct ?? 0} color={ZONE_COLORS[i]} />
                            {/* kMin est en minutes — on convertit en secondes pour formatDuration */}
                            {kMin != null && <span style={{ color: "var(--text-tertiary)", fontSize: "0.7rem", minWidth: "38px" }}>{formatDuration(kMin * 60)}</span>}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: "0.68rem", color: "var(--text-tertiary)", marginTop: "0.5rem" }}>
            Les zones montre utilisent des seuils fixes (% FCmax). Karvonen utilise la réserve cardiaque — les écarts sont normaux.
          </div>
        </div>
      )}
    </div>
  );
};
