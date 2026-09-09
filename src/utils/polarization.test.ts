import { describe, it, expect, vi, afterEach } from 'vitest';
import { aggregateZoneDistribution } from './polarization';

/** Construit N entrées avec le même profil de zones (minutes), une par jour à partir de `startDate`. */
function buildEntries(zoneMinutes: number[], count: number, startDate = '2026-01-05'): { date: string; zoneMinutes: number[] }[] {
  const start = new Date(startDate + 'T00:00:00');
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i * 3); // espacées de 3 jours, étale sur plusieurs semaines
    return { date: d.toISOString().slice(0, 10), zoneMinutes };
  });
}

describe('aggregateZoneDistribution', () => {
  afterEach(() => vi.useRealTimers());

  it('retourne null sans aucune entrée avec zoneMinutes exploitable (5 zones)', () => {
    expect(aggregateZoneDistribution([])).toBeNull();
    expect(aggregateZoneDistribution([{ date: '2026-01-01' }])).toBeNull();
    expect(aggregateZoneDistribution([{ date: '2026-01-01', zoneMinutes: [10, 10] }])).toBeNull(); // pas 5 zones
  });

  it("classe 'insuffisant' avec moins de 8 séances, même avec un profil par ailleurs polarisé", () => {
    const entries = buildEntries([50, 30, 5, 5, 10], 5); // lowPct=80, modPct=10 — serait "polarisé" à 8+
    const result = aggregateZoneDistribution(entries);
    expect(result!.classification).toBe('insuffisant');
    expect(result!.sessionCount).toBe(5);
  });

  it("classe 'polarise' quand ≥75% facile et ≤15% modéré, avec assez de séances (≥8)", () => {
    // z1+z2=80 (facile), z3+z4=10 (modéré), z5=10 (intense) → lowPct=80, modPct=10
    const entries = buildEntries([50, 30, 5, 5, 10], 8);
    const result = aggregateZoneDistribution(entries);
    expect(result!.classification).toBe('polarise');
    expect(result!.lowPct).toBeCloseTo(80, 5);
    expect(result!.modPct).toBeCloseTo(10, 5);
    expect(result!.highPct).toBeCloseTo(10, 5);
  });

  it("classe 'pyramidal' quand le volume modéré/seuil dépasse 25%", () => {
    // z1+z2=50 (facile), z3+z4=30 (modéré), z5=20 (intense) → modPct=30
    const entries = buildEntries([30, 20, 20, 10, 20], 8);
    const result = aggregateZoneDistribution(entries);
    expect(result!.classification).toBe('pyramidal');
  });

  it("classe 'mixte' quand ni le seuil polarisé ni le seuil pyramidal n'est atteint", () => {
    // lowPct=70 (<75), modPct=20 (<25 mais pas <=15 non plus)
    const entries = buildEntries([40, 30, 10, 10, 10], 8);
    const result = aggregateZoneDistribution(entries);
    expect(result!.classification).toBe('mixte');
  });

  it('exclut les entrées antérieures à la fenêtre (windowDays)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));

    const recent = buildEntries([50, 30, 5, 5, 10], 8, '2026-06-01'); // dans les 30 derniers jours
    const old = buildEntries([10, 10, 10, 10, 10], 8, '2025-01-01');  // très ancien, hors fenêtre

    const withoutWindow = aggregateZoneDistribution([...recent, ...old]);
    expect(withoutWindow!.sessionCount).toBe(16);

    const withWindow = aggregateZoneDistribution([...recent, ...old], 30);
    expect(withWindow!.sessionCount).toBe(8);
  });

  it('regroupe les séances par semaine (lundi de la semaine) dans `weeks`, triées chronologiquement', () => {
    const entries = [
      { date: '2026-01-05', zoneMinutes: [10, 0, 0, 0, 0] }, // lundi
      { date: '2026-01-07', zoneMinutes: [20, 0, 0, 0, 0] }, // mercredi, même semaine
      { date: '2026-01-12', zoneMinutes: [30, 0, 0, 0, 0] }, // lundi suivant, semaine différente
    ];
    const result = aggregateZoneDistribution(entries);
    expect(result!.weeks.length).toBe(2);
    expect(result!.weeks[0].weekStart).toBe('2026-01-05');
    expect(result!.weeks[0].lowMin).toBe(30); // 10+20 fusionnés dans la même semaine
    expect(result!.weeks[1].weekStart).toBe('2026-01-12');
    expect(result!.weeks[1].lowMin).toBe(30);
    // Ordre chronologique, pas l'ordre d'insertion.
    expect(result!.weeks[0].weekStart < result!.weeks[1].weekStart).toBe(true);
  });
});
