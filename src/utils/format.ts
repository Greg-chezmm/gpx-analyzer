/** Formate une durée en secondes en "h:mm:ss" ou "m:ss". */
export const formatDuration = (seconds: number): string => {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
};

/** Formate une allure en secondes/km en "m:ss", ou "--:--" si invalide. */
export const formatPace = (secondsPerKm: number): string => {
  if (secondsPerKm === 0 || isNaN(secondsPerKm) || !isFinite(secondsPerKm)) return "--:--";
  const total = Math.round(secondsPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};
