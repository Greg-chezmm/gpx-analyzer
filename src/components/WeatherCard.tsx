import React from "react";
import { Wind, CloudSun, Droplets, Loader2, Sunrise, Sun, Sunset, Moon } from "lucide-react";
import { describeWeatherCode, windDirectionLabel, describeTimeOfDay, type WeatherInfo, type TimeOfDayPeriod } from "../utils/weather";

interface Props {
  weather: WeatherInfo | null;
  loading: boolean;
  date: Date | null;
}

/** Style de badge partagé pour moment de la journée / vent / nébulosité / précipitations. */
const badgeStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "0.35rem",
  fontSize: "0.82rem", fontWeight: 500, color: "var(--text-secondary)",
  background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
  padding: "0.3rem 0.7rem", borderRadius: "var(--radius-full)",
};

const TIME_OF_DAY_ICONS: Record<TimeOfDayPeriod, React.ReactNode> = {
  night: <Moon size={14} />,
  morning: <Sunrise size={14} />,
  afternoon: <Sun size={14} />,
  evening: <Sunset size={14} />,
};

/**
 * Météo au moment de l'activité (Open-Meteo, sans clé, couverture mondiale) + moment de la journée.
 * Purement présentationnel — le fetch/cache est géré par App.tsx (évite un rappel réseau
 * quand la donnée est déjà connue, ex. activité rechargée depuis Drive).
 * Le moment de la journée est calculé localement et s'affiche même si la météo échoue.
 */
export const WeatherCard: React.FC<Props> = ({ weather, loading, date }) => {
  const timeOfDay = date ? describeTimeOfDay(date) : null;
  const weatherReady = !loading && weather != null && weather.temperature != null;

  if (!timeOfDay && !loading && !weatherReady) return null;

  const hhmm = date
    ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    : null;
  const weatherDesc = weatherReady ? describeWeatherCode(weather!.weatherCode) : null;

  return (
    <div className="card animate-slide-up" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.6rem" }}>
      {timeOfDay && (
        <span style={badgeStyle}>
          {TIME_OF_DAY_ICONS[timeOfDay.period]}
          {timeOfDay.label}{hhmm ? ` · ${hhmm}` : ""}
        </span>
      )}

      {loading && (
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-tertiary)", fontSize: "0.85rem" }}>
          <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} />
          Météo en cours de récupération…
        </span>
      )}

      {weatherReady && weatherDesc && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.5rem", lineHeight: 1 }}>{weatherDesc.emoji}</span>
            <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text-primary)" }}>
              {Math.round(weather!.temperature!)}°C
            </span>
            <span style={{ color: "var(--text-tertiary)", fontSize: "0.85rem" }}>{weatherDesc.label}</span>
          </div>

          {weather!.windSpeed != null && (
            <span style={badgeStyle}>
              <Wind size={14} />
              {Math.round(weather!.windSpeed!)} km/h {windDirectionLabel(weather!.windDirection)}
            </span>
          )}

          {weather!.cloudCover != null && (
            <span style={badgeStyle}>
              <CloudSun size={14} />
              {Math.round(weather!.cloudCover!)}% nuages
            </span>
          )}

          {weather!.precipitation != null && weather!.precipitation! > 0 && (
            <span style={badgeStyle}>
              <Droplets size={14} />
              {weather!.precipitation!.toFixed(1)} mm
            </span>
          )}

          <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--text-tertiary)" }}>
            Source : Open-Meteo · estimation modèle (±25 km)
          </span>
        </>
      )}
    </div>
  );
};
