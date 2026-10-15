import { expect, it } from 'vitest';
import { historyEntry } from '../../test/fixtures';
import type { AccountHistory } from '../history/types';
import { hasUnseenAchievements, recordAchievements } from './record';

const trackingSince = new Date(2026, 9, 12).getTime();
const now = new Date(2026, 9, 15, 12).getTime();
const mergedAt = new Date(2026, 9, 13, 9).getTime();
const preferences = {
  knownBots: [],
  ignoreRules: [],
  settings: { weeklyGoal: 1, streakDays: [1, 2, 3, 4, 5] },
};

function account(overrides: Partial<AccountHistory> = {}): AccountHistory {
  return {
    trackingSince,
    syncedThrough: null,
    entries: { 'acme/api#1': historyEntry({ mergedAt: new Date(mergedAt).toISOString() }) },
    events: [],
    achievements: {},
    achievementsSeenAt: 0,
    ...overrides,
  };
}

it('folds first sightings and new levels into the account, using the weekly goal', () => {
  const { account: next, unlocked } = recordAchievements(account(), 'me', preferences, now);
  expect(unlocked.map((unlock) => unlock.id)).toEqual(['off-the-line', 'goal-getter']);
  expect(next.achievements['goal-getter']).toEqual({
    firstSeenAt: now,
    levels: [{ threshold: 1, at: mergedAt, recordedAt: now }],
  });
  expect(Object.keys(next.achievements)).toHaveLength(12);
  const again = recordAchievements(next, 'me', preferences, now + 1);
  expect(again.account).toBe(next);
  expect(again.unlocked).toEqual([]);
  const higherGoal = { ...preferences, settings: { ...preferences.settings, weeklyGoal: 2 } };
  expect(recordAchievements(account(), 'me', higherGoal, now).unlocked).toHaveLength(1);
});

it('has unseen achievements while a catalog level was recorded after the seen marker', () => {
  const level = { threshold: 1, at: 1, recordedAt: 50 };
  const stored = { 'off-the-line': { firstSeenAt: 1, levels: [level] } };
  expect(hasUnseenAchievements(account())).toBe(false);
  expect(hasUnseenAchievements(account({ achievements: stored }))).toBe(true);
  expect(hasUnseenAchievements(account({ achievements: stored, achievementsSeenAt: 50 }))).toBe(
    false,
  );
  // A retired id cannot be shown, so it never counts as news.
  const retired = { retired: { firstSeenAt: 1, levels: [level] } };
  expect(hasUnseenAchievements(account({ achievements: retired }))).toBe(false);
});
