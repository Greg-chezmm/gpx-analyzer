import React from "react";
import { Mountain } from "lucide-react";
import type { GPXTrackPoint, ClimbSegment } from "../utils/gpxParser";
import { CLIMB_CATEGORIES } from "../utils/gpxParser";
import { formatDuration, formatPace } from "./SplitsTable";
import { SegmentMapModal } from "./SegmentMapModal";

interface ClimbMapModalProps {
  climb: ClimbSegment;
  climbIndex: number;
  points: GPXTrackPoint[];
  onClose: () => void;
}

/** Modale carte pour une montée détectée — délègue à SegmentMapModal. */
export const ClimbMapModal: React.FC<ClimbMapModalProps> = ({
  climb,
  climbIndex,
  points,
  onClose,
}) => {
  const def = CLIMB_CATEGORIES[climb.category];

  const distLabel = climb.distance >= 1000
    ? `${(climb.distance / 1000).toFixed(2)} km`
    : `${climb.distance} m`;

  const subtitle = [
    distLabel,
    `D+ ${climb.elevGain} m`,
    `Pente moy. ${climb.avgGrade.toFixed(1)}%`,
    climb.avgPace > 0 ? `${formatPace(climb.avgPace)} /km` : null,
    climb.duration > 0 ? formatDuration(climb.duration) : null,
    climb.vam > 0 ? `VAM ${climb.vam} m/h` : null,
  ].filter(Boolean).join(" · ");

  return (
    <SegmentMapModal
      points={points}
      startIndex={climb.startIndex}
      endIndex={climb.endIndex}
      segmentColor={def.color}
      icon={<Mountain size={18} style={{ color: def.color }} />}
      title={
        <>
          Montée #{climbIndex + 1} —{" "}
          <span style={{ color: def.color }}>{def.label}</span>
        </>
      }
      subtitle={subtitle}
      onClose={onClose}
    />
  );
};
