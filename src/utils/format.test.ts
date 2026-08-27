import { describe, it, expect } from 'vitest';
import { formatDuration, formatPace } from './format';

describe('formatDuration', () => {
  it('formate en m:ss sous une heure', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formate en h:mm:ss au-delà d\'une heure', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('arrondit le total AVANT la division entière — pas de "19:60"', () => {
    // Bug historique (voir memory/project_features) : Math.round appliqué séparément aux minutes
    // et aux secondes pouvait produire "19:60" au lieu de "20:00". 1199.6s arrondi à 1200s = 20:00.
    expect(formatDuration(1199.6)).toBe('20:00');
  });
});

describe('formatPace', () => {
  it('formate une allure en m:ss/km', () => {
    expect(formatPace(300)).toBe('5:00');
    expect(formatPace(330)).toBe('5:30');
  });

  it('retourne "--:--" pour une valeur invalide', () => {
    expect(formatPace(0)).toBe('--:--');
    expect(formatPace(NaN)).toBe('--:--');
    expect(formatPace(Infinity)).toBe('--:--');
  });

  it('arrondit le total AVANT la division entière — même bug que formatDuration', () => {
    expect(formatPace(359.6)).toBe('6:00');
  });
});
