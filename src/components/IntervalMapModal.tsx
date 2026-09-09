import React from "react";
import { Zap, RotateCcw } from "lucide-react";
import type { GPXTrackPoint } from "../utils/gpxParser";
import type { GPXInterval } from "../utils/intervals";
import { formatDuration, formatPace } from "../utils/format";
import { SegmentMapModal } from "./SegmentMapModal";

interface IntervalMapModalProps {
  interval: GPXInterval;
  points: GPXTrackPoint[];
  onClose: () => void;
}

/** Modale carte pour un intervalle de fractionné (effort ou récupération) — délègue à SegmentMapModal. */
export const IntervalMapModal: React.FC<IntervalMapModalProps> = ({
  interval,
  points,
  onClose,
}) => {
  const isEffort = interval.type === "effort";
  const accent = isEffort ? "#f97316" : "#3b82f6";

  const distLabel = interval.distance >= 1000
    ? `${(interval.distance / 1000).toFixed(2)} km`
    : `${Math.round(interval.distance)} m`;

  const subtitle = [
    distLabel,
    formatDuration(interval.duration),
    `${formatPace(interval.avgPace)} /km`,
    interval.avgHeartRate != null ? `FC ${interval.avgHeartRate} bpm` : null,
  ].filter(Boolean).join(" · ");

  return (
    <SegmentMapModal
      points={points}
      startIndex={interval.startPointIndex}
      endIndex={interval.endPointIndex}
      segmentColor={accent}
      icon={isEffort ? <Zap size={18} style={{ color: accent }} /> : <RotateCcw size={18} style={{ color: accent }} />}
      title={
        <>
          {isEffort ? "Effort" : "Récupération"} #{interval.number} —{" "}
          <span style={{ color: accent }}>Fractionné</span>
        </>
      }
      subtitle={subtitle}
      onClose={onClose}
    />
  );
};
