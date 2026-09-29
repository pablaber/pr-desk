import { expect, it } from 'vitest';
import { defaultState, type AppState } from '../store/app-state';
import type { DashboardSnapshot } from '../github/refresh';
import { pr } from '../../test/fixtures';
import { prunePreferences } from './prune';

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
  expect(prunePreferences(local(), snapshot())).toBeNull();
});

it('unwatches and unlabels merged or closed PRs', () => {
  const pruned = prunePreferences(
    local(),
    snapshot({
      prs: [pr({ id: 'acme/api#1', state: 'MERGED' }), pr({ id: 'acme/api#2', state: 'CLOSED' })],
    }),
  );
  expect(pruned).toEqual({ watchedPullRequests: [], labeledPullRequests: {} });
});

it('keeps a finished PR whose data is stale', () => {
  expect(
    prunePreferences(
      local(),
      snapshot({
        prs: [pr({ id: 'acme/api#1', state: 'MERGED' }), pr({ id: 'acme/api#2', number: 2 })],
        staleIds: ['acme/api#1'],
      }),
    ),
  ).toBeNull();
});

it('unlabels untracked PRs only when discovery was complete', () => {
  const sources = { owned: ['acme/api#1'], watched: [] };
  const pruned = prunePreferences(local(), snapshot({ sources }));
  expect(pruned).toEqual({
    watchedPullRequests: ['acme/api#1', 'acme/api#2'],
    labeledPullRequests: { 'acme/api#1': ['l'] },
  });
  expect(prunePreferences(local(), snapshot({ sources, discoveryComplete: false }))).toBeNull();
});

it('keeps labels on PRs hidden by a repository ignore rule', () => {
  const state = local();
  state.ignoreRules = [{ kind: 'repository', value: 'acme/*' }];
  expect(prunePreferences(state, snapshot({ prs: [], sources: {} }))).toBeNull();
});

it('keeps labels on snoozed or ignored PRs that are still discovered', () => {
  const state = local();
  state.snoozedPullRequests = { 'acme/api#1': { until: '2999-01-01T00:00:00Z' } };
  state.ignoredPullRequests = { 'acme/api#2': { ignoredAt: '2026-09-20T00:00:00Z' } };
  expect(prunePreferences(state, snapshot())).toBeNull();
});

it('treats watched PRs as tracked', () => {
  expect(
    prunePreferences(local(), snapshot({ sources: { watched: ['acme/api#1', 'acme/api#2'] } })),
  ).toBeNull();
});
