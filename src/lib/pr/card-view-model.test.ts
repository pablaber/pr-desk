import { describe, expect, it } from 'vitest';
import { cardViewModel, stalenessLevel, type ChecksStatus } from './card-view-model';
import { classify } from './classify';
import { defaultState } from '../store/app-state';
import { pr } from '../../test/fixtures';
import type { PullRequest } from './types';
const now = Date.parse('2026-09-20T10:00:00Z');
const daysAgo = (days: number) => new Date(now - days * 86400000).toISOString();
describe('review badges', () => {
  it.each([
    ['APPROVED', { label: 'Approved', tone: 'approved' }],
    ['CHANGES_REQUESTED', { label: 'Changes requested', tone: 'changes-requested' }],
    ['REVIEW_REQUIRED', null],
    [null, null],
    ['UNKNOWN', null],
  ] as const)('represents review decision %s', (reviewDecision, expected) => {
    const item = classify(pr({ reviewDecision }), 'me', defaultState(), now)!;
    expect(cardViewModel(item, now).reviewBadge).toEqual(expected);
  });
  it('shows approval even when checks prevent merging', () => {
    const item = classify(
      pr({
        reviewDecision: 'APPROVED',
        checks: [{ name: 'CI', state: 'pending' }],
      }),
      'me',
      defaultState(),
      now,
    )!;
    expect(item.state).not.toBe('ready-to-merge');
    expect(cardViewModel(item, now).reviewBadge?.label).toBe('Approved');
  });
});
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

it.each([
  [{}, 'Checks failed', ''],
  [{ directReviewers: ['me'] }, 'Review requested', 'Checks failed'],
  [{ author: 'other' }, 'No action needed', 'Checks failed'],
])('shows check failures exactly once: %j', (overrides, primary, secondary) => {
  const item = classify(
    pr({ ...overrides, checks: [{ name: 'lint', state: 'failed' }] }),
    'me',
    defaultState(),
    now,
  )!;
  expect(cardViewModel(item, now)).toMatchObject({ primary, secondary });
});

describe('bot badge', () => {
  it('marks known bot PRs', () => {
    const item = classify(
      pr({ author: 'dependabot', authorIsBot: true, reasons: ['tracked-repository'] }),
      'me',
      defaultState(),
      now,
    )!;
    expect(cardViewModel(item, now).badges).toEqual([
      { kind: 'tracked-repository', label: 'Tracked repo' },
      { kind: 'bot', label: 'Bot' },
    ]);
  });
});
describe('source badges', () => {
  it.each([
    [['owned', 'tracked-repository'], ['Mine']],
    [
      ['owned', 'tracked-repository', 'watched'],
      ['Mine', 'Watching'],
    ],
    [
      ['tracked-repository', 'direct-review-request'],
      ['Tracked repo', 'Review request'],
    ],
  ] as const)('shows %j as %j', (reasons, badges) => {
    const item = classify(pr({ reasons: [...reasons] }), 'me', defaultState(), now)!;
    expect(cardViewModel(item, now).badges.map((b) => b.label)).toEqual(badges);
  });
});
describe('checks badge', () => {
  it.each([
    [[], null],
    [[{ name: 'CI', state: 'passing' }], 'passing'],
    [
      [
        { name: 'CI', state: 'passing' },
        { name: 'lint', state: 'passing' },
      ],
      'passing',
    ],
    [
      [
        { name: 'CI', state: 'passing' },
        { name: 'lint', state: 'pending' },
      ],
      'pending',
    ],
    [[{ name: 'CI', state: 'failed' }], 'failed'],
    [
      [
        { name: 'CI', state: 'pending' },
        { name: 'lint', state: 'failed' },
      ],
      'failed',
    ],
  ] as [PullRequest['checks'], ChecksStatus | null][])('shows for %j: %s', (checks, expected) => {
    const item = classify(pr({ checks }), 'me', defaultState(), now)!;
    expect(cardViewModel(item, now).checksBadge).toBe(expected);
  });
});
