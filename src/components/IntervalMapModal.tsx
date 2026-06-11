import React from "react";
import { Zap } from "lucide-react";
import type { GPXTrackPoint } from "../utils/gpxParser";
import type { GPXInterval } from "../utils/intervals";
import { formatDuration, formatPace } from "./SplitsTable";
import { SegmentMapModal } from "./SegmentMapModal";

interface IntervalMapModalProps {
  interval: GPXInterval;
  intervalIndex: number;
  points: GPXTrackPoint[];
  onClose: () => void;
}

/** Modale carte pour un intervalle de fractionné — délègue à SegmentMapModal. */
export const IntervalMapModal: React.FC<IntervalMapModalProps> = ({
  interval,
  intervalIndex,
  points,
  onClose,
}) => {
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
      segmentColor="#f97316"
      icon={<Zap size={18} style={{ color: "#f97316" }} />}
      title={
        <>
          Effort #{intervalIndex + 1} —{" "}
          <span style={{ color: "#f97316" }}>Fractionné</span>
        </>
      }
      subtitle={subtitle}
      onClose={onClose}
    />
  );
};
