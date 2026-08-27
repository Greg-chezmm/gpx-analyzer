import React, { useState } from "react";
import type { GPXSplit } from "../utils/gpxParser";
import { Timer, ArrowUp, Zap, Heart, Copy, Check, Gauge, ShieldAlert, Mountain, TrendingUp } from "lucide-react";
import { formatDuration, formatPace } from "../utils/format";

interface SplitsTableProps {
  splits: GPXSplit[];
  activityType: 'running' | 'cycling' | 'unknown';
}

/**
 * Tableau des splits au kilomètre — affiche les métriques disponibles (FC, cadence,
 * puissance, GAP, EF) et exporte en TSV pour Excel / Google Sheets.
 */
export const SplitsTable: React.FC<SplitsTableProps> = ({ splits, activityType }) => {
  const [copied, setCopied] = useState(false);

  if (splits.length === 0) return null;

  // Détection des colonnes optionnelles présentes dans les données parsées
  const hasHeartRate = splits.some(s => s.avgHeartRate !== null);
  const hasCadence   = splits.some(s => s.avgCadence !== null);
  const hasPower     = splits.some(s => s.avgPower !== null);
  const hasGrade     = splits.some(s => s.avgGrade !== null);
  const hasGAP       = splits.some(s => s.avgGAP !== null);
  const hasEF        = splits.some(s => s.ef !== null);

  const isCycling   = activityType === 'cycling';
  const cadenceUnit = isCycling ? 'rpm' : 'ppm';
  // Cadence brute GPX = demi-cycles (foulées/min divisé par 2) pour la course
  const cadenceValue = (raw: number) => isCycling ? raw : raw * 2;

  /** Génère le TSV et le place dans le presse-papier. */
  const handleCopyTable = () => {
    let tsv = `Km\tTemps\t${isCycling ? 'Vitesse moy. (km/h)' : 'Allure (min/km)'}\tVitesse moy. (km/h)\tV. max (km/h)\tD+ (m)\tD- (m)`;

    if (hasGrade) tsv += "\tPente moy. (%)";
    if (hasGAP)   tsv += "\tGAP (min/km)";
    if (hasEF)    tsv += "\tEF";
    if (hasHeartRate) tsv += "\tCardio moy. (bpm)\tCardio max (bpm)";
    if (hasCadence)   tsv += `\tCadence moy. (${cadenceUnit})`;
    if (hasPower)     tsv += "\tPuissance moy. (W)";
    tsv += "\tDist. cumulée (km)\tD+ cumulé (m)";
    tsv += "\n";

    splits.forEach(split => {
      tsv += `${split.number}\t`;
      tsv += `${formatDuration(split.duration)}\t`;
      // Colonne principale : vitesse (vélo) ou allure (course)
      tsv += isCycling ? `${(split.avgSpeed * 3.6).toFixed(1)}\t` : `${formatPace(split.avgPace)}\t`;
      tsv += `${(split.avgSpeed * 3.6).toFixed(1)}\t`;
      tsv += `${(split.maxSpeed * 3.6).toFixed(1)}\t`;
      tsv += `${split.elevationGain}\t`;
      tsv += `${split.elevationLoss}`;

      if (hasGrade) tsv += `\t${split.avgGrade !== null ? split.avgGrade : ""}`;
      if (hasGAP)   tsv += `\t${split.avgGAP !== null ? formatPace(split.avgGAP) : ""}`;
      if (hasEF)    tsv += `\t${split.ef !== null ? split.ef : ""}`;
      if (hasHeartRate) tsv += `\t${split.avgHeartRate || ""}\t${split.maxHeartRate || ""}`;
      if (hasCadence)   tsv += `\t${split.avgCadence ? cadenceValue(split.avgCadence) : ""}`;
      if (hasPower)     tsv += `\t${split.avgPower || ""}`;
      tsv += `\t${(split.cumulativeDistance / 1000).toFixed(2)}`;
      tsv += `\t${split.cumulativeElevationGain}`;
      tsv += "\n";
    });

    navigator.clipboard.writeText(tsv)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(err => {
        console.error("Erreur lors de la copie :", err);
      });
  };

  return (
    <div className="card animate-slide-up" style={{ width: "100%" }}>
      <div className="panel-header" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <h3 className="panel-title">
          <span>📊 Analyse par Kilomètre (Splits)</span>
        </h3>
        <div className="panel-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleCopyTable}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.4rem 0.85rem",
              fontSize: "0.85rem",
              transition: "all 0.25s ease",
              borderColor: copied ? "var(--color-ele)" : "var(--border-color)",
              color: copied ? "var(--color-ele)" : "var(--text-primary)",
              backgroundColor: copied ? "var(--color-ele-light)" : "transparent"
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? "Tableau copié !" : "Copier le tableau (Excel/Sheets)"}</span>
          </button>
        </div>
      </div>

      <div className="splits-table-container">
        <table className="splits-table">
          <thead>
            <tr>
              <th style={{ width: "55px" }}>Km</th>
              <th>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  <Timer size={14} /> Temps
                </span>
              </th>
              <th>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  <Zap size={14} /> {isCycling ? 'Vitesse' : 'Allure'}
                </span>
              </th>
              {/* Colonne V. moy. séparée uniquement pour la course (vélo l'affiche déjà en principal) */}
              {!isCycling && <th>V. moy.</th>}
              <th>V. max</th>
              <th>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  <ArrowUp size={14} /> Dénivelé
                </span>
              </th>

              {hasGrade && (
                <th>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--color-ele)" }}>
                    <Mountain size={14} /> Pente
                  </span>
                </th>
              )}

              {hasGAP && (
                // GAP = Grade Adjusted Pace, allure normalisée selon la pente (modèle Minetti 2002)
                <th>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "#a78bfa" }}
                    title="Grade Adjusted Pace — allure corrigée selon la pente (Minetti 2002)">
                    <TrendingUp size={14} /> GAP
                  </span>
                </th>
              )}

              {hasEF && (
                // EF = Efficiency Factor : vitesse (m/s) × 1000 / FC moy — mesure l'économie aérobie
                <th>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "#fbbf24" }}
                    title="Facteur d'efficacité aérobie = vitesse (m/s) × 1000 / FC">
                    <Zap size={14} /> EF
                  </span>
                </th>
              )}

              {hasHeartRate && (
                <th>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--color-hr)" }}>
                    <Heart size={14} /> Cardio
                  </span>
                </th>
              )}

              {hasCadence && (
                <th>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--color-cad)" }}>
                    <Gauge size={14} /> Cadence
                  </span>
                </th>
              )}

              {hasPower && (
                <th>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--accent-primary)" }}>
                    <ShieldAlert size={14} /> Puissance
                  </span>
                </th>
              )}

              <th>Dist. cum.</th>
              <th>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--color-ele)" }}>
                  <TrendingUp size={14} /> D+ cum.
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {splits.map((split) => (
              <tr key={split.number}>
                <td style={{ fontWeight: "700", color: "var(--text-secondary)" }}>
                  {split.number}
                </td>
                <td className="numeric">
                  {formatDuration(split.duration)}
                </td>
                <td className="numeric" style={{ fontWeight: "600", color: "var(--accent-secondary)" }}>
                  {isCycling
                    ? `${(split.avgSpeed * 3.6).toFixed(1)} km/h`
                    : formatPace(split.avgPace)}
                </td>
                {!isCycling && (
                  <td className="numeric">
                    {split.avgSpeed ? (split.avgSpeed * 3.6).toFixed(1) : "0.0"} km/h
                  </td>
                )}
                <td className="numeric" style={{ fontWeight: "600" }}>
                  {(split.maxSpeed * 3.6).toFixed(1)} km/h
                </td>
                <td className="numeric" style={{ color: "var(--color-ele)", fontWeight: "600" }}>
                  +{split.elevationGain}m / -{split.elevationLoss}m
                </td>

                {hasGrade && (
                  <td className="numeric" style={{ color: "var(--color-ele)", fontWeight: "600" }}>
                    {split.avgGrade !== null ? `${split.avgGrade > 0 ? '+' : ''}${split.avgGrade}%` : "-"}
                  </td>
                )}

                {hasGAP && (
                  <td className="numeric" style={{ color: "#a78bfa", fontWeight: 600 }}>
                    {split.avgGAP !== null ? formatPace(split.avgGAP) : "—"}
                  </td>
                )}

                {hasEF && (
                  <td className="numeric" style={{ color: "#fbbf24", fontWeight: 600 }}>
                    {split.ef !== null ? split.ef.toFixed(2) : "—"}
                  </td>
                )}

                {hasHeartRate && (
                  <td className="numeric" style={{ color: "var(--color-hr)" }}>
                    {split.avgHeartRate ? (
                      <span>
                        <strong style={{ fontWeight: "600" }}>{split.avgHeartRate}</strong>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginLeft: "0.25rem" }}>
                          (max: {split.maxHeartRate})
                        </span>
                      </span>
                    ) : "-"}
                  </td>
                )}

                {hasCadence && (
                  <td className="numeric" style={{ color: "var(--color-cad)", fontWeight: "600" }}>
                    {split.avgCadence ? `${cadenceValue(split.avgCadence)} ${cadenceUnit}` : "-"}
                  </td>
                )}

                {hasPower && (
                  <td className="numeric" style={{ color: "var(--accent-primary)", fontWeight: "600" }}>
                    {split.avgPower ? `${split.avgPower} W` : "-"}
                  </td>
                )}

                <td className="numeric" style={{ color: "var(--text-secondary)" }}>
                  {(split.cumulativeDistance / 1000).toFixed(2)} km
                </td>
                <td className="numeric" style={{ color: "var(--color-ele)", fontWeight: "600" }}>
                  +{split.cumulativeElevationGain} m
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
