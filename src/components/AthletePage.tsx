import React from "react";
import { X, LayoutDashboard } from "lucide-react";
import type { CloudHandle } from "../hooks/useFirebaseCloud";
import type { ActivityIndexEntry } from "../utils/driveStorage";
import type { RaceGoalConfig } from "../hooks/useRaceGoal";
import type { ManualBest, ManualBests } from "../hooks/useManualBests";
import type { TSBResult } from "../utils/trainingMetrics";
import { AthleteProfile } from "./AthleteProfile";
import { PolarizationChart } from "./PolarizationChart";
import { CriticalSpeed } from "./CriticalSpeed";
import { BestEffortsCurve } from "./BestEffortsCurve";
import { TrainingBalance } from "./TrainingBalance";
import { RaceGoal } from "./RaceGoal";
import { ProgressChart } from "./ProgressChart";

interface Props {
  cloud: CloudHandle;
  history: (ActivityIndexEntry & { trimp: number })[];
  tsb: TSBResult;
  raceGoal: RaceGoalConfig | null;
  setRaceGoal: (g: RaceGoalConfig | null) => void;
  manualBests: ManualBests;
  setManualBest: (key: string, best: ManualBest | null) => void;
  fcMax: number;
  fcRest: number;
  onClose: () => void;
}

/**
 * Page "Bilan athlète" — regroupe toutes les analyses qui portent sur toi (multi-séances)
 * plutôt que sur une activité précise : profil, vitesse critique, meilleurs efforts, charge
 * d'entraînement, objectif course, progression. Accessible sans charger de fichier — toutes
 * ces cartes dépendent de l'historique cloud (activités explicitement sauvegardées), pas de
 * l'activité en cours.
 */
export const AthletePage: React.FC<Props> = ({ cloud, history, tsb, raceGoal, setRaceGoal, manualBests, setManualBest, fcMax, fcRest, onClose }) => {
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

      {cloud.status !== 'connected' && (
        <div className="card animate-slide-up" style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Connecte-toi pour voir ton profil, tes records et ta vitesse critique — ces analyses
          se basent sur toutes tes activités sauvegardées, pas seulement celle en cours.
        </div>
      )}

      <AthleteProfile cloud={cloud} />
      <PolarizationChart cloud={cloud} />
      <CriticalSpeed cloud={cloud} manualBests={manualBests} />
      <BestEffortsCurve cloud={cloud} manualBests={manualBests} setManualBest={setManualBest} />
      <TrainingBalance tsb={tsb} history={history} />
      <RaceGoal goal={raceGoal} setGoal={setRaceGoal} history={history} cloud={cloud} />
      <ProgressChart history={history} fcMax={fcMax} fcRest={fcRest} />
    </>
  );
};
