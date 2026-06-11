import React from "react";
import { ShieldAlert } from "lucide-react";
import type { DataQuality as DataQualityType } from "../utils/gpxCore";

interface Props {
  quality: DataQualityType;
  hasHr: boolean;
}

type Severity = 'warn' | 'bad';

interface Issue {
  label: string;
  severity: Severity;
}

/** Palette de couleurs selon la sévérité du signal de qualité. */
const COLORS: Record<Severity, { text: string; bg: string; border: string }> = {
  warn: { text: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  bad:  { text: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
};

/** Formate une durée en secondes en chaîne lisible (« 2 min » ou « 45 s »). */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  return `${Math.round(seconds / 60)} min`;
}

/**
 * Construit la liste des anomalies détectées dans les données GPS/FC/altitude.
 * Seuils : couverture FC < 70% = bad, < 95% = warn ; altitude < 80% = bad, < 95% = warn.
 * Coupures GPS : > 2 = bad, ≥ 1 = warn.
 */
function buildIssues(q: DataQualityType, hasHr: boolean): Issue[] {
  const issues: Issue[] = [];

  if (hasHr) {
    if (q.hrCoverage < 70)      issues.push({ label: `FC manquante ${100 - q.hrCoverage}% du tracé`, severity: 'bad' });
    else if (q.hrCoverage < 95) issues.push({ label: `FC manquante ${100 - q.hrCoverage}% du tracé`, severity: 'warn' });
  }

  if (q.elevCoverage < 80)       issues.push({ label: `Altitude manquante ${100 - q.elevCoverage}% du tracé`, severity: 'bad' });
  else if (q.elevCoverage < 95)  issues.push({ label: `Altitude manquante ${100 - q.elevCoverage}% du tracé`, severity: 'warn' });

  if (q.elevOutliers > 10)       issues.push({ label: `${q.elevOutliers} pics altitude corrigés`, severity: 'bad' });
  else if (q.elevOutliers > 0)   issues.push({ label: `${q.elevOutliers} pic${q.elevOutliers > 1 ? 's' : ''} altitude corrigé${q.elevOutliers > 1 ? 's' : ''}`, severity: 'warn' });

  if (q.gapCount > 2)            issues.push({ label: `${q.gapCount} coupures GPS (max ${formatDuration(q.longestGap)})`, severity: 'bad' });
  else if (q.gapCount > 0)       issues.push({ label: `${q.gapCount} coupure${q.gapCount > 1 ? 's' : ''} GPS (max ${formatDuration(q.longestGap)})`, severity: 'warn' });

  if (q.gpsDropped > 30)         issues.push({ label: `${q.gpsDropped} pts sans GPS (avant acquisition)`, severity: 'bad' });
  else if (q.gpsDropped > 0)     issues.push({ label: `${q.gpsDropped} pts sans GPS (avant acquisition)`, severity: 'warn' });

  return issues;
}

/** Bannière de qualité des données — visible uniquement si au moins une anomalie est détectée. */
export const DataQuality: React.FC<Props> = ({ quality, hasHr }) => {
  const issues = buildIssues(quality, hasHr);

  if (issues.length === 0) return null;

  const worstSeverity: Severity = issues.some(i => i.severity === 'bad') ? 'bad' : 'warn';
  const palette = COLORS[worstSeverity];

  return (
    <div className="card animate-slide-up" style={{ borderLeft: `3px solid ${palette.text}` }}>
      <div className="panel-header" style={{ marginBottom: "0.75rem" }}>
        <h3 className="panel-title">
          <ShieldAlert size={18} style={{ color: palette.text }} />
          <span>Qualité des données</span>
        </h3>
        <span style={{
          fontSize: "0.78rem", fontWeight: 600, color: palette.text,
          background: palette.bg, border: `1px solid ${palette.border}`,
          padding: "0.2rem 0.65rem", borderRadius: "var(--radius-full)",
        }}>
          {issues.length} signal{issues.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Badges individuels par anomalie */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {issues.map((issue, idx) => {
          const c = COLORS[issue.severity];
          return (
            <span key={idx} style={{
              fontSize: "0.8rem", fontWeight: 500,
              color: c.text, background: c.bg,
              border: `1px solid ${c.border}`,
              padding: "0.25rem 0.7rem", borderRadius: "var(--radius-full)",
            }}>
              {issue.label}
            </span>
          );
        })}
      </div>
    </div>
  );
};
