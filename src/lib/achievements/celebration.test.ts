import { describe, expect, it } from 'vitest';
import { historyEntry } from '../../test/fixtures';
import type { AccountHistory } from '../history/types';
import { celebrationChips } from './celebration';
import type { Unlock } from './types';

// Thursday 15 October 2026, local time.
const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).getTime();
const now = at(15, 14);
const preferences = {
  knownBots: [],
  ignoreRules: [],
  settings: { weeklyGoal: 10, streakDays: [1, 2, 3, 4, 5] },
};

function account(mergeTimes: number[]): AccountHistory {
  return {
    trackingSince: new Date(2026, 9, 1).getTime(),
    syncedThrough: null,
    entries: Object.fromEntries(
      mergeTimes.map((time, index) => [
        `acme/api#${index}`,
        historyEntry({
          id: `acme/api#${index}`,
          number: index,
          mergedAt: new Date(time).toISOString(),
        }),
      ]),
    ),
    events: [],
    achievements: {},
    achievementsSeenAt: 0,
  };
}

const chips = (times: number[], unlocks: Unlock[] = [], settings = preferences) =>
  celebrationChips(account(times), 'me', settings, unlocks, now);
const texts = (...args: Parameters<typeof chips>) => chips(...args).map((chip) => chip.text);

const unlock = (id: string, title: string, threshold: number): Unlock => ({
  id,
  title,
  threshold,
});

describe('today chip', () => {
  it('counts the shipped PRs of today, this merge included, as an ordinal', () => {
    const today = (count: number) => Array.from({ length: count }, (_, i) => at(15, 8) + i);
    const ordinals = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(
      (count) => texts(today(count))[0],
    );
    expect(ordinals).toEqual([
      '1st today',
      '2nd today',
      '3rd today',
      '4th today',
      '11th today',
      '12th today',
      '13th today',
      '21st today',
      '22nd today',
      '23rd today',
      '101st today',
      '111th today',
    ]);
  });

  it('leaves out PRs shipped on other days', () => {
    expect(chips([at(14), at(15, 9)])[0]).toEqual({ kind: 'today', text: '1st today' });
  });
});

describe('streak chip', () => {
  it('shows the current streak', () => {
    expect(chips([at(13), at(14), at(15, 9)])[1]).toEqual({
      kind: 'streak',
      text: '3-day streak',
    });
  });

  it('is left out when the streak is 0', () => {
    // Nothing shipped today and yesterday was missed, so no streak runs.
    expect(chips([at(12)])).toEqual([]);
    // Today is not a streak day, and nothing shipped on the one before.
    const onlyMonday = { ...preferences, settings: { ...preferences.settings, streakDays: [1] } };
    expect(texts([at(15, 9)], [], onlyMonday)).toEqual(['1st today']);
  });
});

describe('unlock chips', () => {
  const shipped = [at(15, 9)];

  it('names single-tier achievements without a level', () => {
    expect(texts(shipped, [unlock('off-the-line', 'Off the line', 1)])).toEqual([
      '1st today',
      '1-day streak',
      'Unlocked: Off the line',
    ]);
  });

  it('adds the roman level of multi-tier achievements', () => {
    const unlocks = [unlock('on-a-roll', 'On a roll', 5), unlock('century', 'Century', 500)];
    expect(texts(shipped, unlocks).slice(2)).toEqual([
      'Unlocked: On a roll I',
      'Unlocked: Century II',
    ]);
    expect(texts(shipped, [unlock('on-a-roll', 'On a roll', 10)])[2]).toBe(
      'Unlocked: On a roll II',
    );
  });

  it('falls back to the plain title for an id or threshold the catalog no longer has', () => {
    expect(
      texts(shipped, [unlock('retired', 'Retired', 3), unlock('century', 'Century', 7)]).slice(2),
    ).toEqual(['Unlocked: Retired', 'Unlocked: Century']);
  });

  it('shows at most two and summarises the rest', () => {
    const unlocks = [
      unlock('off-the-line', 'Off the line', 1),
      unlock('goal-getter', 'Goal getter', 1),
      unlock('century', 'Century', 100),
      unlock('explorer', 'Explorer', 3),
    ];
    const result = chips(shipped, unlocks).filter((chip) => chip.kind === 'unlock');
    expect(result.map((chip) => chip.text)).toEqual([
      'Unlocked: Off the line',
      'Unlocked: Goal getter I',
      '+2 more',
    ]);
    expect(texts(shipped, unlocks.slice(0, 3)).slice(-1)).toEqual(['+1 more']);
    expect(texts(shipped, unlocks.slice(0, 2)).join()).not.toContain('more');
  });
});

it('shows no chips without a history', () => {
  expect(celebrationChips(null, 'me', preferences, [], now)).toEqual([]);
  expect(
    celebrationChips(null, 'me', preferences, [unlock('century', 'Century', 100)], now),
  ).toEqual([]);
});
