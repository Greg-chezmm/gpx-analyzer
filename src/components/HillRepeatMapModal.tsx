import React from "react";
import { Repeat } from "lucide-react";
import type { GPXTrackPoint } from "../utils/gpxParser";
import type { HillRepetition } from "../utils/hillRepeats";
import { formatDuration, formatPace } from "./SplitsTable";
import { SegmentMapModal } from "./SegmentMapModal";

interface HillRepeatMapModalProps {
  rep: HillRepetition;
  seriesId: number;
  points: GPXTrackPoint[];
  onClose: () => void;
}

/** Modale carte pour une répétition de côte — délègue à SegmentMapModal. */
export const HillRepeatMapModal: React.FC<HillRepeatMapModalProps> = ({
  rep,
  seriesId,
  points,
  onClose,
}) => {
  const distLabel = rep.distance >= 1000
    ? `${(rep.distance / 1000).toFixed(2)} km`
    : `${Math.round(rep.distance)} m`;

  const subtitle = [
    distLabel,
    `D+ ${Math.round(rep.elevGain)} m`,
    formatDuration(Math.round(rep.duration)),
    `${formatPace(rep.avgPace)} /km`,
    `VAM ${Math.round(rep.vam)} m/h`,
    rep.avgHR !== null ? `FC ${rep.avgHR} bpm` : null,
  ].filter(Boolean).join(" · ");

  return (
    <SegmentMapModal
      points={points}
      startIndex={rep.startIndex}
      endIndex={rep.endIndex}
      segmentColor="#22c55e"
      startLabel="Départ"
      endLabel="Sommet"
      icon={<Repeat size={18} style={{ color: "#22c55e" }} />}
      title={`Série ${seriesId + 1} — Répétition #${rep.repIndex + 1}`}
      subtitle={subtitle}
      onClose={onClose}
    />
  );
};
