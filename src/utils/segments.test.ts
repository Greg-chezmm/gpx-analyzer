import { describe, it, expect } from 'vitest';
import {
  geohashEncode, computeFingerprint, fingerprintOverlap, computeRouteGeometry,
  checkFullRouteCoverage, matchFullRoute, matchStoredSegment, matchStoredSegmentAll, toCachedAttempt,
} from './segments';
import { ORIGIN, walkPath, toTrackPoints, reversePath } from './testFixtures';

describe('geohashEncode', () => {
  it('donne le même hash pour des points très proches (même cellule ~150m)', () => {
    const a = geohashEncode(ORIGIN.lat, ORIGIN.lon);
    const b = geohashEncode(ORIGIN.lat + 0.00003, ORIGIN.lon + 0.00003); // ~4m
    expect(a).toBe(b);
  });

  it('donne un hash différent pour des points éloignés (>150m)', () => {
    const a = geohashEncode(ORIGIN.lat, ORIGIN.lon);
    const b = geohashEncode(ORIGIN.lat + 0.05, ORIGIN.lon); // ~5.5km
    expect(a).not.toBe(b);
  });
});

describe('computeFingerprint / fingerprintOverlap', () => {
  it('deux tracés identiques ont un recouvrement de 1', () => {
    const path = walkPath(ORIGIN, [{ bearingDeg: 30, distanceM: 3000 }]);
    const fp = computeFingerprint(path);
    expect(fingerprintOverlap(fp, fp)).toBeCloseTo(1, 5);
  });

  it('deux tracés géographiquement disjoints ont un recouvrement de 0', () => {
    const a = walkPath(ORIGIN, [{ bearingDeg: 0, distanceM: 2000 }]);
    const farAway = { lat: ORIGIN.lat + 2, lon: ORIGIN.lon + 2 }; // très loin, aucune cellule commune
    const b = walkPath(farAway, [{ bearingDeg: 0, distanceM: 2000 }]);
    expect(fingerprintOverlap(computeFingerprint(a), computeFingerprint(b))).toBe(0);
  });

  it('un sous-tracé a un recouvrement de 1 avec le tracé complet dont il est extrait', () => {
    const full = walkPath(ORIGIN, [{ bearingDeg: 45, distanceM: 4000 }]);
    const sub = full.slice(0, 50); // premier tiers
    expect(fingerprintOverlap(computeFingerprint(sub), computeFingerprint(full))).toBeCloseTo(1, 5);
  });
});

describe('computeRouteGeometry', () => {
  it('produit une distFromStart strictement croissante, espacée d\'environ 25m', () => {
    const path = walkPath(ORIGIN, [{ bearingDeg: 10, distanceM: 2000 }], 10);
    const geo = computeRouteGeometry(path);
    expect(geo.length).toBeGreaterThan(50);
    for (let i = 1; i < geo.length; i++) {
      const gap = geo[i].distFromStart - geo[i - 1].distFromStart;
      expect(gap).toBeGreaterThanOrEqual(25);
      expect(gap).toBeLessThan(35); // marge : le pas exact dépend de l'échantillonnage source (10m ici)
    }
  });
});

describe('checkFullRouteCoverage / matchFullRoute', () => {
  it('un tracé comparé à lui-même matche à ~100%', () => {
    const path = walkPath(ORIGIN, [{ bearingDeg: 60, distanceM: 5000 }]);
    const cov = checkFullRouteCoverage(path, path);
    expect(cov.matches).toBe(true);
    expect(cov.coverageCurrent).toBeGreaterThan(0.95);
    expect(cov.coverageCandidate).toBeGreaterThan(0.95);
  });

  it('un même trajet interrompu par un court détour (500m sur 18km) doit toujours matcher', () => {
    // Reproduit le cas réel calibré avec Greg (vélotaf) : ~97% de recouvrement, doit passer le seuil 90%.
    const current = walkPath(ORIGIN, [{ bearingDeg: 90, distanceM: 18000 }]);
    const withDetour = walkPath(ORIGIN, [
      { bearingDeg: 90, distanceM: 9000 },
      { bearingDeg: 0, distanceM: 250 },   // détour aller
      { bearingDeg: 180, distanceM: 250 }, // détour retour, reprend le même axe
      { bearingDeg: 90, distanceM: 9000 },
    ]);
    const cov = checkFullRouteCoverage(current, withDetour);
    expect(cov.matches).toBe(true);
    expect(cov.coverageCurrent).toBeGreaterThanOrEqual(0.9);
    expect(cov.coverageCandidate).toBeGreaterThanOrEqual(0.9);
  });

  it('un trajet qui diverge sur une portion significative (~40%) ne doit PAS matcher', () => {
    const current = walkPath(ORIGIN, [{ bearingDeg: 0, distanceM: 10000 }]);
    const divergent = walkPath(ORIGIN, [
      { bearingDeg: 0, distanceM: 6000 },
      { bearingDeg: 90, distanceM: 4000 }, // part dans une direction totalement différente
    ]);
    const cov = checkFullRouteCoverage(current, divergent);
    expect(cov.matches).toBe(false);
  });

  it('le même trajet parcouru en sens inverse ne doit PAS matcher (décision explicite : pas de comparaison miroir)', () => {
    const path = walkPath(ORIGIN, [{ bearingDeg: 45, distanceM: 4000 }]);
    const reversed = reversePath(path);
    const cov = checkFullRouteCoverage(path, reversed);
    expect(cov.matches).toBe(false);
  });

  it('un tracé en épingles (lacets) comparé à lui-même matche toujours à ~100% (non-régression du bug de fragmentation)', () => {
    // Simule une montée en lacets serrés : virages à ~170° tous les 300m — géométrie qui se recroise
    // près d'elle-même, cause historique de fragmentation en plusieurs corridors (voir NOTES.md).
    const legs = [];
    let bearing = 20;
    for (let i = 0; i < 10; i++) {
      legs.push({ bearingDeg: bearing, distanceM: 300 });
      bearing = (bearing + 170) % 360;
    }
    const path = walkPath(ORIGIN, legs);
    const cov = checkFullRouteCoverage(path, path);
    expect(cov.matches).toBe(true);
    expect(cov.coverageCurrent).toBeGreaterThan(0.9);
    expect(cov.coverageCandidate).toBeGreaterThan(0.9);
  });

  it('matchFullRoute retourne les stats du candidat sur toute son étendue quand ça matche', () => {
    const path = walkPath(ORIGIN, [{ bearingDeg: 15, distanceM: 3000 }]);
    const points = toTrackPoints(path, 3); // 3 m/s constant
    const result = matchFullRoute(
      { points, date: '2026-01-01', name: 'actuelle' },
      { points, date: '2026-01-02', name: 'passée' },
    );
    expect(result).not.toBeNull();
    expect(result!.distance).toBeCloseTo(3000, -2); // à ~100m près (rééchantillonnage)
    expect(result!.name).toBe('passée');
  });
});

describe('matchStoredSegment / matchStoredSegmentAll', () => {
  it('retrouve un segment défini comme une portion centrale d\'une activité plus longue', () => {
    const full = walkPath(ORIGIN, [{ bearingDeg: 80, distanceM: 5000 }]);
    // Segment de référence : portion entre 2000m et 2600m (600m, largement au-dessus du seuil minimal).
    const refStart = full.findIndex(p => p.distFromStart >= 2000);
    const refEnd = full.findIndex(p => p.distFromStart >= 2600);
    const refPoints = full.slice(refStart, refEnd + 1);
    const refDistance = refPoints[refPoints.length - 1].distFromStart - refPoints[0].distFromStart;

    const candidatePoints = toTrackPoints(full, 3);
    const match = matchStoredSegment(refPoints, refDistance, { points: candidatePoints, date: '2026-01-01', name: 'sortie' });
    expect(match).not.toBeNull();
    expect(match!.distance).toBeGreaterThan(refDistance * 0.85);
  });

  it('détecte plusieurs passages du même segment dans une seule activité (fractionné en côte)', () => {
    // Une "côte" simple : montée en ligne droite de 400m depuis ORIGIN.
    const hill = walkPath(ORIGIN, [{ bearingDeg: 0, distanceM: 400 }]);
    const hillDistance = 400;

    // Activité : monte la côte puis redescend par le même axe (repart donc d'ORIGIN à chaque montée),
    // répété 3 fois — cas réel signalé par Greg (6 montées de la même côte en une sortie). Les
    // redescentes (cap opposé, hors tolérance ±55°) ne doivent pas être confondues avec des montées.
    const legs = [];
    for (let rep = 0; rep < 3; rep++) {
      legs.push({ bearingDeg: 0, distanceM: 400 });   // montée
      legs.push({ bearingDeg: 180, distanceM: 400 }); // redescente
    }
    const activity = walkPath(ORIGIN, legs);

    const matches = matchStoredSegmentAll(hill, hillDistance, {
      points: toTrackPoints(activity, 3), date: '2026-01-01', name: 'fractionné en côte',
    });
    expect(matches.length).toBeGreaterThanOrEqual(3);

    // matchStoredSegmentAll trie déjà par startIndex (ordre chronologique dans l'activité) — le
    // numéro de passage affiché à Greg (toCachedAttempt) doit suivre cet ordre, pas l'ordre dans
    // lequel l'algorithme de masquage les a trouvés (qui priorise le meilleur cluster, pas le premier).
    const cached = matches.map((a, i) => toCachedAttempt(a, i + 1, matches.length));
    cached.forEach((c, i) => {
      expect(c.passNumber).toBe(i + 1);
      expect(c.totalPasses).toBe(matches.length);
    });
    // Chronologique : le startIndex de chaque passage doit être strictement croissant.
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].startIndex).toBeGreaterThan(matches[i - 1].startIndex);
    }
  });

  it("n'ajoute pas passNumber/totalPasses quand un seul passage est trouvé (pas de fractionné)", () => {
    const path = walkPath(ORIGIN, [{ bearingDeg: 0, distanceM: 600 }]);
    const matches = matchStoredSegmentAll(path.slice(0, 30), 580, {
      points: toTrackPoints(path, 3), date: '2026-01-01', name: 'sortie simple',
    });
    expect(matches.length).toBe(1);
    const cached = toCachedAttempt(matches[0], 1, matches.length);
    expect(cached.passNumber).toBeUndefined();
    expect(cached.totalPasses).toBeUndefined();
  });
});
