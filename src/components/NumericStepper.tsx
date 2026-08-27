import React from "react";

interface NumericStepperProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  /** Pas d'incrément/décrément (défaut 1). */
  step?: number;
  /** Décimales affichées et conservées lors de l'arrondi (défaut 0 — valeur entière). */
  decimals?: number;
  /** Largeur de la zone valeur, pour aligner des steppers voisins de plage différente (défaut 44px). */
  valueWidth?: string;
  unit: string;
  color: string;
  colorLight: string;
  onChange: (v: number) => void;
}

/** Stepper +/− générique (FC max/repos, VMA, FTP…) — bornes, pas et décimales configurables. */
export const NumericStepper: React.FC<NumericStepperProps> = ({
  id, label, value, min, max, step = 1, decimals = 0, valueWidth = "44px", unit, color, colorLight, onChange,
}) => {
  const dec = () => { if (value > min) onChange(Math.max(min, parseFloat((value - step).toFixed(decimals)))); };
  const inc = () => { if (value < max) onChange(Math.min(max, parseFloat((value + step).toFixed(decimals)))); };
  const btnStyle: React.CSSProperties = {
    width: "32px", height: "32px", border: "none", background: "transparent",
    cursor: "pointer", color, fontWeight: 800, fontSize: "1.1rem", lineHeight: 1,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <label htmlFor={id} style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
        {label}
      </label>
      <div style={{
        display: "flex", alignItems: "center",
        border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)",
        background: colorLight, overflow: "hidden",
      }}>
        <button type="button" onClick={dec} disabled={value <= min} style={btnStyle} aria-label={`Diminuer ${label}`}>−</button>
        <span id={id} style={{
          minWidth: valueWidth, textAlign: "center",
          fontSize: "0.95rem", fontWeight: 700, color,
          fontFamily: "var(--font-heading)",
        }}>
          {value.toFixed(decimals)}
        </span>
        <button type="button" onClick={inc} disabled={value >= max} style={btnStyle} aria-label={`Augmenter ${label}`}>+</button>
      </div>
      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{unit}</span>
    </div>
  );
};
