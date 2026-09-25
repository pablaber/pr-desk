import { describe, expect, it } from 'vitest';
import { classify, sortPullRequests } from './classify';
import { defaultState } from '../store/app-state';
import { pr } from '../../test/fixtures';
import type { PullRequest } from './types';
const local = defaultState();
const run = (overrides: Partial<PullRequest> = {}) => classify(pr(overrides), 'me', local)!;
describe('dashboard rules', () => {
  it.each([
    [{ directReviewers: ['me'] }, 'Review requested'],
    [{ activeUnresolvedThreads: 3 }, '3 unresolved threads'],
    [{ reviewDecision: 'CHANGES_REQUESTED' }, 'Changes requested'],
    [{ checks: [{ name: 'CI', required: true, state: 'failed' }] }, 'Required checks failed'],
    [{ mergeable: 'CONFLICTING' }, 'Merge conflict'],
  ] as [Partial<PullRequest>, string][])('classifies attention: %j', (changes, label) => {
    expect(run(changes)).toMatchObject({ state: 'needs-attention', primary: label });
  });
  it('direct requests apply regardless of ownership and ignore case', () =>
    expect(run({ author: 'other', directReviewers: ['ME'] }).state).toBe('needs-attention'));
  it('team requests alone do not classify as attention', () =>
    expect(
      run({ author: 'other', reasons: ['direct-review-request'], directReviewers: [] }).state,
    ).toBe('waiting'));
  it('open PRs in a tracked repository need attention, except drafts', () => {
    const tracked: Partial<PullRequest> = { author: 'other', reasons: ['tracked-repository'] };
    expect(run(tracked)).toMatchObject({
      state: 'needs-attention',
      primary: 'Open in a tracked repository',
      statuses: [],
    });
    expect(run({ ...tracked, draft: true }).state).toBe('waiting');
  });
  it('tracked repositories do not override readiness or higher-priority attention', () => {
    expect(
      run({
        reasons: ['owned', 'tracked-repository'],
        reviewDecision: 'APPROVED',
        checks: [{ name: 'CI', required: true, state: 'passing' }],
      }).state,
    ).toBe('ready-to-merge');
    expect(run({ reasons: ['tracked-repository'], directReviewers: ['me'] }).primary).toBe(
      'Review requested',
    );
  });
  it('readiness requires owned, approved, passing, mergeable and not draft', () => {
    const ready: Partial<PullRequest> = {
      reviewDecision: 'APPROVED',
      checks: [{ name: 'CI', required: true, state: 'passing' }],
    };
    expect(run(ready).state).toBe('ready-to-merge');
    for (const changes of [
      { author: 'other' },
      { draft: true },
      { reviewDecision: null },
      { mergeable: 'UNKNOWN' },
      { mergeStateStatus: 'BLOCKED' },
      { checks: [{ name: 'CI', required: true, state: 'pending' as const }] },
    ])
      expect(run({ ...ready, ...changes }).state).toBe('waiting');
  });
  it('optional failures do not prevent readiness', () =>
    expect(
      run({
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'UNSTABLE',
        checks: [{ name: 'lint', required: false, state: 'failed' }],
      }).state,
    ).toBe('ready-to-merge'));
  it('outdated threads, drafts, pending and optional checks fall back to waiting', () => {
    for (const changes of [
      {},
      { draft: true },
      { outdatedUnresolvedThreads: 5 },
      { checks: [{ name: 'CI', required: false, state: 'failed' as const }] },
      { checks: [{ name: 'CI', required: true, state: 'pending' as const }] },
    ])
      expect(run(changes).state).toBe('waiting');
  });
  it('does not act on other people’s conflicts, threads, changes or failed checks', () =>
    expect(
      run({
        author: 'other',
        activeUnresolvedThreads: 5,
        mergeable: 'CONFLICTING',
        reviewDecision: 'CHANGES_REQUESTED',
        checks: [{ name: 'CI', required: true, state: 'failed' }],
      }).state,
    ).toBe('waiting'));
  it('keeps all matching signals and chooses highest priority', () => {
    const result = run({
      directReviewers: ['me'],
      activeUnresolvedThreads: 2,
      reviewDecision: 'CHANGES_REQUESTED',
      mergeable: 'CONFLICTING',
      checks: [{ name: 'CI', required: true, state: 'failed' }],
    });
    expect(result.primary).toBe('Review requested');
    expect(result.statuses).toHaveLength(5);
  });
  it('attention overrides technical readiness and draft', () => {
    expect(run({ reviewDecision: 'APPROVED', activeUnresolvedThreads: 1 }).state).toBe(
      'needs-attention',
    );
    expect(run({ draft: true, mergeable: 'CONFLICTING' }).state).toBe('needs-attention');
  });
  it('hides ignored, currently snoozed and closed PRs; expired snoozes return', () => {
    const prefs = defaultState(),
      now = Date.parse('2026-09-24T10:00:00Z');
    prefs.ignoredPullRequests['acme/api#1'] = { ignoredAt: new Date(now).toISOString() };
    expect(classify(pr(), 'me', prefs, now)).toBeNull();
    delete prefs.ignoredPullRequests['acme/api#1'];
    prefs.snoozedPullRequests['acme/api#1'] = { until: new Date(now + 1000).toISOString() };
    expect(classify(pr(), 'me', prefs, now)).toBeNull();
    expect(classify(pr(), 'me', prefs, now + 1000)).not.toBeNull();
    expect(run({ state: 'CLOSED' })).toBeNull();
    expect(run({ state: 'MERGED' })).toBeNull();
  });
  it('sorts by action priority then oldest update; waiting newest first', () => {
    const review = run({ directReviewers: ['me'], updatedAt: '2026-09-23T10:00:00Z' });
    const conflict = run({ mergeable: 'CONFLICTING' });
    expect([conflict, review].sort(sortPullRequests)[0]).toBe(review);
    const old = run(),
      recent = run({ updatedAt: '2026-09-23T10:00:00Z' });
    expect([old, recent].sort(sortPullRequests)[0]).toBe(recent);
    const readyOld = run({ reviewDecision: 'APPROVED' }),
      readyNew = run({ reviewDecision: 'APPROVED', updatedAt: '2026-09-23T10:00:00Z' });
    expect([readyNew, readyOld].sort(sortPullRequests)[0]).toBe(readyOld);
  });
});

it('hides ignored repositories immediately regardless of tracking reason', () => {
  const preferences = defaultState();
  preferences.ignoredRepositories = ['ACME/API'];
  expect(
    classify(
      pr({ reasons: ['owned', 'watched', 'tracked-repository', 'direct-review-request'] }),
      'me',
      preferences,
    ),
  ).toBeNull();
  expect(classify(pr({ repository: 'acme/other' }), 'me', preferences)).not.toBeNull();
});
