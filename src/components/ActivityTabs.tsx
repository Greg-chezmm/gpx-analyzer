import React from "react";
import { Map, Heart, TrendingUp, Route, BarChart2 } from "lucide-react";

export type ActivityTabId = "overview" | "cardio" | "performance" | "routes" | "splits";

const TAB_DEFS: { id: ActivityTabId; label: string; icon: React.ReactNode }[] = [
  { id: "overview",    label: "Carte & analyse",    icon: <Map size={15} /> },
  { id: "cardio",      label: "Cardio & zones",      icon: <Heart size={15} /> },
  { id: "performance", label: "Performance",         icon: <TrendingUp size={15} /> },
  { id: "routes",      label: "Parcours & segments", icon: <Route size={15} /> },
  { id: "splits",      label: "Splits",              icon: <BarChart2 size={15} /> },
];

/** Barre d'onglets pilotant l'affichage du dashboard activité — un seul onglet visible à la fois. */
export const ActivityTabs: React.FC<{
  active: ActivityTabId;
  onChange: (id: ActivityTabId) => void;
  visible: Partial<Record<ActivityTabId, boolean>>;
}> = ({ active, onChange, visible }) => {
  const tabs = TAB_DEFS.filter(t => visible[t.id] !== false);

  return (
    <nav className="activity-tabs animate-slide-up">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          className={`activity-tab-btn${active === tab.id ? " active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};
