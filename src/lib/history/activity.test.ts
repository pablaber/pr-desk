import { describe, expect, it } from 'vitest';
import {
  activityPeriod,
  axisTicks,
  clampPeriodStart,
  heatStep,
  periodStart,
  shiftPeriod,
} from './activity';
import type { Fact, HistoryFacts } from './facts';

// Thursday 15 October 2026.
const now = new Date(2026, 9, 15, 14, 30).getTime();
const local = (month: number, day: number, hour = 12) => new Date(2026, month, day, hour).getTime();
const fact = (at: number): Fact => ({
  id: String(at),
  repository: 'acme/api',
  at,
  createdAt: null,
  author: 'me',
  authorIsBot: false,
});

function facts(partial: Partial<HistoryFacts> = {}, trackingSince = local(8, 1, 0)): HistoryFacts {
  return {
    trackingSince,
    authoredMerges: [],
    mergesByYou: [],
    approvals: [],
    shipped: [],
    events: [],
    ...partial,
  };
}

describe('periods', () => {
  it('starts weeks on Monday and months on the first, in local time', () => {
    expect(periodStart('week', now)).toBe(local(9, 12, 0));
    expect(periodStart('week', local(9, 18, 23))).toBe(local(9, 12, 0));
    expect(periodStart('week', local(9, 12, 0))).toBe(local(9, 12, 0));
    expect(periodStart('month', now)).toBe(local(9, 1, 0));
  });

  it('shifts by whole weeks and months', () => {
    expect(shiftPeriod('week', local(9, 12, 0), -1)).toBe(local(9, 5, 0));
    expect(shiftPeriod('week', local(9, 26, 0), 1)).toBe(local(10, 2, 0));
    expect(shiftPeriod('month', local(0, 1, 0), -1)).toBe(new Date(2025, 11, 1).getTime());
    expect(shiftPeriod('month', local(9, 1, 0), 1)).toBe(local(10, 1, 0));
  });

  it('keeps a requested period between the tracking start and now', () => {
    const since = local(9, 1, 0);
    expect(clampPeriodStart('week', local(11, 1), since, now)).toBe(local(9, 12, 0));
    expect(clampPeriodStart('week', local(0, 1), since, now)).toBe(local(8, 28, 0));
    expect(clampPeriodStart('month', local(5, 10), since, now)).toBe(local(9, 1, 0));
    expect(clampPeriodStart('week', local(9, 7), since, now)).toBe(local(9, 5, 0));
  });
});

describe('activityPeriod', () => {
  it('builds seven days with the three counts and the shipped count, and marks the future', () => {
    const period = activityPeriod(
      facts({
        authoredMerges: [fact(local(9, 12)), fact(local(9, 13, 8)), fact(local(9, 13, 20))],
        mergesByYou: [fact(local(9, 13, 9))],
        approvals: [fact(local(9, 15, 9)), fact(local(9, 5))],
        shipped: [fact(local(9, 12)), fact(local(9, 13, 8)), fact(local(9, 15, 9))],
      }),
      'week',
      now,
      now,
    );
    expect(period.start).toBe(local(9, 12, 0));
    expect(period.end).toBe(local(9, 19, 0));
    expect(period.days).toHaveLength(7);
    expect(period.days.map((d) => [d.authored, d.mergedByYou, d.approved, d.shipped])).toEqual([
      [1, 0, 0, 1],
      [2, 1, 0, 1],
      [0, 0, 0, 0],
      [0, 0, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(period.days.map((d) => d.tracked)).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(period.days.map((d) => d.today)).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
    expect(period.totals).toEqual({ authored: 3, mergedByYou: 1, approved: 1, shipped: 3 });
    expect(period.lead).toBe(0);
  });

  it('puts a late-evening and an early-morning fact on different local days', () => {
    const period = activityPeriod(
      facts({ authoredMerges: [fact(local(9, 12, 23)), fact(local(9, 13, 0))] }),
      'week',
      now,
      now,
    );
    expect(period.days.slice(0, 3).map((d) => d.authored)).toEqual([1, 1, 0]);
  });

  it('lays out a month as a Monday-first calendar', () => {
    const period = activityPeriod(facts(), 'month', now, now);
    expect(period.days).toHaveLength(31);
    // 1 October 2026 is a Thursday.
    expect(period.lead).toBe(3);
    expect(period.days.filter((d) => d.tracked)).toHaveLength(15);
    expect(activityPeriod(facts(), 'month', local(8, 10), now).days).toHaveLength(30);
  });

  it('treats days before tracking began as having no data', () => {
    const period = activityPeriod(facts({}, local(9, 14, 0)), 'week', now, now);
    expect(period.days.map((d) => d.tracked)).toEqual([
      false,
      false,
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it('compares the current week with the same days of the last one', () => {
    const period = activityPeriod(
      facts({
        // This week Monday to Thursday: 3. Last week Monday to Thursday: 1; its Friday is not
        // yet reached this week.
        shipped: [
          fact(local(9, 12)),
          fact(local(9, 13)),
          fact(local(9, 15, 9)),
          fact(local(9, 5)),
          fact(local(9, 9)),
          fact(local(9, 9, 13)),
        ],
      }),
      'week',
      now,
      now,
    );
    expect(period.delta).toBe(2);
  });

  it('compares a past period with the whole period before it', () => {
    const lastWeek = local(9, 5, 0);
    const period = activityPeriod(
      facts({
        shipped: [fact(local(9, 6)), fact(local(9, 11)), fact(local(9, 12)), fact(local(8, 30))],
      }),
      'week',
      lastWeek,
      now,
    );
    expect(period.start).toBe(lastWeek);
    expect(period.totals.shipped).toBe(2);
    expect(period.delta).toBe(1);
  });

  it('compares the current month with the same days of the month before', () => {
    const period = activityPeriod(
      facts({
        shipped: [fact(local(9, 2)), fact(local(8, 3)), fact(local(8, 20)), fact(local(8, 29))],
      }),
      'month',
      now,
      now,
    );
    // September 1-15 holds one; the 20th and 29th are past the same point.
    expect(period.totals.shipped).toBe(1);
    expect(period.delta).toBe(0);
  });

  it('compares with the whole of a shorter previous month', () => {
    const end = local(2, 31, 12);
    const march = activityPeriod(
      facts(
        { shipped: [fact(local(2, 30)), fact(local(1, 3)), fact(local(1, 27))] },
        local(0, 1, 0),
      ),
      'month',
      end,
      end,
    );
    expect(march.delta).toBe(-1);
  });

  it('has no comparison when nothing before the period was tracked', () => {
    expect(activityPeriod(facts({}, local(9, 12, 0)), 'week', now, now).delta).toBeNull();
    expect(activityPeriod(facts({}, local(9, 14, 0)), 'week', now, now).delta).toBeNull();
    expect(activityPeriod(facts({}, local(9, 1, 0)), 'month', now, now).delta).toBeNull();
    expect(activityPeriod(facts({}, local(9, 7, 0)), 'week', now, now).delta).toBe(0);
  });

  it('only lets you move within the tracked range', () => {
    const current = activityPeriod(facts({}, local(9, 7, 0)), 'week', now, now);
    expect([current.canPrevious, current.canNext]).toEqual([true, false]);
    const first = activityPeriod(facts({}, local(9, 7, 0)), 'week', local(9, 5), now);
    expect(first.start).toBe(local(9, 5, 0));
    expect([first.canPrevious, first.canNext]).toEqual([false, true]);
    const only = activityPeriod(facts({}, local(9, 14, 0)), 'week', now, now);
    expect([only.canPrevious, only.canNext]).toEqual([false, false]);
    const month = activityPeriod(facts({}, local(8, 1, 0)), 'month', local(8, 10), now);
    expect([month.canPrevious, month.canNext]).toEqual([false, true]);
  });

  it('falls back to a period in range when the anchor is outside it', () => {
    expect(activityPeriod(facts(), 'week', local(11, 25), now).start).toBe(local(9, 12, 0));
    expect(activityPeriod(facts(), 'week', local(0, 1), now).start).toBe(local(7, 31, 0));
  });
});

describe('chart helpers', () => {
  it('picks round gridlines of at most four steps', () => {
    expect(axisTicks(0)).toEqual([0, 1, 2, 3]);
    expect(axisTicks(4)).toEqual([0, 1, 2, 3, 4]);
    expect(axisTicks(6)).toEqual([0, 2, 4, 6]);
    expect(axisTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(axisTicks(13)).toEqual([0, 5, 10, 15]);
  });

  it('colours a day by how many PRs shipped', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(heatStep)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});
