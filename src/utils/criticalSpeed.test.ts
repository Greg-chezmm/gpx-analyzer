import { describe, it, expect } from 'vitest';
import { estimateCriticalSpeed, dPrimeProfile, type CSPoint } from './criticalSpeed';

/** Point CS synthétique — construit `meters` exactement sur la droite d = cs*t + dPrime pour un temps donné. */
function pointOnLine(key: string, timeSeconds: number, cs: number, dPrime: number): CSPoint {
  return { key, label: key, meters: cs * timeSeconds + dPrime, timeSeconds, entryName: 'test', entryDate: '2026-01-01' };
}

describe('estimateCriticalSpeed', () => {
  it('retourne null avec moins de 2 points dans la fenêtre valide (120-1800s)', () => {
    expect(estimateCriticalSpeed([])).toBeNull();
    expect(estimateCriticalSpeed([pointOnLine('1', 300, 5, 200)])).toBeNull();
  });

  it('exclut les points hors fenêtre 120-1800s (sprint trop anaérobie / longue distance limitée par le ravitaillement)', () => {
    const tooShort = pointOnLine('sprint', 60, 5, 200);   // 1 min
    const tooLong = pointOnLine('ultra', 3600, 5, 200);   // 1h
    const valid1 = pointOnLine('5k', 300, 5, 200);
    const valid2 = pointOnLine('10k', 900, 5, 200);
    const result = estimateCriticalSpeed([tooShort, tooLong, valid1, valid2]);
    expect(result).not.toBeNull();
    expect(result!.points.map(p => p.key).sort()).toEqual(['10k', '5k']);
  });

  it('retrouve exactement CS et D\' sur des points construits pile sur le modèle (régression parfaite)', () => {
    const cs = 5; // m/s
    const dPrime = 200; // m
    const points = [
      pointOnLine('1500m', 150, cs, dPrime),
      pointOnLine('5k', 400, cs, dPrime),
      pointOnLine('10k', 1000, cs, dPrime),
    ];
    const result = estimateCriticalSpeed(points);
    expect(result).not.toBeNull();
    expect(result!.cs).toBeCloseTo(cs, 6);
    expect(result!.dPrime).toBeCloseTo(dPrime, 3);
    expect(result!.csPaceSecPerKm).toBeCloseTo(1000 / cs, 6);
    expect(result!.rSquared).toBeCloseTo(1, 6);
  });

  it('confiance plafonnée à \'medium\' avec seulement 2 points, même avec un ajustement parfait (une droite passe toujours exactement par 2 points)', () => {
    const points = [pointOnLine('a', 150, 5, 200), pointOnLine('b', 900, 5, 200)];
    const result = estimateCriticalSpeed(points);
    expect(result!.confidence).toBe('medium');
  });

  it('confiance \'high\' avec 3+ points et R² ≥ 0.98 (la linéarité est réellement validée)', () => {
    const points = [
      pointOnLine('a', 150, 5, 200),
      pointOnLine('b', 500, 5, 200),
      pointOnLine('c', 1000, 5, 200),
    ];
    const result = estimateCriticalSpeed(points);
    expect(result!.confidence).toBe('high');
  });

  it('confiance \'low\' avec un ajustement médiocre (points qui ne suivent pas une droite)', () => {
    const points: CSPoint[] = [
      { key: 'a', label: 'a', meters: 1200, timeSeconds: 150, entryName: 'x', entryDate: '2026-01-01' },
      { key: 'b', label: 'b', meters: 500, timeSeconds: 400, entryName: 'x', entryDate: '2026-01-01' }, // non-monotone
      { key: 'c', label: 'c', meters: 4000, timeSeconds: 900, entryName: 'x', entryDate: '2026-01-01' },
    ];
    const result = estimateCriticalSpeed(points);
    expect(result!.rSquared).toBeLessThan(0.85);
    expect(result!.confidence).toBe('low');
  });

  it('retourne null si la vitesse critique ajustée est négative ou nulle (régression non physiologique)', () => {
    // Distance qui DÉCROÎT avec le temps — pente négative, CS <= 0.
    const points = [
      pointOnLine('a', 150, -1, 2000),
      pointOnLine('b', 900, -1, 2000),
    ];
    const result = estimateCriticalSpeed(points);
    expect(result).toBeNull();
  });
});

describe('dPrimeProfile', () => {
  it('classe endurant (<120m), équilibré (120-250m), explosif (>250m)', () => {
    expect(dPrimeProfile(39)).toBe('endurant');
    expect(dPrimeProfile(119.9)).toBe('endurant');
    expect(dPrimeProfile(120)).toBe('equilibre');
    expect(dPrimeProfile(250)).toBe('equilibre');
    expect(dPrimeProfile(250.1)).toBe('explosif');
    expect(dPrimeProfile(400)).toBe('explosif');
  });
});
