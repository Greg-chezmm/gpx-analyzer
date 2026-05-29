import React, { useState, useEffect, useRef } from "react";
import { Settings, X } from "lucide-react";

interface AthleteSettingsProps {
  fcMax: number;     onFcMaxChange: (v: number) => void;
  fcRest: number;    onFcRestChange: (v: number) => void;
  vma: number;       onVmaChange: (v: number) => void;
  ftp: number;       onFtpChange: (v: number) => void;
  weight: number;    onWeightChange: (v: number) => void;
  birthYear: number; onBirthYearChange: (v: number) => void;
  isCycling?: boolean;
}

interface FieldDef {
  label: string;
  value: number;
  min: number; max: number; step: number;
  unit: string;
  onChange: (v: number) => void;
  cyclingOnly?: boolean;
  runningOnly?: boolean;
}

function Stepper({ label, value, min, max, step, unit, onChange }: FieldDef) {
  const dec = () => { if (value - step >= min) onChange(Math.round((value - step) * 100) / 100); };
  const inc = () => { if (value + step <= max) onChange(Math.round((value + step) * 100) / 100); };
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
      <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 600, whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <div style={{
          display: "flex", alignItems: "center",
          border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)",
          background: "var(--bg-primary)", overflow: "hidden",
        }}>
          <button type="button" onClick={dec} disabled={value <= min}
            style={{ width: "28px", height: "28px", border: "none", background: "transparent",
              cursor: "pointer", color: "var(--accent-primary)", fontWeight: 800, fontSize: "1rem",
              display: "flex", alignItems: "center", justifyContent: "center" }}>
            −
          </button>
          <span style={{ minWidth: "42px", textAlign: "center", fontSize: "0.9rem",
            fontWeight: 700, color: "var(--accent-primary)", fontFamily: "var(--font-heading)" }}>
            {step < 1 ? value.toFixed(1) : value}
          </span>
          <button type="button" onClick={inc} disabled={value >= max}
            style={{ width: "28px", height: "28px", border: "none", background: "transparent",
              cursor: "pointer", color: "var(--accent-primary)", fontWeight: 800, fontSize: "1rem",
              display: "flex", alignItems: "center", justifyContent: "center" }}>
            +
          </button>
        </div>
        <span style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", minWidth: "28px" }}>{unit}</span>
      </div>
    </div>
  );
}

export const AthleteSettingsButton: React.FC<AthleteSettingsProps> = (props) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const fields: FieldDef[] = [
    { label: "FC max",    value: props.fcMax,     min: 100, max: 230, step: 1,   unit: "bpm", onChange: props.onFcMaxChange },
    { label: "FC repos",  value: props.fcRest,    min: 30,  max: 100, step: 1,   unit: "bpm", onChange: props.onFcRestChange },
    { label: "VMA",       value: props.vma,       min: 10,  max: 30,  step: 0.5, unit: "km/h", onChange: props.onVmaChange, runningOnly: true },
    { label: "FTP",       value: props.ftp,       min: 50,  max: 600, step: 5,   unit: "W",   onChange: props.onFtpChange, cyclingOnly: true },
    { label: "Poids",     value: props.weight,    min: 30,  max: 200, step: 1,   unit: "kg",  onChange: props.onWeightChange },
    { label: "Né en",     value: props.birthYear, min: 1940,max: 2010,step: 1,   unit: "",    onChange: props.onBirthYearChange },
  ];

  const visible = fields.filter(f => {
    if (f.cyclingOnly && !props.isCycling) return false;
    if (f.runningOnly && props.isCycling) return false;
    return true;
  });

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => setOpen(v => !v)}
        title="Paramètres athlète"
        style={{ padding: "0.5rem 0.75rem", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
      >
        <Settings size={16} />
        <span className="btn-text">Profil</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          zIndex: 2000, minWidth: "260px",
          background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-xl)",
          padding: "1rem",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
            <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)" }}>
              Profil athlète
            </span>
            <button type="button" onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex" }}>
              <X size={15} />
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {visible.map(f => <Stepper key={f.label} {...f} />)}
          </div>
        </div>
      )}
    </div>
  );
};
