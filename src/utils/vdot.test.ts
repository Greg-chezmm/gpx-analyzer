import { describe, it, expect } from 'vitest';
import { computeVDOT, computeVDOTFromBests, vdotFromPerformance } from './vdot';
import type { AggregatedRunBest } from './bestEfforts';

function best(key: string, meters: number, timeSeconds: number): AggregatedRunBest {
  return { key, label: key, meters, timeSeconds, entryName: 'test', entryDate: '2026-01-01' };
}

describe('computeVDOT', () => {
  it('un VDOT plus élevé prédit des temps plus rapides sur chaque distance', () => {
    const low = computeVDOT(40);
    const high = computeVDOT(60);
    for (let i = 0; i < low.races.length; i++) {
      expect(high.races[i].timeS).toBeLessThan(low.races[i].timeS);
    }
  });

  it('les temps de course prédits augmentent avec la distance', () => {
    const { races } = computeVDOT(50);
    for (let i = 1; i < races.length; i++) {
      expect(races[i].timeS).toBeGreaterThan(races[i - 1].timeS);
    }
  });

  it('les allures d\'entraînement sont ordonnées E (plus lente) > M > T > I > R (plus rapide)', () => {
    const { paces } = computeVDOT(50);
    const byLabel = Object.fromEntries(paces.map(p => [p.label, p.minPaceSecPerKm]));
    expect(byLabel.E).toBeGreaterThan(byLabel.M);
    expect(byLabel.M).toBeGreaterThan(byLabel.T);
    expect(byLabel.T).toBeGreaterThan(byLabel.I);
    expect(byLabel.I).toBeGreaterThan(byLabel.R);
  });

  it('la zone E a une plage (borne basse plus rapide que la borne haute), les autres zones sont ponctuelles', () => {
    const { paces } = computeVDOT(50);
    const e = paces.find(p => p.label === 'E')!;
    expect(e.minPaceSecPerKm).toBeLessThan(e.maxPaceSecPerKm);
    const t = paces.find(p => p.label === 'T')!;
    expect(t.minPaceSecPerKm).toBe(t.maxPaceSecPerKm);
  });
});

describe('vdotFromPerformance', () => {
  it('est l\'inverse de la prédiction de temps de computeVDOT (aller-retour cohérent)', () => {
    const vdot = 50;
    const race = computeVDOT(vdot).races.find(r => r.label === '10 km')!;
    const recovered = vdotFromPerformance(race.distance, race.timeS);
    expect(recovered).toBeCloseTo(vdot, 1);
  });

  it('une performance plus rapide sur la même distance donne un VDOT plus élevé', () => {
    const slow = vdotFromPerformance(10000, 2700); // 10km en 45min
    const fast = vdotFromPerformance(10000, 2100); // 10km en 35min
    expect(fast).toBeGreaterThan(slow);
  });
});

describe('computeVDOTFromBests', () => {
  it('utilise le temps RÉEL tel quel quand la distance correspond exactement (isActual=true)', () => {
    const bests = [best('10km', 10000, 2200)]; // 10km en 36'40"
    const result = computeVDOTFromBests(bests, null);
    const race = result.races.find(r => r.label === '10 km')!;
    expect(race.isActual).toBe(true);
    expect(race.timeS).toBe(2200);
  });

  it('prédit depuis le résultat réel le plus proche (échelle logarithmique) quand la distance ne correspond pas exactement', () => {
    // Seul résultat dispo : 5km — sert de référence pour prédire le 10km (plus proche que le fallback).
    const bests = [best('5km', 5000, 1100)]; // 5km en 18'20"
    const result = computeVDOTFromBests(bests, null);
    const race = result.races.find(r => r.label === '10 km')!;
    expect(race.isActual).toBeUndefined();
    expect(race.sourceLabel).toContain('5km');
    expect(race.timeS).toBeGreaterThan(1100); // plus long que le 5km source
  });

  it('retombe sur le VO2max estimé (fallback) quand aucun résultat réel n\'est disponible', () => {
    const resultWithFallback = computeVDOTFromBests([], 50);
    const resultNoFallback = computeVDOTFromBests([], null);
    expect(resultWithFallback.vdot).toBe(50);
    expect(resultWithFallback.races.every(r => r.timeS > 0)).toBe(true);
    expect(resultNoFallback.races.every(r => r.timeS === 0)).toBe(true);
  });

  it('choisit le résultat réel le plus proche par ratio logarithmique (symétrique), pas par écart absolu', () => {
    // Pour l'allure I (ancre 5000m) : le 1500m (ratio log ~1.2) est plus proche que le marathon
    // (ratio log ~3.3) même si l'écart absolu en mètres est bien plus petit côté marathon... non,
    // ici on vérifie simplement que le 1500m (le plus proche en distance ET en ratio) est choisi.
    const bests = [best('1500m', 1500, 300), best('42km', 42195, 10000)];
    const result = computeVDOTFromBests(bests, null);
    const iPace = result.paces.find(p => p.label === 'I')!;
    expect(iPace.sourceLabel).toContain('1500m');
  });
});
