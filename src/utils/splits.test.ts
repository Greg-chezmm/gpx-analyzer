import { describe, it, expect } from 'vitest';
import { gapFactor, calcAvgGAP } from './splits';
import type { GPXTrackPoint } from './gpxCore';

function point(speed: number | null, grade: number | null): GPXTrackPoint {
  return {
    lat: 50.6, lon: 3.06, ele: null, time: null, hr: null, cad: null, power: null, temp: null,
    distFromStart: 0, speed, rawSpeed: speed, grade,
  };
}

describe('gapFactor', () => {
  it('vaut ~1 sur terrain plat (grade=0)', () => {
    expect(gapFactor(0)).toBeCloseTo(1, 2);
  });

  it('crédite l\'effort en montée (gapFactor > 1)', () => {
    expect(gapFactor(10)).toBeGreaterThan(1);
  });

  it('pénalise (ralentit) l\'équivalent plat en descente modérée (gapFactor < 1)', () => {
    expect(gapFactor(-10)).toBeLessThan(1);
  });
});

describe('calcAvgGAP', () => {
  it('sur une pente constante, l\'allure GAP correspond à vitesse × gapFactor(pente)', () => {
    const speed = 3; // m/s
    const grade = 8; // montée constante à 8%
    const points = Array.from({ length: 20 }, () => point(speed, grade));
    const gap = calcAvgGAP(points);
    expect(gap).not.toBeNull();
    const expectedGapSpeed = speed * gapFactor(grade);
    const expectedPace = Math.round(1000 / expectedGapSpeed);
    expect(gap).toBe(expectedPace);
  });

  it('l\'allure GAP en montée est plus rapide (nombre plus petit) que l\'allure brute — crédite l\'effort de la pente (convention standard, corrigé le 2026-08-27)', () => {
    const speed = 3;
    const flatPace = Math.round(1000 / speed);
    const uphillPoints = Array.from({ length: 20 }, () => point(speed, 10));
    const gap = calcAvgGAP(uphillPoints);
    expect(gap).not.toBeNull();
    expect(gap!).toBeLessThan(flatPace);
  });

  it('retourne null si aucun point n\'a de vitesse+pente exploitables', () => {
    const points = [point(null, 5), point(3, null)];
    expect(calcAvgGAP(points)).toBeNull();
  });
});
