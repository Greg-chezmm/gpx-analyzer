# Documentation du format JSON Suunto — Export d'entraînement running

> **Destination :** agent Claude ou développeur souhaitant analyser un fichier d'export d'activité Suunto (montres Ambit, Spartan, 9, Vertical…).  
> **Fichier de référence :** `TrackRunning_2026-03-31T18_25_37.json`  
> **Activité :** Séance de running par intervalles sur piste

---

## 1. Structure racine

```
{
  "DeviceLog": {
    "Header":  { ... },   // Métadonnées globales de la séance
    "Samples": [ ... ],   // Série temporelle brute (mesures point par point)
    "Windows": [ ... ],   // Intervalles / segments découpés
    "Device":  { ... }    // Informations sur la montre
  }
}
```

Le fichier entier est encapsulé dans `DeviceLog`. Les quatre clés à connaître sont `Header`, `Samples`, `Windows` et `Device`.

---

## 2. Header — Résumé global de la séance

`DeviceLog.Header` est un dictionnaire avec ~53 champs. Voici les plus utiles :

| Champ | Type | Valeur exemple | Description |
|---|---|---|---|
| `DateTime` | string ISO 8601 | `"2026-03-31T18:25:37.640+02:00"` | Date et heure de départ (avec fuseau horaire) |
| `Distance` | number | `10404` | Distance totale en **mètres** |
| `Duration` | number | `3885.182` | Durée totale en **secondes** |
| `Energy` | number | `3100325.5` | Énergie en **joules** → diviser par 4184 pour obtenir des kcal |
| `StepCount` | number | `9484` | Nombre de foulées |
| `MAXVO2` | number | `50.9` | VO₂max estimé en mL/kg/min |
| `EPOC` | number | `121.8` | Excess Post-exercise Oxygen Consumption |
| `PeakTrainingEffect` | number | `3.8` | Effet d'entraînement (0–5) |
| `RecoveryTime` | number | `75120` | Temps de récupération recommandé en **secondes** → diviser par 3600 pour des heures |
| `FitnessAge` | number | `30` | Âge fitness estimé |
| `FitnessAgeClassification` | string | `"Excellent"` | Classe fitness |
| `Feeling` | number | `4` | Ressenti subjectif (1–5) |
| `VerticalSpeed` | number | `0.001` | Vitesse verticale moy. en m/s |
| `Altitude.Max` | number | `28.5` | Altitude max en mètres |
| `Altitude.Min` | number | `24.5` | Altitude min en mètres |
| `Ascent` | number ou null | `null` | Dénivelé positif total (peut être null → calculer depuis Samples) |
| `Descent` | number ou null | `null` | Dénivelé négatif total |

### 2.1 Fréquence cardiaque — zones

`Header.HrZones` contient le temps passé dans chaque zone cardiaque :

```json
"HrZones": {
  "Zone1Duration": 853.425,    // secondes en Z1
  "Zone2Duration": 1419.502,
  "Zone2LowerLimit": 2.34,     // seuil bas Z2 en battements/seconde (× 60 → bpm)
  "Zone3Duration": 239.5,
  "Zone3LowerLimit": 2.503,
  "Zone4Duration": 508.008,
  "Zone4LowerLimit": 2.665,
  "Zone5Duration": 864.492,
  "Zone5LowerLimit": 2.828
}
```

⚠️ **Les seuils `ZoneLowerLimit` sont en battements/seconde** — multiplier par 60 pour obtenir des bpm.  
Il n'y a pas de `Zone1LowerLimit` car c'est la zone du bas.

### 2.2 Informations personnelles

```json
"Personal": {
  "MaxHR": 3.25   // FC max personnelle en battements/seconde (3.25 × 60 = 195 bpm)
}
```

### 2.3 Paramètres GPS / capteurs

```json
"Settings": {
  "HrUsed": true,
  "FootPodUsed": false,
  "FusedAltiUsed": false,
  "AltiBaroProfile": "Barometer"  // Altitude calculée par baromètre, pas GPS
}
```

### 2.4 Température

`Header.Temperature.Max` et `.Min` sont en **Kelvin** → soustraire 273.15 pour des °C.

---

## 3. Samples — Série temporelle brute

`DeviceLog.Samples` est un tableau de **20 616 objets** (pour cette séance). Chaque objet représente un instant et contient **toujours** `TimeISO8601`, plus un ou plusieurs champs de mesure selon le type de capteur.

Il existe **plusieurs schémas** de sample — un même instant peut générer plusieurs entrées différentes :

### Schéma 1 — Événements de lap

```json
{
  "TimeISO8601": "2026-03-31T18:25:37.640+02:00",
  "Events": [
    { "ArrayBegin": 0, "Lap": { "Type": "Start" } }
  ]
}
```
Signale le début/fin d'un lap. `Lap.Type` peut être `"Start"`, `"Manual"`, etc.

### Schéma 2 — Fréquence cardiaque

```json
{
  "TimeISO8601": "2026-03-31T18:25:37.770+02:00",
  "HR": 1.47
}
```
⚠️ **`HR` est en battements/seconde** → multiplier par 60 pour des bpm.  
Exemple : `1.47 × 60 = 88 bpm`

### Schéma 3 — GPS (position)

```json
{
  "TimeISO8601": "2026-03-31T18:25:38.000+02:00",
  "Latitude": 0.8812233890363872,    // en radians
  "Longitude": 0.04985597934569977,  // en radians
  "GPSAltitude": 35,                 // altitude GPS en mètres
  "UTC": "2026-03-31T16:25:38.000+00:00"
}
```
⚠️ **Latitude et Longitude sont en radians** → multiplier par `180/π` (≈ 57.2958) pour des degrés décimaux.

### Schéma 4 — GPS (qualité signal)

```json
{
  "TimeISO8601": "...",
  "EHPE": 10,                  // Erreur horizontale estimée (mètres)
  "EVPE": 14,                  // Erreur verticale estimée (mètres)
  "NumberOfSatellites": 19,
  "Satellite5BestSNR": 29.4    // Signal/bruit des 5 meilleurs satellites
}
```

### Schéma 5 — Référence GPS interne

```json
{
  "TimeISO8601": "...",
  "GpsRef": {
    "lat": 504903467,   // latitude en degrés × 10^7
    "lon": 28565150,    // longitude en degrés × 10^7
    "utc": "..."
  }
}
```

### Schéma 6 — Mesures capteurs principaux ⭐ (le plus riche)

```json
{
  "TimeISO8601": "2026-03-31T18:25:45.650+02:00",
  "Altitude": 24.6,            // mètres (baromètre)
  "Speed": 3.12,               // m/s (null si en pause/arrêt)
  "Cadence": 1.35,             // pas/seconde → × 60 = pas/min → × 2 = foulées/min
  "Distance": 12,              // distance cumulée depuis le départ en mètres
  "Power": 130,                // watts
  "Temperature": 297.52,       // Kelvin → - 273.15 = °C
  "VerticalSpeed": 0,          // m/s (positif = montée)
  "AbsPressure": 102676,       // Pression absolue en Pascal
  "SeaLevelPressure": 102951   // Pression au niveau de la mer en Pascal
}
```
Ce schéma est émis environ toutes les **secondes**. C'est le cœur des données temporelles.

**Conversions importantes :**
- `Speed` en m/s → `× 3.6` = km/h → allure : `1000 / Speed_mps / 60` = min/km
- `Cadence` en pas/s → `× 60` = pas/min → `× 2` = foulées/min (car la montre compte un pied)
- `Speed: null` = arrêt ou données manquantes (à filtrer)

### Schéma 7 — Batterie

```json
{
  "TimeISO8601": "...",
  "BatteryCharge": 0.91,      // 0–1 (91% de batterie)
  "BatteryCurrent": -0.033,   // Ampères (négatif = décharge)
  "BatteryVoltage": 4.309     // Volts
}
```

### Comment itérer sur les Samples

```python
t0 = None
for sample in data["DeviceLog"]["Samples"]:
    t = datetime.fromisoformat(sample["TimeISO8601"])
    if t0 is None: t0 = t
    elapsed_sec = (t - t0).total_seconds()

    if "HR" in sample:
        bpm = round(sample["HR"] * 60)

    if "Speed" in sample and sample["Speed"] is not None:
        speed_kmh = sample["Speed"] * 3.6
        pace_min_km = 1000 / sample["Speed"] / 60

    if "Altitude" in sample:
        alt_m = sample["Altitude"]

    if "Latitude" in sample:
        lat_deg = sample["Latitude"] * (180 / 3.141592653589793)
        lon_deg = sample["Longitude"] * (180 / 3.141592653589793)
```

---

## 4. Windows — Intervalles et segments

`DeviceLog.Windows` est un tableau de **22 objets** pour cette séance. Chaque objet a la forme :

```json
{
  "TimeISO8601": "2026-03-31T18:59:35.830+02:00",  // heure de FIN du segment
  "Window": { ... }                                  // données du segment
}
```

### 4.1 Identifier le type de segment

Chaque `Window` possède deux champs clés :

| `IntervalType` | `IntervalNotes` (exemple) | Signification |
|---|---|---|
| `"Warmup"` | `"Échauffement"` | Échauffement |
| `"Interval"` | `"Intervalle"` | Effort (intervalle actif) |
| `"Recovery"` | `"r100m"`, `"r200m"`, `"Récupération"` | Récupération entre efforts |
| `"Cooldown"` | `"Repos"` | Retour au calme |
| `null` | `""` | Résumé total de la séance (2 entrées en fin de tableau) |

Le champ `Type` vaut toujours `"Interval"` pour tous les segments actifs — **ne pas utiliser `Type` pour distinguer les segments, utiliser `IntervalType`**.

### 4.2 Structure d'un Window

```json
{
  "IntervalType": "Interval",
  "IntervalNotes": "Intervalle",
  "Type": "Interval",
  "Distance": 300,         // mètres
  "Duration": 64.6,        // secondes
  "Ascent": 0,             // dénivelé positif en mètres
  "Descent": 0,            // dénivelé négatif en mètres
  "Energy": 143000,        // joules (÷ 4184 = kcal)
  "RecoveryTime": 3600,    // secondes de récupération recommandée
  "IntervalLoopNum": null, // numéro de boucle (si programmé)

  "HR": [{ "Avg": 2.85, "Max": 2.95, "Min": 2.72 }],
  "Speed": [{ "Avg": 4.644, "Max": 5.02, "Min": 2.59 }],
  "Altitude": [{ "Avg": 25.8, "Max": 25.9, "Min": 25.8 }],
  "Power": [{ "Avg": 340.1, "Max": 384, "Min": 198 }],
  "Cadence": [{ "Avg": 1.516, "Max": 1.55, "Min": 1.367 }],
  "Temperature": [{ "Avg": 287.5, "Max": 288.0, "Min": 287.1 }],
  "VerticalSpeed": [{ "Avg": 0.001, "Max": 0.1, "Min": -0.1 }]
}
```

⚠️ **Toutes les métriques dans un Window sont dans des listes à 1 élément** — accéder via `w["HR"][0]["Avg"]`.

⚠️ **Mêmes unités que dans les Samples** : HR en battements/s, Speed en m/s, Cadence en pas/s, Temperature en Kelvin.

### 4.3 Récupérer les intervalles d'effort

```python
windows = data["DeviceLog"]["Windows"]

intervals = []
for item in windows:
    w = item["Window"]
    if w.get("IntervalType") == "Interval" and w.get("Type") == "Interval":
        hr_avg_bpm = round(w["HR"][0]["Avg"] * 60)
        hr_max_bpm = round(w["HR"][0]["Max"] * 60)
        speed_avg_mps = w["Speed"][0]["Avg"]
        pace_min_km = 1000 / speed_avg_mps / 60  # min/km
        intervals.append({
            "type": w["IntervalType"],    # "Interval", "Recovery", etc.
            "notes": w["IntervalNotes"],
            "distance_m": w["Distance"],
            "duration_s": w["Duration"],
            "hr_avg": hr_avg_bpm,
            "hr_max": hr_max_bpm,
            "pace_min_km": pace_min_km,
            "power_w": round(w["Power"][0]["Avg"]),
            "ascent_m": w["Ascent"],
            "descent_m": w["Descent"],
        })
```

### 4.4 Séquence des Windows dans cette séance

```
[0]  Warmup    — Échauffement  4158m  34min
[1]  Interval  — Intervalle     300m  64s
[2]  Recovery  — r100m          100m  40s
[3]  Interval  — Intervalle     300m  67s
[4]  Recovery  — r100m          100m  42s
[5]  Interval  — Intervalle     300m  66s
[6]  Recovery  — r100m          100m  42s
[7]  Interval  — Intervalle     800m 191s
[8]  Recovery  — r200m          200m  80s
[9]  Interval  — Intervalle     800m 193s
[10] Recovery  — r200m          197m  81s
[11] Interval  — Intervalle     800m 196s
[12] Recovery  — r200m          200m  82s
[13] Interval  — Intervalle     300m  68s
[14] Recovery  — Récupération   100m  48s
[15] Interval  — Intervalle     300m  68s
[16] Recovery  — Récupération    99m  47s
[17] Interval  — Intervalle     300m  68s
[18] Recovery  — Récupération   101m  58s
[19] Cooldown  — Repos          849m 347s
[20] null      — (total séance)
[21] null      — (total séance, doublon)
```

---

## 5. Device — Informations montre

```json
"Device": {
  "Name": "Tianjin",             // Nom personnalisé de la montre
  "SerialNumber": "2541D0000981",
  "Info": {
    "HW": "Phoenix_RevB1",       // Modèle hardware
    "SW": "2.50.28",             // Version firmware
    "BatteryDesignCapacity": 1980,
    "BatteryFullCapacity": 1980
  }
}
```

---

## 6. Récapitulatif des conversions d'unités

| Champ | Unité native | Conversion → unité usuelle |
|---|---|---|
| `HR` (partout) | battements/seconde | `× 60` → **bpm** |
| `Speed` (partout) | m/s | `× 3.6` → **km/h** / `1000 / v / 60` → **min/km** |
| `Cadence` (partout) | pas/seconde | `× 60` → pas/min / `× 120` → **foulées/min** |
| `Latitude`, `Longitude` | radians | `× (180/π)` → **degrés décimaux** |
| `Temperature` | Kelvin | `- 273.15` → **°C** |
| `Energy` | joules | `/ 4184` → **kcal** |
| `Duration`, `RecoveryTime` | secondes | `/ 60` → min / `/ 3600` → heures |
| `Distance` | mètres | `/ 1000` → **km** |
| `ZoneLowerLimit` (HrZones) | battements/seconde | `× 60` → **bpm** |
| `AbsPressure`, `SeaLevelPressure` | Pascal | `/ 100` → **hPa** |
| `GpsRef.lat`, `GpsRef.lon` | degrés × 10⁷ | `/ 10 000 000` → **degrés** |

---

## 7. Pièges courants

1. **`Speed: null`** dans les Samples — toujours filtrer avant de calculer une allure.
2. **Les deux derniers Windows** (`IntervalType: null`) sont des doublons du résumé total — les exclure lors de l'itération.
3. **`Altitude` vs `GPSAltitude`** — `Altitude` dans les Samples mesurés (schéma 6) est l'altitude barométrique (plus précise). `GPSAltitude` dans le schéma GPS est l'altitude GPS brute (moins fiable).
4. **`Ascent`/`Descent` à `null` dans le Header** — si null, les calculer manuellement depuis la série d'altitude des Samples (diff > seuil ~0.5m pour éviter le bruit).
5. **`Window.HR[0]`** — toujours accéder à l'index `[0]`, même si c'est une liste d'un seul élément.
6. **`Personal.MaxHR`** est en battements/seconde (ex: `3.25 × 60 = 195 bpm`).

---

## 8. Exemple de code complet — extraction rapide

```python
import json
from datetime import datetime
import math

with open("TrackRunning_2026-03-31T18_25_37.json") as f:
    data = json.load(f)

log = data["DeviceLog"]
header = log["Header"]

# ── Globaux ──────────────────────────────────────────────
print(f"Date       : {header['DateTime']}")
print(f"Distance   : {header['Distance'] / 1000:.2f} km")
print(f"Durée      : {header['Duration'] / 60:.1f} min")
print(f"Énergie    : {header['Energy'] / 4184:.0f} kcal")
print(f"VO2max     : {header['MAXVO2']} mL/kg/min")
print(f"FC max pers: {round(header['Personal']['MaxHR'] * 60)} bpm")
print(f"Récup. rec.: {header['RecoveryTime'] / 3600:.0f}h")

# ── Intervalles ──────────────────────────────────────────
for item in log["Windows"]:
    w = item["Window"]
    itype = w.get("IntervalType")
    if itype not in ("Interval", "Recovery", "Warmup", "Cooldown"):
        continue
    hr_avg = round(w["HR"][0]["Avg"] * 60) if w["HR"][0]["Avg"] else None
    spd = w["Speed"][0]["Avg"]
    pace = f"{int(1000/spd/60)}:{round((1000/spd/60 % 1)*60):02d}" if spd else "—"
    print(f"{itype:10s} | {w['Distance']:5.0f}m | {w['Duration']:6.1f}s | {pace} /km | {hr_avg} bpm")

# ── Série temporelle ─────────────────────────────────────
t0 = None
for s in log["Samples"]:
    t = datetime.fromisoformat(s["TimeISO8601"])
    if t0 is None: t0 = t
    elapsed = (t - t0).total_seconds()
    if "HR" in s:
        bpm = round(s["HR"] * 60)
    if "Speed" in s and s["Speed"]:
        kmh = s["Speed"] * 3.6
    if "Latitude" in s:
        lat = s["Latitude"] * 180 / math.pi
        lon = s["Longitude"] * 180 / math.pi
```

---

*Documentation générée à partir du fichier `TrackRunning_2026-03-31T18_25_37.json` — Suunto export format v2 (Movescount / SuuntoLink)*
