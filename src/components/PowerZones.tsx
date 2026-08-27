import React from "react";
import { Zap } from "lucide-react";
import type { GPXTrackPoint } from "../utils/gpxParser";
import { formatDuration } from "../utils/format";
import { NumericStepper } from "./NumericStepper";

interface PowerZonesProps {
  points: GPXTrackPoint[];
  ftp: number;
  onFtpChange: (v: number) => void;
  weight: number;
}

interface ZoneDef {
  label: string;
  description: string;
  color: string;
  pctMin: number; // % FTP (modèle Coggan)
  pctMax: number;
}

/** Zones de puissance Z1–Z7 selon le modèle Coggan (% FTP). */
const ZONES: ZoneDef[] = [
  { label: "Z1", description: "Récupération active",   color: "#93c5fd", pctMin: 0,    pctMax: 0.55 },
  { label: "Z2", description: "Endurance",             color: "#34d399", pctMin: 0.55, pctMax: 0.75 },
  { label: "Z3", description: "Tempo",                 color: "#fbbf24", pctMin: 0.75, pctMax: 0.90 },
  { label: "Z4", description: "Seuil lactique",        color: "#f97316", pctMin: 0.90, pctMax: 1.05 },
  { label: "Z5", description: "VO2max",                color: "#ef4444", pctMin: 1.05, pctMax: 1.20 },
  { label: "Z6", description: "Capacité anaérobie",    color: "#c026d3", pctMin: 1.20, pctMax: 1.50 },
  { label: "Z7", description: "Neuromusculaire",       color: "#7c3aed", pctMin: 1.50, pctMax: Infinity },
];

/** Retourne l'index de zone (0–6) pour une puissance donnée en % FTP. */
function getZoneIndex(power: number, ftp: number): number {
  const pct = power / ftp;
  for (let i = ZONES.length - 1; i >= 0; i--) {
    if (pct >= ZONES[i].pctMin) return i;
  }
  return 0;
}

/** Affiche les zones de puissance Z1–Z7 (modèle Coggan) avec stepper FTP réactif et ratio W/kg. */
export const PowerZones: React.FC<PowerZonesProps> = ({ points, ftp, onFtpChange, weight }) => {
  const zoneTime = new Array<number>(ZONES.length).fill(0);
  let totalPower = 0;
  let powerCount = 0;

  for (let i = 1; i < points.length; i++) {
    const curr = points[i], prev = points[i - 1];
    if (curr.power === null || prev.power === null) continue;
    if (curr.time === null || prev.time === null) continue;
    const dt = (curr.time.getTime() - prev.time.getTime()) / 1000;
    // Ignore les gaps GPS ou pauses (>60 s)
    if (dt <= 0 || dt > 60) continue;
    const avgWatts = (curr.power + prev.power) / 2;
    if (ftp > 0) zoneTime[getZoneIndex(avgWatts, ftp)] += dt;
    totalPower += avgWatts;
    powerCount++;
  }

  const totalTime = zoneTime.reduce((a, b) => a + b, 0);
  if (totalTime === 0) return null;

  const avgPower = powerCount > 0 ? Math.round(totalPower / powerCount) : 0;
  const wPerKg = weight > 0 ? (avgPower / weight).toFixed(2) : null;

  return (
    <div className="card animate-slide-up" style={{ width: "100%" }}>
      <div className="panel-header" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <h3 className="panel-title">
          <Zap size={18} style={{ color: "var(--color-power)" }} />
          <span>Zones de Puissance</span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontWeight: 500 }}>
            · modèle Coggan
          </span>
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <NumericStepper
            id="ftp-input" label="FTP :" value={ftp} min={50} max={500} step={5} unit="W" valueWidth="48px"
            color="var(--color-power)" colorLight="var(--color-power-light)"
            onChange={onFtpChange}
          />
          {wPerKg && (
            <span style={{ fontSize: "0.78rem", color: "var(--text-tertiary)" }}>
              {avgPower} W moy · {wPerKg} W/kg
            </span>
          )}
        </div>
      </div>

      {/* Barre empilée proportionnelle au temps total */}
      <div style={{ display: "flex", height: "18px", borderRadius: "9px", overflow: "hidden", gap: "2px", marginBottom: "1.5rem" }}>
        {ZONES.map((zone, idx) => {
          const pct = totalTime > 0 ? (zoneTime[idx] / totalTime) * 100 : 0;
          if (pct < 0.3) return null;
          return (
            <div key={zone.label} title={`${zone.label} — ${pct.toFixed(1)}%`} style={{
              width: `${pct}%`, backgroundColor: zone.color, borderRadius: "9px",
              transition: "width 0.5s cubic-bezier(0.4,0,0.2,1)", flexShrink: 0,
            }} />
          );
        })}
      </div>

      {/* Cartes de zone */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: "0.85rem" }}>
        {ZONES.map((zone, idx) => {
          const pct = totalTime > 0 ? (zoneTime[idx] / totalTime) * 100 : 0;
          const wMin = ftp > 0 ? Math.round(zone.pctMin * ftp) : 0;
          const wMax = zone.pctMax === Infinity ? null : Math.round(zone.pctMax * ftp);

          return (
            <div key={zone.label} style={{
              border: `1px solid ${zone.color}33`, borderRadius: "var(--radius-md)",
              padding: "0.85rem 1rem", background: `${zone.color}0d`,
              display: "flex", flexDirection: "column", gap: "0.35rem",
              // Atténue les zones non atteintes pour mettre en avant les zones actives
              opacity: pct < 0.5 ? 0.45 : 1,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: zone.color, flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                  {zone.label}
                </span>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                  — {zone.description}
                </span>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", fontWeight: 500 }}>
                {ftp > 0
                  ? (wMax === null ? `> ${wMin} W` : `${wMin} – ${wMax} W`)
                  : `${(zone.pctMin * 100).toFixed(0)}–${zone.pctMax === Infinity ? '∞' : (zone.pctMax * 100).toFixed(0)}% FTP`
                }
              </div>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.4rem", color: zone.color, lineHeight: 1.1 }}>
                {pct.toFixed(1)}
                <span style={{ fontSize: "0.9rem", fontWeight: 600, marginLeft: "1px" }}>%</span>
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 500, fontFeatureSettings: '"tnum"' }}>
                {formatDuration(zoneTime[idx])}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
