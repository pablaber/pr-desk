import { describe, expect, it, vi } from 'vitest';
import { GhGitHubService, type QueryRunner } from './client';
import { normalize, normalizeCheck } from './normalize';
import { refreshDashboard } from './refresh';
import { defaultState } from '../store/app-state';
import { pr } from '../../test/fixtures';
import type { GitHubService, RawPR } from './types';
const connection = <T>(nodes: T[], more = false) => ({
  nodes,
  pageInfo: { hasNextPage: more, endCursor: more ? 'next' : null },
});
function raw(): RawPR {
  return {
    ...pr(),
    author: { login: 'me' },
    repository: { nameWithOwner: 'Acme/API' },
    isDraft: false,
    reviewRequests: connection([
      { requestedReviewer: { __typename: 'Team', login: 'me' } },
      { requestedReviewer: { __typename: 'User', login: 'reviewer' } },
    ]),
    reviewThreads: connection([
      { isResolved: false, isOutdated: false },
      { isResolved: false, isOutdated: true },
      { isResolved: true, isOutdated: false },
    ]),
    commits: { nodes: [] },
  };
}
function service(): GitHubService {
  return {
    authenticate: vi.fn(async () => {}),
    getCurrentUser: vi.fn(async () => 'me'),
    getOwnedPullRequests: vi.fn(async () => ['acme/api#1']),
    getDirectReviewRequests: vi.fn(async () => ['acme/api#1']),
    getRepositoryPullRequests: vi.fn(async () => ['acme/api#1']),
    validateRepository: vi.fn(async () => {}),
    getPullRequest: vi.fn(async () => pr()),
  };
}
describe('GitHub adapter', () => {
  it('normalizes canonical identity, individual reviewers, active and outdated threads', () =>
    expect(normalize(raw())).toMatchObject({
      id: 'acme/api#1',
      directReviewers: ['reviewer'],
      activeUnresolvedThreads: 1,
      outdatedUnresolvedThreads: 1,
    }));
  it('normalizes both status contexts and check runs', () => {
    expect(
      normalizeCheck({ __typename: 'CheckRun', status: 'IN_PROGRESS', isRequired: true }).state,
    ).toBe('pending');
    expect(
      normalizeCheck({ __typename: 'StatusContext', state: 'ERROR', isRequired: false }).state,
    ).toBe('failed');
    expect(
      normalizeCheck({
        __typename: 'CheckRun',
        status: 'COMPLETED',
        conclusion: 'SKIPPED',
        isRequired: true,
      }).state,
    ).toBe('passing');
  });
  it('uses direct-user semantics and paginates discovery', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        search: { ...connection([{ url: pr().url }], true), issueCount: 2 },
      })
      .mockResolvedValueOnce({
        search: { ...connection([{ url: 'https://github.com/acme/api/pull/2' }]), issueCount: 2 },
      });
    expect(await new GhGitHubService(query as QueryRunner).getDirectReviewRequests()).toEqual([
      'acme/api#1',
      'acme/api#2',
    ]);
    expect(query.mock.calls[0][0]).toContain('user-review-requested:@me');
    expect(query.mock.calls[1][0]).toContain('after: "next"');
  });
  it('paginates detail connections without duplicating finished connections', async () => {
    const first = raw();
    first.reviewThreads.pageInfo = { hasNextPage: true, endCursor: 'next' };
    const second = raw();
    second.reviewThreads = connection([{ isResolved: false, isOutdated: false }]);
    const query = vi
      .fn()
      .mockResolvedValueOnce({ repository: { pullRequest: first } })
      .mockResolvedValueOnce({ repository: { pullRequest: second } });
    const result = await new GhGitHubService(query as QueryRunner).getPullRequest('acme/api#1');
    expect(result.activeUnresolvedThreads).toBe(2);
    expect(result.directReviewers).toEqual(['reviewer']);
  });
  it('deduplicates all sources while retaining reasons', async () => {
    const api = service(),
      local = defaultState();
    local.trackedRepositories = ['acme/api'];
    local.watchedPullRequests = ['acme/api#1'];
    const result = await refreshDashboard(api, local);
    expect(result.prs).toHaveLength(1);
    expect(result.prs[0].reasons).toHaveLength(4);
    expect(api.getPullRequest).toHaveBeenCalledTimes(1);
  });
  it('retains prior results and marks stale on partial failures', async () => {
    const api = service(),
      local = defaultState(),
      previous = await refreshDashboard(api, local);
    vi.mocked(api.getOwnedPullRequests).mockRejectedValue(new Error('offline'));
    vi.mocked(api.getPullRequest).mockRejectedValue(new Error('offline'));
    const result = await refreshDashboard(api, local, previous);
    expect(result.prs).toHaveLength(1);
    expect(result.warnings).toHaveLength(2);
    expect(result.staleIds).toEqual(['acme/api#1']);
  });
  it('removes stale sources after a successful empty refresh', async () => {
    const api = service(),
      local = defaultState(),
      previous = await refreshDashboard(api, local);
    vi.mocked(api.getOwnedPullRequests).mockResolvedValue([]);
    vi.mocked(api.getDirectReviewRequests).mockResolvedValue([]);
    expect((await refreshDashboard(api, local, previous)).prs).toEqual([]);
  });
});

it.each(['getOwnedPullRequests', 'getDirectReviewRequests'] as const)(
  'excludes repositories on every %s search page',
  async (method) => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ search: { ...connection([], true), issueCount: 0 } })
      .mockResolvedValueOnce({ search: { ...connection([]), issueCount: 0 } });
    await new GhGitHubService(query as QueryRunner)[method]([
      ' Acme/NOISE ',
      'acme/other',
      'acme/noise',
    ]);
    for (const [text] of query.mock.calls) {
      expect(text).toContain('-repo:acme/noise -repo:acme/other');
      expect(text.match(/-repo:acme\/noise/g)).toHaveLength(1);
    }
    expect(query.mock.calls[1][0]).toContain('after: "next"');
  },
);
it('skips ignored tracked repos and details, including watched and failed cached sources', async () => {
  const api = service(),
    local = defaultState();
  local.trackedRepositories = ['acme/api'];
  local.watchedPullRequests = ['acme/api#1'];
  const previous = await refreshDashboard(api, local);
  local.ignoredRepositories = ['ACME/API'];
  vi.mocked(api.getRepositoryPullRequests).mockClear();
  vi.mocked(api.getPullRequest).mockClear();
  vi.mocked(api.getOwnedPullRequests).mockRejectedValue(new Error('offline'));
  const result = await refreshDashboard(api, local, previous);
  expect(result.prs).toEqual([]);
  expect(result.staleIds).toEqual([]);
  expect(Object.values(result.sources).flat()).toEqual([]);
  expect(api.getRepositoryPullRequests).not.toHaveBeenCalled();
  expect(api.getPullRequest).not.toHaveBeenCalled();
  expect(api.getDirectReviewRequests).toHaveBeenLastCalledWith(['ACME/API']);
  local.ignoredRepositories = [];
  expect((await refreshDashboard(api, local, result)).prs).toHaveLength(1);
});
