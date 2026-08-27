import { describe, it, expect } from 'vitest';
import {
  calcTSB, calcTRIMP, calcNormalizedPower, calcCardiacDrift, estimateVO2max,
  calcCardiacPaceFromAggregate, calcEfficiencyPaceFromAggregate, computeEfficiencyTrend,
} from './trainingMetrics';
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

describe('calcCardiacPaceFromAggregate', () => {
  it('effort au-dessus de la référence (65% HRR) → allure cardiaque plus rapide que l\'allure brute', () => {
    // HR=150, FCmax=190, FCrepos=50 → HRR=71.4%, au-dessus de la référence 65%.
    const cardiacPace = calcCardiacPaceFromAggregate(300, 150, 190, 50); // allure brute 5:00/km
    expect(cardiacPace).not.toBeNull();
    expect(cardiacPace!).toBeLessThan(300);
  });

  it('effort en dessous de la référence → allure cardiaque plus lente que l\'allure brute', () => {
    // HR=120, FCmax=190, FCrepos=50 → HRR=50%, en dessous de la référence 65%.
    const cardiacPace = calcCardiacPaceFromAggregate(300, 120, 190, 50);
    expect(cardiacPace).not.toBeNull();
    expect(cardiacPace!).toBeGreaterThan(300);
  });

  it('retourne null hors de la plage HRR valide 20–99%', () => {
    expect(calcCardiacPaceFromAggregate(300, 60, 190, 50)).toBeNull(); // HRR=7%, trop bas
    expect(calcCardiacPaceFromAggregate(300, 189, 190, 50)).toBeNull(); // HRR=99.3%, trop haut
  });
});

describe('calcEfficiencyPaceFromAggregate', () => {
  it('une FC PLUS BASSE à allure égale donne une MEILLEURE (plus rapide) allure d\'efficacité — sens opposé à calcCardiacPaceFromAggregate', () => {
    // Bug réel signalé par Greg (2026-08-27) : en réutilisant calcCardiacPaceFromAggregate pour le
    // suivi d'efficacité, une FC plus basse à allure quasi identique donnait une "efficacité" PIRE.
    // FCmax=190, FCrepos=50. HR=120 (50% HRR) doit donner une meilleure allure d'efficacité que HR=150 (71.4% HRR).
    const lowerHR = calcEfficiencyPaceFromAggregate(300, 120, 190, 50);
    const higherHR = calcEfficiencyPaceFromAggregate(300, 150, 190, 50);
    expect(lowerHR).not.toBeNull();
    expect(higherHR).not.toBeNull();
    expect(lowerHR!).toBeLessThan(higherHR!); // FC plus basse → allure d'efficacité plus rapide (meilleure)
  });

  it('une allure PLUS RAPIDE à FC égale donne une MEILLEURE allure d\'efficacité', () => {
    const fasterPace = calcEfficiencyPaceFromAggregate(280, 150, 190, 50);
    const slowerPace = calcEfficiencyPaceFromAggregate(320, 150, 190, 50);
    expect(fasterPace!).toBeLessThan(slowerPace!);
  });

  it('retourne null hors de la plage HRR valide 20–99%', () => {
    expect(calcEfficiencyPaceFromAggregate(300, 60, 190, 50)).toBeNull(); // HRR=7%, trop bas
    expect(calcEfficiencyPaceFromAggregate(300, 189, 190, 50)).toBeNull(); // HRR=99.3%, trop haut
  });
});

describe('computeEfficiencyTrend', () => {
  it('reproduit le cas réel signalé par Greg : FC plus basse à allure quasi identique = tendance "down" (amélioration), pas "up"', () => {
    // Chiffres exacts du signalement : 19/05 (FC 168, 7:39/km=459s) puis 09/06 (FC 165, 7:38/km=458s).
    // FCmax=195, FCrepos=52 (profil utilisateur). Avec l'ancienne formule (bug), 09/06 ressortait pire.
    const items = [
      { date: '2026-05-19', avgPace: 459, avgHR: 168 },
      { date: '2026-06-09', avgPace: 458, avgHR: 165 },
    ];
    const result = computeEfficiencyTrend(items, 'running', 195, 52);
    expect(result.get(0)!.trend).toBeNull(); // 19/05 = premier chronologiquement
    expect(result.get(1)!.trend).toBe('down'); // 09/06 : FC plus basse, allure quasi égale → amélioration
    expect(result.get(1)!.pace!).toBeLessThan(result.get(0)!.pace!);
  });

  it('calcule la tendance dans l\'ORDRE CHRONOLOGIQUE, pas l\'ordre du tableau d\'entrée (ex. trié par temps)', () => {
    // Volontairement dans le désordre chronologique pour vérifier que le tri interne fonctionne :
    // le passage le plus récent (index 0, mars) est meilleur (FC plus basse à allure égale) que le plus ancien (index 1, janvier).
    const items = [
      { date: '2026-03-01', avgPace: 300, avgHR: 120 }, // le plus récent, FC plus basse = meilleur
      { date: '2026-01-01', avgPace: 300, avgHR: 150 }, // le plus ancien
    ];
    const result = computeEfficiencyTrend(items, 'running', 190, 50);
    expect(result.get(1)!.trend).toBeNull(); // janvier = premier chronologiquement, pas de comparaison
    expect(result.get(0)!.trend).toBe('down'); // mars vs janvier = allure d'efficacité plus rapide = amélioration
  });

  it('retourne une map vide pour une activité non-course (allure d\'efficacité course uniquement)', () => {
    const items = [{ date: '2026-01-01', avgPace: 300, avgHR: 150 }, { date: '2026-02-01', avgPace: 290, avgHR: 150 }];
    expect(computeEfficiencyTrend(items, 'cycling', 190, 50).size).toBe(0);
  });

  it('pas de tendance si le passage précédent n\'a pas de FC exploitable', () => {
    const items = [
      { date: '2026-01-01', avgPace: 300, avgHR: null }, // pas de FC
      { date: '2026-02-01', avgPace: 300, avgHR: 150 },
    ];
    const result = computeEfficiencyTrend(items, 'running', 190, 50);
    expect(result.get(0)!.pace).toBeNull();
    expect(result.get(1)!.trend).toBeNull(); // rien à comparer, le seul précédent est non calculable
  });

  it('utilise le FCmax/FCrepos figés de chaque item plutôt que les réglages actuels du profil — les anciens chiffres ne doivent pas bouger si le profil change', () => {
    // Demande de Greg (2026-08-27) : sa FC de repos change de semaine en semaine ; une "Efficacité"
    // déjà calculée ne doit pas se remettre à bouger si le profil est modifié plus tard. On simule ce
    // cas en passant un item avec sa PROPRE FCrepos figée (52, celle en vigueur à l'époque) alors que
    // le profil ACTUEL (fallback) a changé (48) — le résultat doit suivre la valeur figée, pas l'actuelle.
    const itemWithFrozenFc = [{ date: '2026-06-09', avgPace: 458, avgHR: 165, fcMax: 195, fcRest: 52 }];
    const withFrozen = computeEfficiencyTrend(itemWithFrozenFc, 'running', 195, 48 /* profil actuel, différent */);
    const withoutFrozen = computeEfficiencyTrend(
      [{ date: '2026-06-09', avgPace: 458, avgHR: 165 }], 'running', 195, 52, // même valeur, mais via le fallback
    );
    expect(withFrozen.get(0)!.pace).toBeCloseTo(withoutFrozen.get(0)!.pace!, 5);

    // Le même item, mais interprété avec le profil ACTUEL (48) au lieu de sa FCrepos figée (52), donne
    // un résultat DIFFÉRENT — preuve que sans figeage, un changement de profil ferait bouger ce chiffre.
    const withCurrentProfileInstead = computeEfficiencyTrend(
      [{ date: '2026-06-09', avgPace: 458, avgHR: 165 }], 'running', 195, 48,
    );
    expect(withCurrentProfileInstead.get(0)!.pace).not.toBeCloseTo(withFrozen.get(0)!.pace!, 5);
  });
});
