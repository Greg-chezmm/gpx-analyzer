import React from "react";
import { Map, TrendingUp, Heart, BarChart2 } from "lucide-react";

const NAV_ITEMS = [
  { id: "nav-map",    label: "Carte",       icon: <Map size={14} /> },
  { id: "nav-charts", label: "Graphiques",  icon: <TrendingUp size={14} /> },
  { id: "nav-zones",  label: "Zones FC",    icon: <Heart size={14} /> },
  { id: "nav-splits", label: "Splits",      icon: <BarChart2 size={14} /> },
] as const;

export const FloatingNav: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <nav className="floating-nav">
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          type="button"
          className="floating-nav-btn"
          onClick={() => scrollTo(item.id)}
          title={item.label}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
};
