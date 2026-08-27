import { describe, it, expect } from 'vitest';
import { computeBestEfforts, aggregateBestRunEfforts } from './bestEfforts';
import type { GPXTrackPoint } from './gpxCore';

/** Piste synthétique à vitesse (et pente) constante, un point par seconde. */
function constantPaceTrack(opts: { durationS: number; speedMs: number; gradePct?: number; power?: number | null }): GPXTrackPoint[] {
  const { durationS, speedMs, gradePct = 0, power = null } = opts;
  const points: GPXTrackPoint[] = [];
  const start = Date.now();
  let dist = 0;
  let ele = 100;
  for (let s = 0; s <= durationS; s++) {
    points.push({
      lat: 50.6 + s * 0.00001, lon: 3.06, ele, time: new Date(start + s * 1000),
      hr: null, cad: null, power, temp: null, distFromStart: dist,
      speed: speedMs, rawSpeed: speedMs, grade: gradePct,
    });
    dist += speedMs;
    ele += speedMs * (gradePct / 100);
  }
  return points;
}

describe('computeBestEfforts — course à pied', () => {
  it('trouve le temps exact sur une piste plate à vitesse constante', () => {
    // 4 m/s pendant 1300s = 5200m, couvre 1km et 5km.
    const track = constantPaceTrack({ durationS: 1300, speedMs: 4 });
    const result = computeBestEfforts(track, 'running');
    expect(result).not.toBeNull();
    expect(result!.unit).toBe('time');
    // 1km à 4 m/s = 250s pile.
    expect(result!.values['1km']).toBeCloseTo(250, 0);
    // 5km à 4 m/s = 1250s.
    expect(result!.values['5km']).toBeCloseTo(1250, 0);
  });

  it('rejette une fenêtre trop pentue (>3% de dénivelé net) — pas de "record" en descente/montée', () => {
    // 1km de montée à 6%, bien au-dessus du seuil MAX_GRADE_PCT=3 — aucune fenêtre plate disponible.
    const climbing = constantPaceTrack({ durationS: 300, speedMs: 4, gradePct: 6 }); // 1200m à 6% de pente
    const result = computeBestEfforts(climbing, 'running');
    // Aucune distance standard ne doit avoir de résultat (toutes les fenêtres sont en pente).
    expect(result === null || Object.keys(result.values).length === 0).toBe(true);
  });

  it('retourne null si la piste est trop courte pour la plus petite distance standard (400m)', () => {
    const tooShort = constantPaceTrack({ durationS: 60, speedMs: 3 }); // 180m
    expect(computeBestEfforts(tooShort, 'running')).toBeNull();
  });

  it('ne traite JAMAIS une activité de type "unknown" comme une course — non-régression (bug réel signalé par Greg : une sortie vélo mal détectée, type "unknown", contaminait la vitesse critique avec une vitesse vélo lue comme allure de course, ex. "balade en famille" → 1km en 2:45)', () => {
    const bikeSpeed = constantPaceTrack({ durationS: 300, speedMs: 6 }); // 21.6 km/h — vitesse vélo plausible, allure course impossible sur la durée
    expect(computeBestEfforts(bikeSpeed, 'unknown')).toBeNull();
  });
});

describe('computeBestEfforts — vélo', () => {
  it('puissance constante → même valeur sur toutes les fenêtres', () => {
    const track = constantPaceTrack({ durationS: 1300, speedMs: 8, power: 220 });
    const result = computeBestEfforts(track, 'cycling');
    expect(result).not.toBeNull();
    expect(result!.unit).toBe('power');
    expect(result!.values['5s']).toBe(220);
    expect(result!.values['20min']).toBe(220);
  });

  it('bascule sur la vitesse (km/h) si aucun capteur de puissance', () => {
    const track = constantPaceTrack({ durationS: 400, speedMs: 10, power: null }); // 36 km/h
    const result = computeBestEfforts(track, 'cycling');
    expect(result).not.toBeNull();
    expect(result!.unit).toBe('speed');
    expect(result!.values['5min']).toBeCloseTo(36, 0);
  });
});

describe('aggregateBestRunEfforts', () => {
  const history = [
    { activityType: 'running', name: 'Sortie A', date: '2026-01-01', bestEfforts: { unit: 'time' as const, values: { '5km': 1300 } } },
    { activityType: 'running', name: 'Sortie B', date: '2026-02-01', bestEfforts: { unit: 'time' as const, values: { '5km': 1250 } } },
    { activityType: 'cycling', name: 'Vélo C', date: '2026-03-01', bestEfforts: { unit: 'power' as const, values: { '5km': 999 } } },
  ];

  it('retient le temps le plus rapide parmi plusieurs activités, ignore le vélo', () => {
    const result = aggregateBestRunEfforts(history);
    const fiveK = result.find(r => r.key === '5km');
    expect(fiveK).toBeDefined();
    expect(fiveK!.timeSeconds).toBe(1250);
    expect(fiveK!.entryName).toBe('Sortie B');
  });

  it('ignore une entrée de type "unknown", même avec un bestEfforts déjà calculé (données en cache avant le fix)', () => {
    // Filtre par inclusion ('running' seulement), pas juste exclusion de 'cycling' — protège contre
    // une activité 'unknown' dont le bestEfforts a été calculé par l'ancien code buggé.
    const withUnknown = [
      ...history,
      { activityType: 'unknown', name: 'Contaminée', date: '2026-06-01', bestEfforts: { unit: 'time' as const, values: { '5km': 1 } } },
    ];
    const result = aggregateBestRunEfforts(withUnknown);
    expect(result.find(r => r.key === '5km')!.timeSeconds).toBe(1250); // toujours Sortie B, pas 1s
  });

  it('la saisie manuelle prend toujours le dessus sur le temps auto-calculé', () => {
    const result = aggregateBestRunEfforts(history, { '5km': { timeSeconds: 1100, date: '2026-04-01' } });
    const fiveK = result.find(r => r.key === '5km');
    expect(fiveK!.timeSeconds).toBe(1100);
    expect(fiveK!.entryName).toBe('Saisie manuelle');
  });

  it('rejette un temps invraisemblable (contamination vélo→course, plus rapide que le record du monde)', () => {
    // Vitesse vélo (40 km/h) lue comme une allure de course sur 5km donnerait ~450s, plus rapide
    // que le record du monde (755s) — doit être filtré, pas retenu comme record personnel.
    const contaminated = [
      { activityType: 'running', name: 'Contaminée', date: '2026-05-01', bestEfforts: { unit: 'time' as const, values: { '5km': 450 } } },
    ];
    const result = aggregateBestRunEfforts(contaminated);
    expect(result.find(r => r.key === '5km')).toBeUndefined();
  });
});
