/** Réponse partielle de l'API Open-Meteo (forecast ou archive), section horaire. */
interface OpenMeteoHourly {
  time: string[];
  temperature_2m?: number[];
  wind_speed_10m?: number[];
  wind_direction_10m?: number[];
  cloud_cover?: number[];
  precipitation?: number[];
  weather_code?: number[];
}

interface OpenMeteoResponse {
  hourly?: OpenMeteoHourly;
}

/** Modèle/source ayant produit la donnée : AROME (France, haute résolution) ou ARPEGE (Europe/monde) via Météo-France pour le récent, ERA5 (réanalyse) pour l'historique lointain. */
export type WeatherSource = 'meteofrance_arome' | 'meteofrance_arpege' | 'era5';

/** Conditions météo à l'heure de l'activité, unités SI (°C, km/h, %, mm). */
export interface WeatherInfo {
  temperature: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  cloudCover: number | null;
  precipitation: number | null;
  weatherCode: number | null;
  source: WeatherSource | null;
}

/** Sous-ensemble des champs météo d'une entrée d'index Drive (voir driveStorage.ts). */
interface DriveWeatherFields {
  weatherTemp?: number;
  weatherWindSpeed?: number;
  weatherWindDirection?: number;
  weatherCloudCover?: number;
  weatherPrecipitation?: number;
  weatherCode?: number;
  weatherSource?: WeatherSource;
}

/** Convertit un WeatherInfo en champs plats pour l'index Drive (évite les `undefined` explicites en JSON). */
export function weatherToEntryFields(w: WeatherInfo | null): DriveWeatherFields {
  if (!w) return {};
  const fields: DriveWeatherFields = {};
  if (w.temperature != null)   fields.weatherTemp = w.temperature;
  if (w.windSpeed != null)     fields.weatherWindSpeed = w.windSpeed;
  if (w.windDirection != null) fields.weatherWindDirection = w.windDirection;
  if (w.cloudCover != null)    fields.weatherCloudCover = w.cloudCover;
  if (w.precipitation != null) fields.weatherPrecipitation = w.precipitation;
  if (w.weatherCode != null)   fields.weatherCode = w.weatherCode;
  if (w.source != null)        fields.weatherSource = w.source;
  return fields;
}

/** Reconstruit un WeatherInfo depuis une entrée d'index Drive ; `undefined` si aucune donnée météo stockée. */
export function entryToWeather(entry: DriveWeatherFields): WeatherInfo | undefined {
  if (entry.weatherTemp == null) return undefined;
  return {
    temperature: entry.weatherTemp,
    windSpeed: entry.weatherWindSpeed ?? null,
    windDirection: entry.weatherWindDirection ?? null,
    cloudCover: entry.weatherCloudCover ?? null,
    precipitation: entry.weatherPrecipitation ?? null,
    weatherCode: entry.weatherCode ?? null,
    // Absent sur les entrées enregistrées avant l'ajout de ce champ.
    source: entry.weatherSource ?? null,
  };
}

// L'API archive (ERA5) a ~5 jours de retard ; en-deçà on utilise l'API forecast qui couvre le passé récent.
const RECENT_THRESHOLD_DAYS = 5;
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

// Domaine approximatif de couverture AROME (France + régions limitrophes) ; en-dehors, on bascule sur ARPEGE.
const AROME_DOMAIN = { latMin: 37.5, latMax: 55.4, lonMin: -8, lonMax: 12 };

function isWithinAromeDomain(lat: number, lon: number): boolean {
  return lat >= AROME_DOMAIN.latMin && lat <= AROME_DOMAIN.latMax
    && lon >= AROME_DOMAIN.lonMin && lon <= AROME_DOMAIN.lonMax;
}

const cache = new Map<string, Promise<WeatherInfo | null>>();

/**
 * Récupère les conditions météo (Open-Meteo, gratuit, sans clé) au point GPS et à l'heure données.
 * Fonctionne dans le monde entier. Résultat mis en cache par heure/position pour éviter les doublons d'appel.
 * `force: true` ignore le cache (bouton de rafraîchissement manuel).
 */
export function getActivityWeather(lat: number, lon: number, date: Date, force = false): Promise<WeatherInfo | null> {
  const hourKey = date.toISOString().slice(0, 13);
  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)},${hourKey}`;
  if (!force) {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  }
  const promise = fetchWeather(lat, lon, date);
  cache.set(cacheKey, promise);
  return promise;
}

async function fetchWeather(lat: number, lon: number, date: Date): Promise<WeatherInfo | null> {
  try {
    const daysAgo = (Date.now() - date.getTime()) / 86_400_000;
    const isRecent = daysAgo < RECENT_THRESHOLD_DAYS;
    const baseUrl = isRecent ? FORECAST_URL : ARCHIVE_URL;
    const dateStr = date.toISOString().slice(0, 10);
    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      start_date: dateStr,
      end_date: dateStr,
      hourly: 'temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation,weather_code',
      timezone: 'UTC', // fixe la référence temporelle pour matcher directement les timestamps GPX (UTC)
    });
    // Modèles Météo-France plutôt que le blend multi-modèles par défaut d'Open-Meteo :
    // AROME (haute résolution) sur son domaine France/limitrophes, ARPEGE (Europe/monde) ailleurs.
    // Non applicable à l'archive ERA5 (dataset fixe, sans paramètre `models`).
    const source: WeatherSource = !isRecent
      ? 'era5'
      : isWithinAromeDomain(lat, lon) ? 'meteofrance_arome' : 'meteofrance_arpege';
    if (isRecent) {
      params.set('models', source === 'meteofrance_arome' ? 'meteofrance_arome_seamless' : 'meteofrance_arpege_seamless');
    }
    const res = await fetch(`${baseUrl}?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json() as OpenMeteoResponse;
    const hourly = data.hourly;
    if (!hourly?.time?.length) return null;

    const targetHour = `${dateStr}T${String(date.getUTCHours()).padStart(2, '0')}:00`;
    let idx = hourly.time.indexOf(targetHour);
    if (idx === -1) idx = 0;

    return {
      temperature: hourly.temperature_2m?.[idx] ?? null,
      windSpeed: hourly.wind_speed_10m?.[idx] ?? null,
      windDirection: hourly.wind_direction_10m?.[idx] ?? null,
      cloudCover: hourly.cloud_cover?.[idx] ?? null,
      precipitation: hourly.precipitation?.[idx] ?? null,
      weatherCode: hourly.weather_code?.[idx] ?? null,
      source,
    };
  } catch {
    return null;
  }
}

/** Table d'interprétation des codes WMO (norme utilisée par Open-Meteo) en français. */
const WEATHER_CODES: Record<number, { emoji: string; label: string }> = {
  0:  { emoji: '☀️', label: 'Ciel clair' },
  1:  { emoji: '🌤️', label: 'Principalement clair' },
  2:  { emoji: '⛅', label: 'Partiellement nuageux' },
  3:  { emoji: '☁️', label: 'Couvert' },
  45: { emoji: '🌫️', label: 'Brouillard' },
  48: { emoji: '🌫️', label: 'Brouillard givrant' },
  51: { emoji: '🌦️', label: 'Bruine légère' },
  53: { emoji: '🌦️', label: 'Bruine' },
  55: { emoji: '🌦️', label: 'Bruine forte' },
  56: { emoji: '🌧️', label: 'Bruine verglaçante' },
  57: { emoji: '🌧️', label: 'Bruine verglaçante forte' },
  61: { emoji: '🌧️', label: 'Pluie légère' },
  63: { emoji: '🌧️', label: 'Pluie' },
  65: { emoji: '🌧️', label: 'Pluie forte' },
  66: { emoji: '🌧️', label: 'Pluie verglaçante' },
  67: { emoji: '🌧️', label: 'Pluie verglaçante forte' },
  71: { emoji: '🌨️', label: 'Neige légère' },
  73: { emoji: '🌨️', label: 'Neige' },
  75: { emoji: '🌨️', label: 'Neige forte' },
  77: { emoji: '🌨️', label: 'Neige en grains' },
  80: { emoji: '🌦️', label: 'Averses légères' },
  81: { emoji: '🌦️', label: 'Averses' },
  82: { emoji: '🌧️', label: 'Averses violentes' },
  85: { emoji: '🌨️', label: 'Averses de neige' },
  86: { emoji: '🌨️', label: 'Averses de neige fortes' },
  95: { emoji: '⛈️', label: 'Orage' },
  96: { emoji: '⛈️', label: 'Orage avec grêle' },
  99: { emoji: '⛈️', label: 'Orage avec grêle forte' },
};

/** Traduit un code météo WMO en emoji + libellé français. Retombe sur un nuage neutre si code inconnu. */
export function describeWeatherCode(code: number | null): { emoji: string; label: string } {
  if (code == null || !(code in WEATHER_CODES)) return { emoji: '🌡️', label: 'Conditions inconnues' };
  return WEATHER_CODES[code];
}

const WEATHER_SOURCE_LABELS: Record<WeatherSource, string> = {
  meteofrance_arome: 'Météo-France · AROME (~2 km)',
  meteofrance_arpege: 'Météo-France · ARPEGE (~10-25 km)',
  era5: 'ERA5 · réanalyse historique (~25 km)',
};

/** Libellé lisible de la source météo (AROME/ARPEGE/ERA5) ; fallback générique si absente (entrées enregistrées avant son ajout). */
export function describeWeatherSource(source: WeatherSource | null | undefined): string {
  return source ? WEATHER_SOURCE_LABELS[source] : 'Open-Meteo · estimation modèle (±25 km)';
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

/** Convertit un angle de direction du vent (degrés) en point cardinal abrégé (ex. "NO"). */
export function windDirectionLabel(degrees: number | null): string {
  if (degrees == null) return '';
  const idx = Math.round(degrees / 45) % 8;
  return COMPASS_POINTS[idx];
}

export type TimeOfDayPeriod = 'night' | 'morning' | 'afternoon' | 'evening';

export interface TimeOfDayInfo {
  period: TimeOfDayPeriod;
  label: string;
}

/** Catégorise l'heure de la journée (nuit/matin/après-midi/soir) à partir de l'heure locale du navigateur. */
export function describeTimeOfDay(date: Date): TimeOfDayInfo {
  const h = date.getHours();
  if (h >= 22 || h < 5) return { period: 'night', label: 'Nuit' };
  if (h < 12) return { period: 'morning', label: 'Matin' };
  if (h < 18) return { period: 'afternoon', label: 'Après-midi' };
  return { period: 'evening', label: 'Soir' };
}
