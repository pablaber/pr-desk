import { describe, expect, it, vi } from 'vitest';
import { GhGitHubService, type QueryRunner } from './client';
import { normalize, normalizeCheck } from './normalize';
import { refreshDashboard } from './refresh';
import { classify } from '../pr/classify';
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
    getOwnedPullRequests: vi.fn(async () => [raw()]),
    getDirectReviewRequests: vi.fn(async () => [raw()]),
    getRepositoryPullRequests: vi.fn(async () => [raw()]),
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
    expect(normalizeCheck({ __typename: 'CheckRun', status: 'IN_PROGRESS' }).state).toBe('pending');
    expect(normalizeCheck({ __typename: 'StatusContext', state: 'ERROR' }).state).toBe('failed');
    expect(
      normalizeCheck({
        __typename: 'CheckRun',
        status: 'COMPLETED',
        conclusion: 'SKIPPED',
      }).state,
    ).toBe('passing');
  });
  it('uses direct-user semantics and paginates discovery', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        search: { ...connection([raw()], true), issueCount: 2 },
      })
      .mockResolvedValueOnce({
        search: {
          ...connection([{ ...raw(), number: 2, url: 'https://github.com/acme/api/pull/2' }]),
          issueCount: 2,
        },
      });
    expect(await new GhGitHubService(query as QueryRunner).getDirectReviewRequests()).toEqual([
      raw(),
      { ...raw(), number: 2, url: 'https://github.com/acme/api/pull/2' },
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
  local.ignoreRules = [{ kind: 'repository', value: 'ACME/API' }];
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
  local.ignoreRules = [];
  expect((await refreshDashboard(api, local, result)).prs).toHaveLength(1);
});

it('filters repository patterns before details and sends only exact exclusions to searches', async () => {
  const api = service(),
    local = defaultState();
  local.trackedRepositories = ['acme/api'];
  local.watchedPullRequests = ['acme/api#1'];
  const previous = await refreshDashboard(api, local);
  local.ignoreRules = [
    { kind: 'repository', value: 'acme/a?i' },
    { kind: 'repository', value: 'other/exact' },
    { kind: 'author', value: 'someone' },
    { kind: 'title', value: '*noise*' },
  ];
  vi.mocked(api.getRepositoryPullRequests).mockClear();
  vi.mocked(api.getPullRequest).mockClear();
  vi.mocked(api.getOwnedPullRequests).mockRejectedValue(new Error('offline'));
  const result = await refreshDashboard(api, local, previous);
  expect(result.prs).toEqual([]);
  expect(api.getRepositoryPullRequests).not.toHaveBeenCalled();
  expect(api.getPullRequest).not.toHaveBeenCalled();
  expect(api.getOwnedPullRequests).toHaveBeenLastCalledWith(['other/exact']);
  expect(api.getDirectReviewRequests).toHaveBeenLastCalledWith(['other/exact']);
});

it.each([
  { kind: 'author' as const, value: 'ME' },
  { kind: 'title' as const, value: '*caching' },
])('keeps request counts and stale recovery intact for $kind rules', async (rule) => {
  const api = service(),
    local = defaultState();
  const previous = await refreshDashboard(api, local);
  local.ignoreRules = [rule];
  vi.mocked(api.getPullRequest).mockClear();
  const fresh = await refreshDashboard(api, local, previous);
  expect(api.getPullRequest).toHaveBeenCalledTimes(1);
  expect(api.getOwnedPullRequests).toHaveBeenLastCalledWith([]);
  expect(api.getDirectReviewRequests).toHaveBeenLastCalledWith([]);
  expect(classify(fresh.prs[0], 'me', local)).toBeNull();
  vi.mocked(api.getOwnedPullRequests).mockRejectedValue(new Error('offline'));
  vi.mocked(api.getDirectReviewRequests).mockRejectedValue(new Error('offline'));
  vi.mocked(api.getPullRequest).mockRejectedValue(new Error('offline'));
  const stale = await refreshDashboard(api, local, fresh);
  expect(stale.staleIds).toEqual(['acme/api#1']);
  expect(classify(stale.prs[0], 'me', local)).toBeNull();
  local.ignoreRules = [];
  const restored = await refreshDashboard(api, local, stale);
  expect(classify(restored.prs[0], 'me', local)).not.toBeNull();
  expect(restored.staleIds).toEqual(['acme/api#1']);
});

it.each([25, 100])('uses only discovery pages for %i complete PRs', async (count) => {
  const nodes = Array.from({ length: count }, (_, i) => ({
    ...raw(),
    number: i + 1,
    url: `https://github.com/acme/api/pull/${i + 1}`,
  }));
  const query = vi.fn(async () => ({ search: { ...connection(nodes), issueCount: count } }));
  const snapshot = await refreshDashboard(
    new GhGitHubService(query as QueryRunner),
    defaultState(),
  );
  expect(snapshot.prs).toHaveLength(count);
  expect(query).toHaveBeenCalledTimes(2);
  for (const [text] of query.mock.calls as unknown as [string][]) {
    expect(text).not.toContain('isRequired');
    for (const field of [
      'reviewDecision',
      'reviewRequests',
      'reviewThreads',
      'contexts',
      'oid',
      'mergeable',
    ])
      expect(text).toContain(field);
  }
});
it('normalizes complete seeds without requests or mutation', async () => {
  const query = vi.fn(),
    seed = raw(),
    before = structuredClone(seed);
  expect(await new GhGitHubService(query).getPullRequest(seed.url, seed)).toEqual(normalize(seed));
  expect(query).not.toHaveBeenCalled();
  expect(seed).toEqual(before);
});
it('requests only unfinished connections and preserves the seed', async () => {
  const seed = raw();
  seed.reviewThreads = connection([], true);
  const before = structuredClone(seed);
  const query = vi.fn().mockResolvedValueOnce({
    repository: {
      pullRequest: { reviewThreads: connection([{ isResolved: false, isOutdated: false }]) },
    },
  });
  const result = await new GhGitHubService(query).getPullRequest(seed.url, seed);
  expect(result.activeUnresolvedThreads).toBe(1);
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][0]).toContain('reviewThreads(first: 100, after: "next")');
  expect(query.mock.calls[0][0]).not.toMatch(/reviewRequests|commits|title/);
  expect(seed).toEqual(before);
});
it('accumulates check pages and rejects a changing commit', async () => {
  const seed = raw();
  const check = { __typename: 'StatusContext', context: 'CI', state: 'SUCCESS' };
  seed.commits = {
    nodes: [{ commit: { oid: 'a', statusCheckRollup: { contexts: connection([check], true) } } }],
  };
  const page = (oid: string) => ({
    repository: {
      pullRequest: {
        commits: {
          nodes: [
            {
              commit: {
                oid,
                statusCheckRollup: {
                  contexts: connection([{ ...check, context: 'lint', state: 'FAILURE' }]),
                },
              },
            },
          ],
        },
      },
    },
  });
  const query = vi.fn().mockResolvedValueOnce(page('a')).mockResolvedValueOnce(page('b'));
  const api = new GhGitHubService(query);
  expect((await api.getPullRequest(seed.url, seed)).checks.map((c) => c.state)).toEqual([
    'passing',
    'failed',
  ]);
  expect(query.mock.calls[0][0]).not.toMatch(/reviewThreads|reviewRequests/);
  await expect(api.getPullRequest(seed.url, seed)).rejects.toThrow('Latest commit changed');
});
it('reuses discovered watched PRs and individually fetches watched-only PRs', async () => {
  const query = vi.fn(async (text: string) =>
    text.includes('DeskSearch')
      ? { search: { ...connection([raw()]), issueCount: 1 } }
      : { repository: { pullRequest: { ...raw(), number: 2, state: 'CLOSED' } } },
  );
  const local = defaultState();
  local.watchedPullRequests = ['acme/api#1', 'acme/api#2'];
  const result = await refreshDashboard(new GhGitHubService(query as QueryRunner), local);
  expect(query).toHaveBeenCalledTimes(3);
  expect(result.prs.find((p) => p.number === 1)?.reasons).toContain('watched');
  expect(
    classify(
      result.prs.find((p) => p.number === 2)!,
      'me',
      local,
    ),
  ).toBeNull();
  expect(local.watchedPullRequests).toHaveLength(2);
});
it('chooses newest seeds, then completeness, then source order regardless of completion order', async () => {
  const api = service();
  const first = raw(),
    second = { ...raw(), title: 'Second source' };
  first.reviewThreads.pageInfo = { hasNextPage: true, endCursor: 'next' };
  vi.mocked(api.getOwnedPullRequests).mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 5));
    return [first];
  });
  vi.mocked(api.getDirectReviewRequests).mockResolvedValue([second]);
  await refreshDashboard(api, defaultState());
  expect(api.getPullRequest).toHaveBeenLastCalledWith('acme/api#1', second);
  first.updatedAt = '2099-01-01T00:00:00Z';
  await refreshDashboard(api, defaultState());
  expect(api.getPullRequest).toHaveBeenLastCalledWith('acme/api#1', first);
  first.updatedAt = second.updatedAt;
  first.reviewThreads.pageInfo.hasNextPage = false;
  await refreshDashboard(api, defaultState());
  expect(api.getPullRequest).toHaveBeenLastCalledWith('acme/api#1', first);
});
it('fails the entire source when a later discovery page fails', async () => {
  const query = vi
    .fn()
    .mockResolvedValueOnce({ search: { ...connection([raw()], true), issueCount: 2 } })
    .mockRejectedValueOnce(new Error('offline'));
  await expect(new GhGitHubService(query).getOwnedPullRequests()).rejects.toThrow('offline');
});
it('retains conservative source staleness despite a successful fresh seed', async () => {
  const api = service(),
    local = defaultState(),
    previous = await refreshDashboard(api, local);
  vi.mocked(api.getOwnedPullRequests).mockRejectedValue(new Error('offline'));
  const result = await refreshDashboard(api, local, previous);
  expect(result.prs).toHaveLength(1);
  expect(result.staleIds).toEqual(['acme/api#1']);
  expect(result.warnings).toHaveLength(1);
});
it('omits incomplete new records and retains previous complete records on continuation failures', async () => {
  const seed = raw();
  seed.reviewThreads.pageInfo = { hasNextPage: true, endCursor: 'next' };
  const query = vi.fn(async (text: string) => {
    if (text.includes('DeskSearch')) return { search: { ...connection([seed]), issueCount: 1 } };
    throw new Error('offline');
  });
  const api = new GhGitHubService(query as QueryRunner),
    local = defaultState();
  const initial = await refreshDashboard(api, local);
  expect(initial.prs).toEqual([]);
  expect(initial.warnings).toHaveLength(1);
  const previous = { ...initial, prs: [pr()] };
  expect((await refreshDashboard(api, local, previous)).prs[0].title).toBe(pr().title);
});
it('bounds discovery and completion phases to four workers', async () => {
  const api = service(),
    local = defaultState();
  local.trackedRepositories = Array.from({ length: 10 }, (_, i) => `acme/repo${i}`);
  local.watchedPullRequests = Array.from({ length: 12 }, (_, i) => `acme/api#${i + 1}`);
  let active = 0,
    max = 0,
    discovered = 0;
  const work = async () => {
    active++;
    max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 2));
    active--;
  };
  vi.mocked(api.getRepositoryPullRequests).mockImplementation(async () => {
    await work();
    discovered++;
    return [];
  });
  vi.mocked(api.getPullRequest).mockImplementation(async () => {
    expect(discovered).toBe(10);
    await work();
    return pr();
  });
  await refreshDashboard(api, local);
  expect(max).toBe(4);
});
it.each(['SUCCESS', 'NEUTRAL', 'SKIPPED', 'FAILURE', 'CANCELLED', 'TIMED_OUT', 'UNKNOWN'])(
  'normalizes %s consistently for readiness',
  (conclusion) => {
    const check = normalizeCheck({ __typename: 'CheckRun', status: 'COMPLETED', conclusion });
    const expected = ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(conclusion)
      ? 'ready-to-merge'
      : conclusion === 'UNKNOWN'
        ? 'waiting'
        : 'needs-attention';
    expect(
      classify(pr({ reviewDecision: 'APPROVED', checks: [check] }), 'me', defaultState())?.state,
    ).toBe(expected);
  },
);

it('keeps repository validation lightweight and paginates rich repository records', async () => {
  const query = vi
    .fn()
    .mockResolvedValueOnce({ repository: { nameWithOwner: 'acme/api' } })
    .mockResolvedValueOnce({ repository: { pullRequests: connection([raw()], true) } })
    .mockResolvedValueOnce({ repository: { pullRequests: connection([]) } });
  const api = new GhGitHubService(query);
  await api.validateRepository('acme/api');
  expect(query.mock.calls[0][0]).not.toMatch(/pullRequests|contexts|reviewThreads/);
  expect(await api.getRepositoryPullRequests('acme/api')).toEqual([raw()]);
  expect(query.mock.calls[1][0]).toContain('oid');
  expect(query.mock.calls[2][0]).toContain('after: "next"');
});
it('rejects search truncation and missing continuation cursors', async () => {
  const query = vi
    .fn()
    .mockResolvedValueOnce({ search: { ...connection([]), issueCount: 1001 } })
    .mockResolvedValueOnce({
      search: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null }, issueCount: 1 },
    });
  const api = new GhGitHubService(query);
  await expect(api.getOwnedPullRequests()).rejects.toThrow('1,000-result');
  await expect(api.getOwnedPullRequests()).rejects.toThrow('continuation cursor');
});
it('treats absent commits and null rollups as empty passing check sets', () => {
  for (const commits of [
    { nodes: [] },
    { nodes: [{ commit: { oid: 'a', statusCheckRollup: null } }] },
  ]) {
    const result = normalize({
      ...raw(),
      reviewThreads: connection([]),
      reviewDecision: 'APPROVED',
      commits,
    });
    expect(result.checks).toEqual([]);
    expect(classify(result, 'me', defaultState())?.state).toBe('ready-to-merge');
  }
});
