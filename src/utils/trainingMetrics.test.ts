import { describe, it, expect } from 'vitest';
import { calcTSB, calcTRIMP, calcNormalizedPower, calcCardiacDrift, estimateVO2max } from './trainingMetrics';
import type { GPXTrackPoint, GPXActivity } from './gpxCore';

/** Piste synthétique : FC et vitesse constantes (ou par étape), un point par seconde, terrain plat. */
function buildTrack(steps: { durationS: number; hr: number; speedMs: number }[]): GPXTrackPoint[] {
  const points: GPXTrackPoint[] = [];
  const start = Date.now();
  let t = 0;
  let dist = 0;
  for (const step of steps) {
    for (let s = 0; s < step.durationS; s++) {
      points.push({
        lat: 50.6 + t * 0.00001, lon: 3.06, ele: 100, time: new Date(start + t * 1000),
        hr: step.hr, cad: null, power: null, temp: null, distFromStart: dist,
        speed: step.speedMs, rawSpeed: step.speedMs, grade: 0,
      });
      t++;
      dist += step.speedMs;
    }
  }
  return points;
}

describe('calcTSB', () => {
  it('TSB du jour même d\'un effort est 0 (calculé avant d\'intégrer la séance du jour)', () => {
    const result = calcTSB([{ date: '2026-01-01', trimp: 100 }], '2026-01-01');
    expect(result.tsb).toBe(0);
    expect(result.ctl).toBeCloseTo(100 / 42, 1);
    expect(result.atl).toBeCloseTo(100 / 7, 1);
  });

  it('ATL décroît selon λ=1/7 (pas 2/(τ+1)) — non-régression de la formule EMA', () => {
    // Un seul jour d'effort (trimp=100) suivi de 7 jours de repos : ATL doit suivre EXACTEMENT
    // atl_0 × (6/7)^7 ≈ 4.86. Avec l'ancienne formule buguée (λ=2/8=0.25), le résultat serait très
    // différent (≈1.9) — ce test aurait détecté la régression corrigée (voir memory du projet).
    const result = calcTSB([{ date: '2026-01-01', trimp: 100 }], '2026-01-08');
    const atl0 = 100 / 7;
    const expectedAtl = atl0 * Math.pow(6 / 7, 7);
    expect(result.atl).toBeCloseTo(expectedAtl, 0); // tolérance ±0.5 (arrondis intermédiaires jour par jour)
  });

  it('un historique vide retourne des valeurs nulles sans planter', () => {
    const result = calcTSB([]);
    expect(result).toEqual({ atl: 0, ctl: 0, tsb: 0, chartData: [] });
  });
});

describe('calcTRIMP', () => {
  it('classe tout le temps dans Z1 pour un effort à faible %FCR et calcule Edwards en conséquence', () => {
    // FCmax=190, FCrepos=50 → réserve 140. HR=95 → 32% réserve → Z1 (0-60%).
    const track = buildTrack([{ durationS: 600, hr: 95, speedMs: 3 }]); // 10 min
    const result = calcTRIMP(track, 190, 50);
    expect(result).not.toBeNull();
    expect(result!.zoneMinutes).toEqual([10, 0, 0, 0, 0]);
    expect(result!.edwards).toBe(10); // 10 min × poids Z1 (1)
  });

  it('Banister : même effort, coefficients homme vs femme donnent des résultats différents', () => {
    const track = buildTrack([{ durationS: 1800, hr: 160, speedMs: 4 }]); // 30 min, effort soutenu
    const male = calcTRIMP(track, 190, 50, 'M');
    const female = calcTRIMP(track, 190, 50, 'F');
    expect(male!.banister).not.toBe(female!.banister);
  });

  it('retourne null si moins d\'une minute de données FC exploitables', () => {
    const track = buildTrack([{ durationS: 30, hr: 120, speedMs: 3 }]);
    expect(calcTRIMP(track, 190, 50)).toBeNull();
  });
});

describe('calcNormalizedPower', () => {
  it('puissance parfaitement constante → NP égale la puissance moyenne', () => {
    const track = buildTrack([{ durationS: 120, hr: 140, speedMs: 8 }]).map(p => ({ ...p, power: 200 }));
    expect(calcNormalizedPower(track)).toBe(200);
  });

  it('puissance variable → NP strictement supérieure à la moyenne simple (propriété Coggan)', () => {
    // Blocs de 60s (plus longs que la fenêtre glissante de 30s) pour que la moyenne mobile
    // elle-même varie — une alternance plus rapide que la fenêtre se lisse et annule l'effet NP.
    const track = buildTrack([{ durationS: 300, hr: 140, speedMs: 8 }]).map((p, i) => ({
      ...p, power: Math.floor(i / 60) % 2 === 0 ? 100 : 400,
    }));
    const avgPower = track.reduce((s, p) => s + p.power!, 0) / track.length;
    const np = calcNormalizedPower(track);
    expect(np).not.toBeNull();
    expect(np!).toBeGreaterThan(avgPower);
  });
});

describe('calcCardiacDrift', () => {
  it('détecte une dérive positive quand la FC augmente à vitesse égale entre les deux moitiés', () => {
    const activity = {
      points: buildTrack([
        { durationS: 900, hr: 140, speedMs: 3 }, // 1ère moitié : EF = 3000/140
        { durationS: 900, hr: 155, speedMs: 3 }, // 2ème moitié : même vitesse, FC plus haute → EF plus bas
      ]),
    } as GPXActivity;
    const drift = calcCardiacDrift(activity);
    expect(drift).not.toBeNull();
    expect(drift!.decoupling).toBeGreaterThan(0);
    expect(drift!.avgHR2).toBeGreaterThan(drift!.avgHR1);
  });

  it('retourne null si la séance est trop courte pour découper en deux moitiés significatives', () => {
    const activity = { points: buildTrack([{ durationS: 20, hr: 140, speedMs: 3 }]) } as GPXActivity;
    expect(calcCardiacDrift(activity)).toBeNull();
  });
});

describe('estimateVO2max', () => {
  it('rejette une séance dont le meilleur segment stable est en pente (>5% de dénivelé moyen)', () => {
    const points = buildTrack([{ durationS: 900, hr: 160, speedMs: 3.5 }]).map(p => ({ ...p, grade: 8 }));
    const activity = { activityType: 'running', points } as GPXActivity;
    expect(estimateVO2max(activity, 190, 50)).toBeNull();
  });

  it('rejette si le %HRR du segment le plus stable est hors de la plage valide 55–97%', () => {
    // HR=90, FCmax=190, FCrepos=50 → HRR = 40/140 = 28.6%, bien en dessous du plancher 55%.
    const points = buildTrack([{ durationS: 900, hr: 90, speedMs: 3 }]);
    const activity = { activityType: 'running', points } as GPXActivity;
    expect(estimateVO2max(activity, 190, 50)).toBeNull();
  });

  it('calcule le VO2max selon Swain & Leutholtz sur un segment plat et stable dans la plage valide', () => {
    // HR=145 → HRR=(145-50)/140=67.9%, dans la plage 55-97%. Vitesse 3.5 m/s constante, terrain plat.
    const points = buildTrack([{ durationS: 900, hr: 145, speedMs: 3.5 }]); // 15 min, largement > 10 min requis
    const activity = { activityType: 'running', points } as GPXActivity;
    const result = estimateVO2max(activity, 190, 50);
    expect(result).not.toBeNull();
    const hrrPct = (145 - 50) / 140;
    const vo2net = 0.2 * (3.5 * 60);
    const expectedVo2max = Math.round((vo2net / hrrPct + 3.5) * 10) / 10;
    expect(result!.value).toBeCloseTo(expectedVo2max, 1);
  });

  it('retourne null pour une activité vélo (estimation course uniquement)', () => {
    const points = buildTrack([{ durationS: 900, hr: 150, speedMs: 8 }]);
    const activity = { activityType: 'cycling', points } as GPXActivity;
    expect(estimateVO2max(activity, 190, 50)).toBeNull();
  });
});
