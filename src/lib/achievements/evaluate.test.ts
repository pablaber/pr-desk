import Flag from '@lucide/svelte/icons/flag';
import { describe, expect, it } from 'vitest';
import type { HistoryFacts } from '../history/facts';
import type { StoredAchievement } from '../history/types';
import { evaluateAchievements } from './evaluate';
import type { Achievement } from './types';

const facts: HistoryFacts = {
  trackingSince: 0,
  authoredMerges: [],
  mergesByYou: [],
  approvals: [],
  shipped: [],
  events: [],
};
const now = 10_000;
const context = { goal: 10, streakDays: [1, 2, 3, 4, 5], now };

// Progress that went up at 100, 200, 300…: the count reaches N at time N * 100.
function achievement(tiers: number[], reached: number, overrides: Partial<Achievement> = {}) {
  return {
    id: 'reviews',
    title: 'Reviews',
    description: 'Review things',
    icon: Flag,
    unit: 'PRs',
    tiers,
    retroactive: true,
    progress: () => Array.from({ length: reached }, (_, i) => (i + 1) * 100),
    ...overrides,
  } satisfies Achievement;
}

const evaluate = (catalog: Achievement[], stored: Record<string, StoredAchievement> = {}) =>
  evaluateAchievements(catalog, stored, facts, context);

const level = (threshold: number, recordedAt = 1) => ({
  threshold,
  at: threshold * 100,
  recordedAt,
});

describe('evaluateAchievements', () => {
  it('unlocks every tier the progress reached, dated when it was reached', () => {
    const result = evaluate([achievement([5, 10, 20], 12)]);
    expect(result.newlyUnlocked).toEqual([
      { id: 'reviews', title: 'Reviews', threshold: 5 },
      { id: 'reviews', title: 'Reviews', threshold: 10 },
    ]);
    expect(result.stored.reviews).toEqual({
      firstSeenAt: now,
      levels: [level(5, now), level(10, now)],
    });
    expect(result.changed).toBe(true);
    const [view] = result.views;
    expect(view).toMatchObject({ count: 12, level: 2, next: 20, completedAt: null, note: null });
    expect(view.pips).toEqual([
      { threshold: 5, unlocked: true, at: 500, fill: 1 },
      { threshold: 10, unlocked: true, at: 1000, fill: 1 },
      { threshold: 20, unlocked: false, at: null, fill: 0.2 },
    ]);
    expect(result).toMatchObject({ unlocked: 2, total: 3 });
  });

  it('records nothing when nothing new was reached', () => {
    const stored = { reviews: { firstSeenAt: 1, levels: [level(5)] } };
    const result = evaluate([achievement([5, 10], 7)], stored);
    expect(result.changed).toBe(false);
    expect(result.newlyUnlocked).toEqual([]);
    expect(result.stored).toEqual(stored);
  });

  it('shows the locked state with partial progress', () => {
    const [view] = evaluate([achievement([100, 500], 74)]).views;
    expect(view).toMatchObject({ level: 0, next: 100 });
    expect(view.pips.map((pip) => pip.fill)).toEqual([0.74, 0]);
  });

  it('completes on the date the top tier was reached', () => {
    const [view] = evaluate([achievement([1], 3)]).views;
    expect(view).toMatchObject({ level: 1, next: null, completedAt: 100 });
  });

  it('never drops a stored level when the facts shrink', () => {
    const stored = { reviews: { firstSeenAt: 1, levels: [level(5), level(10)] } };
    const result = evaluate([achievement([5, 10, 20], 3)], stored);
    expect(result.changed).toBe(false);
    const [view] = result.views;
    expect(view).toMatchObject({ count: 3, level: 2, next: 20 });
    expect(view.pips.map((pip) => pip.at)).toEqual([500, 1000, null]);
    expect(view.pips[2].fill).toBe(0);
  });

  it('carries the app-only note, with an entry’s own wording first', () => {
    const plain = evaluate([achievement([5], 0, { appOnly: true })]).views[0];
    expect(plain.note).toBe('Only counts what you do in PR Desk');
    const own = evaluate([
      achievement([5], 0, { appOnly: true, appOnlyNote: 'Only counts days PR Desk was open' }),
    ]).views[0];
    expect(own.note).toBe('Only counts days PR Desk was open');
  });

  describe('after the tiers change', () => {
    it('unlocks lower thresholds, dated when they were reached', () => {
      const stored = { reviews: { firstSeenAt: 1, levels: [level(10)] } };
      const result = evaluate([achievement([3, 5, 10, 50], 12)], stored);
      expect(result.newlyUnlocked.map((unlock) => unlock.threshold)).toEqual([3, 5]);
      expect(result.stored.reviews.levels).toEqual([level(3, now), level(5, now), level(10)]);
      const [view] = result.views;
      expect(view).toMatchObject({ level: 3, next: 50 });
      expect(view.pips.map((pip) => pip.at)).toEqual([300, 500, 1000, null]);
    });

    it('adds a top tier above a completed achievement', () => {
      const stored = { reviews: { firstSeenAt: 1, levels: [level(5), level(25)] } };
      const before = evaluate([achievement([5, 25], 30)], stored);
      expect(before.views[0]).toMatchObject({ next: null, completedAt: 2500 });
      const after = evaluate([achievement([5, 25, 100], 30)], stored);
      expect(after.changed).toBe(false);
      expect(after.views[0]).toMatchObject({ level: 2, next: 100, completedAt: null });
      expect(evaluate([achievement([5, 25, 100], 100)], stored).newlyUnlocked).toEqual([
        { id: 'reviews', title: 'Reviews', threshold: 100 },
      ]);
    });

    it('fills an inserted middle tier the progress already passed', () => {
      const stored = { reviews: { firstSeenAt: 1, levels: [level(10), level(50)] } };
      const result = evaluate([achievement([10, 25, 50, 200], 60)], stored);
      expect(result.newlyUnlocked.map((unlock) => unlock.threshold)).toEqual([25]);
      expect(result.views[0]).toMatchObject({ level: 3, next: 200 });
      expect(result.views[0].pips.map((pip) => pip.at)).toEqual([1000, 2500, 5000, null]);
    });

    it('keeps the level when a threshold is raised past the progress', () => {
      const stored = { reviews: { firstSeenAt: 1, levels: [level(5), level(10)] } };
      const raised = [achievement([5, 15, 20], 12)];
      const result = evaluate(raised, stored);
      expect(result.changed).toBe(false);
      expect(result.views[0]).toMatchObject({ count: 12, level: 2, next: 20 });
      // The level that was reached under the old threshold keeps its date.
      expect(result.views[0].pips.map((pip) => pip.at)).toEqual([500, 1000, null]);
      // Reaching the raised threshold is not a new level: it was already counted.
      expect(evaluate([achievement([5, 15, 20], 15)], stored).newlyUnlocked).toEqual([]);
      const top = evaluate([achievement([5, 15, 20], 20)], stored);
      expect(top.newlyUnlocked.map((unlock) => unlock.threshold)).toEqual([20]);
      expect(top.views[0]).toMatchObject({ level: 3, next: null, completedAt: 2000 });
    });

    it('ignores a retired id for display but keeps it in the file', () => {
      const retired = { firstSeenAt: 1, levels: [level(5)] };
      const result = evaluate([achievement([5], 0)], { retired });
      expect(result.views.map((view) => view.achievement.id)).toEqual(['reviews']);
      expect(result.stored.retired).toBe(retired);
      expect(result).toMatchObject({ unlocked: 0, total: 1 });
    });
  });

  describe('new achievements', () => {
    it('count only what happens after a non-retroactive one is first seen', () => {
      // Only the steps up to the time of evaluation have happened yet.
      const fresh = achievement([2, 4], 0, {
        retroactive: false,
        progress: (_, { now }) => [100, 500, 1200, 1300, 1400].filter((time) => time <= now),
      });
      const first = evaluateAchievements([fresh], {}, facts, { ...context, now: 1150 });
      expect(first.stored.reviews).toEqual({ firstSeenAt: 1150, levels: [] });
      expect(first.newlyUnlocked).toEqual([]);
      expect(first.views[0]).toMatchObject({ count: 0, level: 0 });
      expect(first.changed).toBe(true);
      const later = evaluateAchievements([fresh], first.stored, facts, { ...context, now: 1350 });
      expect(later.views[0]).toMatchObject({ count: 2, level: 1 });
      expect(later.stored.reviews).toEqual({
        firstSeenAt: 1150,
        levels: [{ threshold: 2, at: 1300, recordedAt: 1350 }],
      });
    });

    it('unlock with past dates when retroactive', () => {
      const stored = { other: { firstSeenAt: 1, levels: [] } };
      const result = evaluate([achievement([2, 4], 5)], stored);
      expect(result.stored.reviews).toEqual({
        firstSeenAt: now,
        levels: [
          { threshold: 2, at: 200, recordedAt: now },
          { threshold: 4, at: 400, recordedAt: now },
        ],
      });
      expect(result.stored.other).toBe(stored.other);
    });
  });
});
