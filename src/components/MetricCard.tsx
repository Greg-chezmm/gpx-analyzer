import React from "react";

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  colorVar: "speed" | "hr" | "ele" | "time" | "cad";
}

export const MetricCard: React.FC<MetricCardProps> = ({ icon, label, value, unit, colorVar }) => {
  return (
    <div className="card metric-card animate-slide-up">
      <div 
        className="metric-icon-wrapper"
        style={{ 
          backgroundColor: `var(--color-${colorVar}-light)`, 
          color: `var(--color-${colorVar})` 
        }}
      >
        {icon}
      </div>
      <div className="metric-info">
        <span className="metric-label">{label}</span>
        <div className="metric-value">
          {value}
          {unit && <span className="metric-unit">{unit}</span>}
        </div>
      </div>
    </div>
  );
};
