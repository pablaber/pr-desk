import { expect, it } from 'vitest';
import { defaultState, type AppState } from '../store/app-state';
import type { DashboardSnapshot } from '../github/refresh';
import { pr } from '../../test/fixtures';
import { prunePreferences } from './prune';

const now = Date.parse('2026-10-21T12:00:00Z');

function local(): AppState {
  const state = defaultState();
  state.labels = [{ id: 'l', name: 'Label', color: 'blue' }];
  state.watchedPullRequests = ['acme/api#1', 'acme/api#2'];
  state.labeledPullRequests = { 'acme/api#1': ['l'], 'acme/api#2': ['l'] };
  return state;
}
function snapshot(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    prs: [pr({ id: 'acme/api#1' }), pr({ id: 'acme/api#2', number: 2 })],
    sources: { owned: ['acme/api#1', 'acme/api#2'], watched: [] },
    warnings: [],
    staleIds: [],
    discoveryComplete: true,
    ...overrides,
  };
}

it('changes nothing while every PR is open and tracked', () => {
  expect(prunePreferences(local(), snapshot(), now)).toBeNull();
});

it('unwatches and unlabels merged or closed PRs', () => {
  const pruned = prunePreferences(
    local(),
    snapshot({
      prs: [pr({ id: 'acme/api#1', state: 'MERGED' }), pr({ id: 'acme/api#2', state: 'CLOSED' })],
    }),
    now,
  );
  expect(pruned).toEqual({
    watchedPullRequests: [],
    labeledPullRequests: {},
    snoozedPullRequests: {},
  });
});

it('keeps a finished PR whose data is stale', () => {
  expect(
    prunePreferences(
      local(),
      snapshot({
        prs: [pr({ id: 'acme/api#1', state: 'MERGED' }), pr({ id: 'acme/api#2', number: 2 })],
        staleIds: ['acme/api#1'],
      }),
      now,
    ),
  ).toBeNull();
});

it('unlabels untracked PRs only when discovery was complete', () => {
  const sources = { owned: ['acme/api#1'], watched: [] };
  const pruned = prunePreferences(local(), snapshot({ sources }), now);
  expect(pruned).toEqual({
    watchedPullRequests: ['acme/api#1', 'acme/api#2'],
    labeledPullRequests: { 'acme/api#1': ['l'] },
    snoozedPullRequests: {},
  });
  expect(
    prunePreferences(local(), snapshot({ sources, discoveryComplete: false }), now),
  ).toBeNull();
});

it('keeps labels on PRs hidden by a repository ignore rule', () => {
  const state = local();
  state.ignoreRules = [{ kind: 'repository', value: 'acme/*' }];
  expect(prunePreferences(state, snapshot({ prs: [], sources: {} }), now)).toBeNull();
});

it('keeps labels on snoozed or ignored PRs that are still discovered', () => {
  const state = local();
  state.snoozedPullRequests = { 'acme/api#1': { until: '2999-01-01T00:00:00Z' } };
  state.ignoredPullRequests = { 'acme/api#2': { ignoredAt: '2026-09-20T00:00:00Z' } };
  expect(prunePreferences(state, snapshot(), now)).toBeNull();
});

it('treats watched PRs as tracked', () => {
  expect(
    prunePreferences(
      local(),
      snapshot({ sources: { watched: ['acme/api#1', 'acme/api#2'] } }),
      now,
    ),
  ).toBeNull();
});

it('drops snoozes whose time is up and keeps the rest', () => {
  const state = local();
  state.snoozedPullRequests = {
    'acme/api#1': { until: '2026-10-21T11:59:59Z' },
    'acme/api#2': { until: '2026-10-21T12:00:00Z' },
    'acme/web#3': { until: '2026-10-22T13:00:00Z' },
  };
  expect(prunePreferences(state, snapshot(), now)?.snoozedPullRequests).toEqual({
    'acme/web#3': { until: '2026-10-22T13:00:00Z' },
  });
});

it('drops snoozes on merged or closed PRs before they expire', () => {
  const state = local();
  state.snoozedPullRequests = {
    'acme/api#1': { until: '2026-10-22T13:00:00Z' },
    'acme/api#2': { until: '2026-10-22T13:00:00Z' },
  };
  const pruned = prunePreferences(
    state,
    snapshot({
      prs: [pr({ id: 'acme/api#1', state: 'MERGED' }), pr({ id: 'acme/api#2', number: 2 })],
    }),
    now,
  );
  expect(pruned?.snoozedPullRequests).toEqual({ 'acme/api#2': { until: '2026-10-22T13:00:00Z' } });
});

it('keeps live snoozes on PRs whose state is unknown', () => {
  const state = local();
  state.snoozedPullRequests = {
    'acme/api#1': { until: '2026-10-22T13:00:00Z' },
    'acme/web#9': { until: '2026-10-22T13:00:00Z' },
  };
  expect(
    prunePreferences(
      state,
      snapshot({
        prs: [pr({ id: 'acme/api#1', state: 'MERGED' }), pr({ id: 'acme/api#2', number: 2 })],
        staleIds: ['acme/api#1'],
      }),
      now,
    ),
  ).toBeNull();
});
