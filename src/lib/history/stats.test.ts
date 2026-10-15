import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Fact, HistoryFacts } from './facts';
import {
  currentStreak,
  personalRecords,
  streakProgress,
  weekSummary,
  weeksMeetingGoal,
} from './stats';

const WEEKDAYS = [1, 2, 3, 4, 5];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
// Local time, so the tests mean the same thing in any timezone.
const at = (month: number, day: number, hour = 12, minute = 0) =>
  new Date(2026, month, day, hour, minute).getTime();
// Thursday 15 October 2026.
const now = at(9, 15, 14, 30);
const since = at(8, 1, 0);

const fact = (time: number, patch: Partial<Fact> = {}): Fact => ({
  id: `acme/api#${time}`,
  url: `https://github.com/acme/api/pull/${time}`,
  title: `PR ${time}`,
  repository: 'acme/api',
  at: time,
  createdAt: null,
  author: 'me',
  authorIsBot: false,
  ...patch,
});

function facts(times: number[], trackingSince = since): HistoryFacts {
  const shipped = times.map((time) => fact(time)).sort((a, b) => a.at - b.at);
  return {
    trackingSince,
    authoredMerges: shipped,
    mergesByYou: [],
    approvals: [],
    shipped,
    events: [],
  };
}

describe('currentStreak', () => {
  it('counts consecutive streak days that each shipped something', () => {
    // Mon 12, Tue 13, Wed 14 and Thu 15 (today).
    expect(
      currentStreak(facts([at(9, 12), at(9, 13), at(9, 14), at(9, 15, 9)]), WEEKDAYS, now),
    ).toBe(4);
  });

  it('breaks on a streak day with nothing shipped', () => {
    expect(currentStreak(facts([at(9, 12), at(9, 14), at(9, 15, 9)]), WEEKDAYS, now)).toBe(2);
  });

  it('is not broken by today when nothing has shipped yet', () => {
    expect(currentStreak(facts([at(9, 13), at(9, 14)]), WEEKDAYS, now)).toBe(2);
    expect(currentStreak(facts([]), WEEKDAYS, now)).toBe(0);
  });

  it('skips days that are not streak days, whether or not they shipped', () => {
    // Fri 9 and Mon 12 with a quiet weekend between; a Saturday merge adds nothing.
    const week = facts([at(9, 9), at(9, 10, 8), at(9, 12), at(9, 13), at(9, 14), at(9, 15, 9)]);
    expect(currentStreak(week, WEEKDAYS, now)).toBe(5);
    expect(currentStreak(facts([at(9, 9), at(9, 12)]), WEEKDAYS, at(9, 12, 20))).toBe(2);
  });

  it('skips a non-streak day in the middle without extending the streak', () => {
    // Streak on Mon, Wed, Fri only: Tuesday is ignored in both directions.
    const mwf = [1, 3, 5];
    const run = facts([at(9, 9), at(9, 12), at(9, 14)]);
    expect(currentStreak(run, mwf, now)).toBe(3);
    expect(currentStreak(facts([at(9, 9), at(9, 14)]), mwf, now)).toBe(1);
  });

  it('runs through the previous streak day when today is not a streak day', () => {
    const saturday = at(9, 17, 10);
    expect(currentStreak(facts([at(9, 15), at(9, 16)]), WEEKDAYS, saturday)).toBe(2);
    expect(currentStreak(facts([at(9, 15)]), WEEKDAYS, saturday)).toBe(0);
  });

  it('never looks before the tracking start', () => {
    const tracked = facts([at(9, 14), at(9, 15, 9)], at(9, 14, 0));
    expect(currentStreak(tracked, EVERY_DAY, now)).toBe(2);
  });

  it('counts the first tracked day on its own', () => {
    expect(currentStreak(facts([at(9, 15, 9)], at(9, 15, 0)), WEEKDAYS, now)).toBe(1);
    expect(currentStreak(facts([], at(9, 15, 0)), WEEKDAYS, now)).toBe(0);
  });

  it('keeps counting through a streak that began a month ago', () => {
    const days = Array.from({ length: 31 }, (_, i) => at(8, 16 + i, 10));
    expect(currentStreak(facts(days), EVERY_DAY, now)).toBe(30);
  });
});

describe('streakProgress', () => {
  it('lists when each streak length was first reached', () => {
    const progress = streakProgress(
      facts([at(9, 12, 9), at(9, 12, 15), at(9, 13, 10, 30), at(9, 14, 8, 15)]),
      WEEKDAYS,
      now,
    );
    expect(progress).toEqual([at(9, 12, 9), at(9, 13, 10, 30), at(9, 14, 8, 15)]);
  });

  it('only records a length the first time any streak reaches it', () => {
    // A two-day streak, a gap, then a three-day streak: lengths 1 and 2 keep their first times.
    const progress = streakProgress(
      facts([at(8, 7), at(8, 8), at(8, 14), at(8, 15), at(8, 16)]),
      WEEKDAYS,
      now,
    );
    expect(progress).toEqual([at(8, 7), at(8, 8), at(8, 16)]);
  });

  it('is empty without shipped PRs and its length is the longest streak', () => {
    expect(streakProgress(facts([]), WEEKDAYS, now)).toEqual([]);
    const longest = streakProgress(
      facts([at(9, 5), at(9, 6), at(9, 7), at(9, 8), at(9, 12)]),
      WEEKDAYS,
      now,
    );
    expect(longest).toHaveLength(4);
  });

  it('bridges days that are not streak days', () => {
    const progress = streakProgress(facts([at(9, 9), at(9, 12)]), WEEKDAYS, now);
    expect(progress).toEqual([at(9, 9), at(9, 12)]);
    expect(streakProgress(facts([at(9, 9), at(9, 10), at(9, 13)]), WEEKDAYS, now)).toHaveLength(1);
  });

  it('starts on the tracking day, not before', () => {
    expect(streakProgress(facts([at(9, 15, 9)], at(9, 15, 0)), WEEKDAYS, now)).toEqual([
      at(9, 15, 9),
    ]);
  });

  it('does not use days after today', () => {
    expect(streakProgress(facts([at(9, 15, 9), at(9, 16)]), WEEKDAYS, now)).toEqual([at(9, 15, 9)]);
  });
});

describe('weeksMeetingGoal', () => {
  it('returns when each Monday to Sunday week first reached the goal', () => {
    const times = [
      // Week of 5 October: three PRs, the third completes a goal of 3.
      at(9, 5),
      at(9, 7),
      at(9, 11, 18),
      // Week of 12 October: two PRs, short of the goal.
      at(9, 12),
      at(9, 13),
      // Week of 28 September: four PRs, the third on Wednesday.
      at(8, 28),
      at(8, 29),
      at(8, 30, 16),
      at(9, 4, 9),
    ];
    expect(weeksMeetingGoal(facts(times), 3, now)).toEqual([at(8, 30, 16), at(9, 11, 18)]);
  });

  it('keeps Sunday with the week that started the Monday before', () => {
    // Sunday 11 October belongs to the week of 5 October.
    const week = [at(9, 5), at(9, 6), at(9, 11, 23, 30), at(9, 12, 0, 30)];
    expect(weeksMeetingGoal(facts(week), 3, now)).toEqual([at(9, 11, 23, 30)]);
    expect(weeksMeetingGoal(facts(week), 4, now)).toEqual([]);
  });

  it('is empty when nothing reached the goal', () => {
    expect(weeksMeetingGoal(facts([at(9, 12)]), 2, now)).toEqual([]);
    expect(weeksMeetingGoal(facts([]), 1, now)).toEqual([]);
  });
});

describe('personalRecords', () => {
  const times = [
    at(9, 5, 9),
    at(9, 5, 10),
    at(9, 6, 9),
    at(9, 8, 9),
    at(9, 8, 10),
    at(9, 8, 11),
    at(9, 13, 9),
    at(9, 13, 10),
    at(9, 13, 11),
  ];

  it('finds the busiest day and week, keeping the earlier of a tie', () => {
    const records = personalRecords(facts(times), WEEKDAYS, now);
    expect(records.day).toEqual({ count: 3, start: at(9, 8, 0) });
    expect(records.week).toEqual({ count: 6, start: at(9, 5, 0) });
  });

  it('reports the longest streak', () => {
    expect(personalRecords(facts(times), WEEKDAYS, now).streak).toBe(2);
    expect(
      personalRecords(facts([at(9, 5), at(9, 6), at(9, 7), at(9, 13)]), WEEKDAYS, now).streak,
    ).toBe(3);
  });

  it('picks the authored merge that landed fastest and skips unknown creation times', () => {
    const slow = fact(at(9, 6, 12), { id: 'acme/api#1', createdAt: at(9, 5, 12) });
    const quick = fact(at(9, 7, 12), { id: 'acme/api#2', createdAt: at(9, 7, 11, 54) });
    const unknown = fact(at(9, 8, 12), { id: 'acme/api#3', createdAt: null });
    const both = { ...facts([]), authoredMerges: [slow, quick, unknown] };
    const fastest = personalRecords(both, WEEKDAYS, now).fastest;
    expect(fastest?.fact.id).toBe('acme/api#2');
    expect(fastest?.duration).toBe(6 * 60_000);
    expect(
      personalRecords({ ...both, authoredMerges: [unknown] }, WEEKDAYS, now).fastest,
    ).toBeNull();
  });

  it('ignores merges that predate their own creation time', () => {
    const odd = fact(at(9, 6, 12), { createdAt: at(9, 6, 13) });
    expect(
      personalRecords({ ...facts([]), authoredMerges: [odd] }, WEEKDAYS, now).fastest,
    ).toBeNull();
  });

  it('is empty without history', () => {
    expect(personalRecords(facts([]), WEEKDAYS, now)).toEqual({
      day: null,
      week: null,
      streak: 0,
      fastest: null,
    });
  });
});

describe('weekSummary', () => {
  it('summarizes this week against the goal', () => {
    const week = weekSummary(
      facts([at(9, 7), at(9, 12), at(9, 12, 15), at(9, 14), at(9, 15, 9)]),
      5,
      WEEKDAYS,
      now,
    );
    expect(week.days.map((day) => day.shipped)).toEqual([2, 0, 1, 1, 0, 0, 0]);
    expect(week).toMatchObject({ shipped: 4, goal: 5, remaining: 1, lastWeek: 1, firstRun: false });
    // Thursday and Wednesday shipped; Tuesday did not.
    expect(week.streak).toBe(2);
  });

  it('reports a reached goal and omits last week when it was not tracked', () => {
    const week = weekSummary(facts([at(9, 12), at(9, 13)], at(9, 12, 0)), 2, WEEKDAYS, now);
    expect(week).toMatchObject({ remaining: 0, lastWeek: null, firstRun: false });
    expect(
      weekSummary(facts([at(9, 12), at(9, 13)], at(9, 12, 0)), 1, WEEKDAYS, now).remaining,
    ).toBe(0);
  });

  it('is a first run when tracking began today', () => {
    const week = weekSummary(facts([at(9, 15, 9)], at(9, 15, 0)), 10, WEEKDAYS, now);
    expect(week).toMatchObject({
      firstRun: true,
      shipped: 1,
      remaining: 9,
      streak: 1,
      lastWeek: null,
    });
    expect(week.days.map((day) => day.tracked)).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe('daylight saving time', () => {
  const previous = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });

  it('runs in a timezone with daylight saving', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(300);
    expect(new Date(2026, 6, 15).getTimezoneOffset()).toBe(240);
  });

  it('keeps a streak going across the spring-forward 23-hour day', () => {
    // Sat 7, Sun 8 (clocks jump at 2 AM) and Mon 9 March.
    const spring = facts(
      [at(2, 7, 23, 30), at(2, 8, 0, 30), at(2, 8, 23, 30), at(2, 9, 0, 30)],
      at(2, 1, 0),
    );
    const today = at(2, 9, 12);
    expect(currentStreak(spring, EVERY_DAY, today)).toBe(3);
    expect(streakProgress(spring, EVERY_DAY, today)).toEqual([
      at(2, 7, 23, 30),
      at(2, 8, 0, 30),
      at(2, 9, 0, 30),
    ]);
  });

  it('keeps a streak going across the fall-back 25-hour day', () => {
    // Sat 31 October, Sun 1 November (clocks go back) and Mon 2 November.
    const fall = facts(
      [at(9, 31, 23, 30), at(10, 1, 0, 30), at(10, 1, 23, 30), at(10, 2, 0, 30)],
      at(9, 25, 0),
    );
    const today = at(10, 2, 12);
    expect(currentStreak(fall, EVERY_DAY, today)).toBe(3);
    expect(streakProgress(fall, EVERY_DAY, today)).toHaveLength(3);
  });

  it('keeps a Monday to Sunday week whole when it contains a clock change', () => {
    // Monday 2 to Sunday 8 March: Sunday has 23 hours, and 23:30 on Sunday is still that week.
    const week = [at(2, 2, 0, 30), at(2, 4), at(2, 8, 23, 30)];
    const today = at(2, 8, 23, 45);
    expect(weeksMeetingGoal(facts(week, at(2, 1, 0)), 3, today)).toEqual([at(2, 8, 23, 30)]);
    const summary = weekSummary(facts(week, at(2, 1, 0)), 3, WEEKDAYS, today);
    expect(summary.days.map((day) => day.shipped)).toEqual([1, 0, 1, 0, 0, 0, 1]);
    expect(summary.shipped).toBe(3);
  });

  it('keeps the week that holds the fall-back day to seven days', () => {
    const today = at(10, 1, 22);
    const summary = weekSummary(
      facts([at(9, 26, 9), at(10, 1, 12)], at(9, 1, 0)),
      2,
      WEEKDAYS,
      today,
    );
    expect(summary.days.map((day) => day.shipped)).toEqual([1, 0, 0, 0, 0, 0, 1]);
  });
});
