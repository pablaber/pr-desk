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
  it.each([
    [
      'APPROVED',
      ['alice'],
      {
        label: 'Approved',
        tone: 'approved',
        names: { first: 'alice', more: 0 },
        title: 'Approved by alice',
      },
    ],
    [
      'APPROVED',
      ['alice', 'bob', 'carol'],
      {
        label: 'Approved',
        tone: 'approved',
        names: { first: 'alice', more: 2 },
        title: 'Approved by alice, bob, carol',
      },
    ],
    [
      null,
      ['alice'],
      {
        label: 'Approved',
        tone: 'approved',
        names: { first: 'alice', more: 0 },
        title: 'Approved by alice',
      },
    ],
    [
      'REVIEW_REQUIRED',
      ['alice'],
      {
        label: '1 approval',
        tone: 'partial',
        names: { first: 'alice', more: 0 },
        title: 'Approved by alice',
      },
    ],
    [
      'REVIEW_REQUIRED',
      ['alice', 'bob'],
      {
        label: '2 approvals',
        tone: 'partial',
        names: { first: 'alice', more: 1 },
        title: 'Approved by alice, bob',
      },
    ],
    [
      'CHANGES_REQUESTED',
      ['alice'],
      { label: 'Changes requested', tone: 'changes-requested', title: 'Approved by alice' },
    ],
  ] as const)(
    'names approvers when the decision is %s: %j',
    (reviewDecision, approvers, expected) => {
      const item = classify(
        pr({ reviewDecision, approvers: [...approvers] }),
        'me',
        defaultState(),
        now,
      )!;
      expect(cardViewModel(item, now).reviewBadge).toEqual(expected);
    },
  );
  it('shows plain Approved when GitHub cannot name the approver', () => {
    const item = classify(pr({ reviewDecision: 'APPROVED' }), 'me', defaultState(), now)!;
    const badge = cardViewModel(item, now).reviewBadge;
    expect(badge?.label).toBe('Approved');
    expect(badge?.names).toBeUndefined();
    expect(badge?.title).toBeUndefined();
  });
  it('keeps approvers on hover when the author has pushed since your changes', () => {
    const item = classify(
      pr({
        author: 'other',
        reasons: ['tracked-repository'],
        reviewDecision: 'CHANGES_REQUESTED',
        changeRequests: [{ login: 'me', pushedSince: true }],
        approvers: ['alice'],
      }),
      'me',
      defaultState(),
      now,
    )!;
    expect(cardViewModel(item, now).reviewBadge).toEqual({
      label: 'Updated since changes',
      tone: 'updated',
      title: 'Approved by alice',
    });
  });
  it('replaces changes requested once the author pushes after yours', () => {
    const item = classify(
      pr({
        author: 'other',
        reasons: ['tracked-repository'],
        reviewDecision: 'CHANGES_REQUESTED',
        changeRequests: [{ login: 'me', pushedSince: true }],
      }),
      'me',
      defaultState(),
      now,
    )!;
    expect(cardViewModel(item, now).reviewBadge).toEqual({
      label: 'Updated since changes',
      tone: 'updated',
    });
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
describe('threads badge', () => {
  const badge = (overrides: Partial<PullRequest>) =>
    cardViewModel(classify(pr(overrides), 'me', defaultState(), now)!, now).threadsBadge;
  it.each([
    [0, null],
    [1, { count: 1, label: '1 unresolved conversation' }],
    [3, { count: 3, label: '3 unresolved conversations' }],
  ])('shows for %i active threads: %j', (activeUnresolvedThreads, expected) => {
    expect(badge({ activeUnresolvedThreads })).toEqual(expected);
  });
  it('ignores outdated threads', () => expect(badge({ outdatedUnresolvedThreads: 2 })).toBeNull());
  it('shows on other people’s PRs', () =>
    expect(badge({ author: 'other', activeUnresolvedThreads: 2 })?.count).toBe(2));
});
