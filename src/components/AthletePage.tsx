import React from "react";
import { X, LayoutDashboard } from "lucide-react";
import type { DriveHandle } from "../hooks/useGoogleDrive";
import type { TrainingEntry } from "../hooks/useTrainingHistory";
import type { RaceGoalConfig } from "../hooks/useRaceGoal";
import type { TSBResult } from "../utils/trainingMetrics";
import { AthleteProfile } from "./AthleteProfile";
import { CriticalSpeed } from "./CriticalSpeed";
import { BestEffortsCurve } from "./BestEffortsCurve";
import { TrainingBalance } from "./TrainingBalance";
import { RaceGoal } from "./RaceGoal";
import { ProgressChart } from "./ProgressChart";

interface Props {
  drive: DriveHandle;
  history: TrainingEntry[];
  tsb: TSBResult;
  raceGoal: RaceGoalConfig | null;
  setRaceGoal: (g: RaceGoalConfig | null) => void;
  onClearHistory: () => void;
  onClose: () => void;
}

/**
 * Page "Bilan athlète" — regroupe toutes les analyses qui portent sur toi (multi-séances)
 * plutôt que sur une activité précise : profil, vitesse critique, meilleurs efforts, charge
 * d'entraînement, objectif course, progression. Accessible sans charger de fichier — toutes
 * ces cartes dépendent de l'historique Drive/local, pas de l'activité en cours.
 */
export const AthletePage: React.FC<Props> = ({ drive, history, tsb, raceGoal, setRaceGoal, onClearHistory, onClose }) => {
  return (
    <>
      <div className="card animate-slide-up" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "1.15rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
          <LayoutDashboard size={20} style={{ color: "var(--accent-primary)" }} />
          Bilan athlète
        </h2>
        <button type="button" className="btn btn-outline" onClick={onClose}
          style={{ padding: "0.4rem 0.6rem", fontSize: "0.8rem" }}>
          <X size={15} />
          <span className="btn-text">Fermer</span>
        </button>
      </div>

      {drive.status !== 'connected' && (
        <div className="card animate-slide-up" style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Connecte Google Drive pour voir ton profil, tes records et ta vitesse critique — ces analyses
          se basent sur toutes tes activités sauvegardées, pas seulement celle en cours.
        </div>
      )}

      <AthleteProfile drive={drive} />
      <CriticalSpeed drive={drive} />
      <BestEffortsCurve drive={drive} />
      <TrainingBalance tsb={tsb} history={history} onClear={onClearHistory} />
      <RaceGoal goal={raceGoal} setGoal={setRaceGoal} history={history} drive={drive} />
      <ProgressChart history={history} />
    </>
  );
};
