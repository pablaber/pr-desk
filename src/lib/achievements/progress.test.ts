import { expect, it } from 'vitest';
import type { HistoryFacts } from '../history/facts';
import { count, distinct, events } from './progress';

const facts = {
  trackingSince: 0,
  authoredMerges: [],
  mergesByYou: [],
  approvals: [],
  shipped: [],
  events: [
    { kind: 'branch-updated', at: 30 },
    { kind: 'stale-closed', at: 20 },
    { kind: 'branch-updated', at: 10 },
  ],
} satisfies HistoryFacts;
const context = { goal: 1, streakDays: [1], now: 100 };

it('counts each selected item at its time, in order', () => {
  expect(count((f) => f.events)(facts, context)).toEqual([10, 20, 30]);
  expect(count(events('branch-updated'))(facts, context)).toEqual([10, 30]);
});

it('counts each key once, at the first time it appeared', () => {
  const repositories = [
    { at: 40, repository: 'a' },
    { at: 10, repository: 'b' },
    { at: 30, repository: 'a' },
    { at: 50, repository: 'c' },
  ];
  expect(
    distinct(
      () => repositories,
      (item) => item.repository,
    )(facts, context),
  ).toEqual([10, 30, 50]);
});
