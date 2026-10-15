import { describe, expect, it } from 'vitest';
import { historyEntry } from '../../test/fixtures';
import { historyFacts } from '../history/facts';
import type { HistoryEntry, HistoryEvent } from '../history/types';
import { ACHIEVEMENTS } from './catalog';

// September 2026: the 1st is a Tuesday, and the 7th to the 11th are Monday to Friday.
const trackingSince = new Date(2026, 8, 1).getTime();
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 8, day, hour, minute).getTime();
const iso = (day: number, hour = 12, minute = 0) => new Date(at(day, hour, minute)).toISOString();
const context = { goal: 2, streakDays: [1, 2, 3, 4, 5], now: at(30) };

function facts(entries: HistoryEntry[], events: HistoryEvent[] = []) {
  return historyFacts(
    {
      trackingSince,
      syncedThrough: null,
      entries: Object.fromEntries(entries.map((entry) => [entry.id, entry])),
      events,
      achievements: {},
      achievementsSeenAt: 0,
    },
    'me',
    { knownBots: ['renovate'], ignoreRules: [] },
  );
}

const progress = (id: string, from: ReturnType<typeof facts>) =>
  ACHIEVEMENTS.find((achievement) => achievement.id === id)!.progress(from, context);

let number = 0;
const merged = (day: number, overrides: Partial<HistoryEntry> = {}) => {
  number++;
  return historyEntry({ id: `acme/api#${number}`, number, mergedAt: iso(day), ...overrides });
};
const approved = (created: string, approvedAt: string, overrides: Partial<HistoryEntry> = {}) => {
  number++;
  return historyEntry({
    id: `acme/api#${number}`,
    number,
    author: 'sam',
    createdAt: created,
    approvedAt,
    ...overrides,
  });
};

describe('ACHIEVEMENTS', () => {
  it('lists the twelve achievements with their tiers, all counting the past', () => {
    expect(
      ACHIEVEMENTS.map(({ id, tiers, appOnly = false, retroactive }) => ({
        id,
        tiers,
        appOnly,
        retroactive,
      })),
    ).toEqual(
      [
        ['off-the-line', [1]],
        ['on-a-roll', [5, 10, 20, 40]],
        ['goal-getter', [1, 4, 12, 26]],
        ['second-pair-of-eyes', [10, 50, 200, 500]],
        ['same-day-review', [5, 25, 100]],
        ['unblocker', [3, 10, 25]],
        ['century', [100, 500, 1000]],
        ['bot-wrangler', [10, 25, 100]],
        ['spring-cleaning', [5, 25, 100], true],
        ['clear-desk', [5, 25, 100], true],
        ['explorer', [3, 5, 10, 25]],
        ['up-to-date', [5, 25, 100], true],
      ].map(([id, tiers, appOnly = false]) => ({ id, tiers, appOnly, retroactive: true })),
    );
    expect(ACHIEVEMENTS.find((a) => a.id === 'clear-desk')?.appOnlyNote).toBe(
      'Only counts days PR Desk was open',
    );
  });

  it('keeps ids unique and tiers rising', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const { tiers } of ACHIEVEMENTS) {
      expect(tiers[0]).toBeGreaterThan(0);
      expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
      expect(new Set(tiers).size).toBe(tiers.length);
    }
  });

  it('counts shipped PRs once each for Off the line and Century', () => {
    const shipped = facts([
      merged(3),
      merged(2, { author: 'sam', mergedBy: 'me', approvedAt: iso(1) }),
      approved(iso(1), iso(4)),
    ]);
    expect(progress('off-the-line', shipped)).toEqual([at(1), at(3), at(4)]);
    expect(progress('century', shipped)).toEqual([at(1), at(3), at(4)]);
  });

  it('counts approvals of people’s PRs, not bots’', () => {
    const approvals = facts([
      approved(iso(1), iso(2)),
      approved(iso(1), iso(3), { authorIsApp: true, author: 'dependabot[bot]' }),
      approved(iso(1), iso(4), { author: 'renovate' }),
    ]);
    expect(progress('second-pair-of-eyes', approvals)).toEqual([at(2)]);
  });

  it('counts a same-day review by the local day it was opened, once its age is known', () => {
    const reviews = facts([
      approved(iso(2, 0, 5), iso(2, 23, 55)),
      approved(iso(2, 23, 55), iso(3, 0, 5)),
      approved('', iso(4)),
    ]);
    expect(progress('same-day-review', reviews)).toEqual([at(2, 23, 55)]);
  });

  it('counts an Unblocker approval once the PR had been open five days', () => {
    const reviews = facts([
      approved(iso(1), iso(6)),
      approved(iso(1, 12, 1), iso(6)),
      approved('', iso(8)),
    ]);
    expect(progress('unblocker', reviews)).toEqual([at(6)]);
  });

  it('counts bot PRs you merged for Bot wrangler', () => {
    const merges = facts([
      merged(2, { author: 'dependabot[bot]', authorIsApp: true, mergedBy: 'me' }),
      merged(3, { author: 'renovate', mergedBy: 'me' }),
      merged(4, { author: 'renovate', mergedBy: 'sam' }),
      merged(5, { author: 'sam', mergedBy: 'me' }),
    ]);
    expect(progress('bot-wrangler', merges)).toEqual([at(2), at(3)]);
  });

  it('counts each repository once, when you first shipped there', () => {
    const repositories = facts([
      merged(5, { repository: 'acme/web' }),
      merged(2, { repository: 'acme/api' }),
      merged(3, { repository: 'Acme/Web' }),
      merged(4, { repository: 'acme/api' }),
    ]);
    expect(progress('explorer', repositories)).toEqual([at(2), at(3)]);
  });

  it('counts in-app events for the app-only achievements', () => {
    const events = facts(
      [],
      [
        { kind: 'stale-closed', at: at(2) },
        { kind: 'attention-clear', at: at(3) },
        { kind: 'branch-updated', at: at(4) },
        { kind: 'stale-closed', at: at(5) },
      ],
    );
    expect(progress('spring-cleaning', events)).toEqual([at(2), at(5)]);
    expect(progress('clear-desk', events)).toEqual([at(3)]);
    expect(progress('up-to-date', events)).toEqual([at(4)]);
  });

  it('follows the streak days and the current weekly goal', () => {
    // Friday the 4th, then Monday to Wednesday: the weekend does not break the streak.
    const days = facts([
      merged(4),
      merged(7),
      merged(8),
      merged(8, { mergedAt: iso(8, 15) }),
      merged(9),
    ]);
    expect(progress('on-a-roll', days)).toEqual([at(4), at(7), at(8), at(9)]);
    // Two a week: the week of the 31st has one, the week of the 7th reaches two on the 8th.
    expect(progress('goal-getter', days)).toEqual([at(8)]);
  });
});
