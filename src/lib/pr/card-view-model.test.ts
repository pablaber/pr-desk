import { describe, expect, it } from 'vitest';
import { cardViewModel, stalenessLevel } from './card-view-model';
import { classify } from './classify';
import { defaultState } from '../store/app-state';
import { pr } from '../../test/fixtures';
const now = Date.parse('2026-09-20T10:00:00Z');
const daysAgo = (days: number) => new Date(now - days * 86400000).toISOString();
describe('staleness', () => {
  it.each([
    [0, null],
    [7, null],
    [7.5, 'low'],
    [14, 'low'],
    [14.5, 'medium'],
    [28, 'medium'],
    [28.5, 'high'],
    [365, 'high'],
  ] as [number, string | null][])('is %s days old → %s', (days, level) =>
    expect(stalenessLevel(daysAgo(days), now)).toBe(level),
  );
  it('ignores updates in the future', () => expect(stalenessLevel(daysAgo(-30), now)).toBe(null));
  it('re-derives from the current updatedAt, not creation or sync time', () => {
    const view = (updatedAt: string) =>
      cardViewModel(classify(pr({ updatedAt }), 'me', defaultState(), now)!, now);
    expect(view(daysAgo(30)).staleness).toBe('high');
    expect(view(daysAgo(1)).staleness).toBe(null);
  });
});
