import { expect, it, vi } from 'vitest';
import { GhGitHubService } from './client';
import { fetchCompleted } from './completed';
import { defaultState } from '../store/app-state';
import type { GitHubService, RawMergedPR } from './types';

const now = Date.parse('2026-10-01T12:00:00Z');
const merged = (repo: string, number: number, mergedAt: string | null): RawMergedPR => ({
  url: `https://github.com/${repo}/pull/${number}`,
  number,
  title: `PR ${number}`,
  author: { login: 'me' },
  repository: { nameWithOwner: repo },
  mergedAt,
  mergedBy: { login: 'sam' },
});
function service(overrides: Partial<GitHubService> = {}): GitHubService {
  return {
    getMergedPullRequests: vi.fn(async () => []),
    getRepositoryMergedPullRequests: vi.fn(async () => []),
    ...overrides,
  } as unknown as GitHubService;
}

it('queries all three searches since seven days ago and merges duplicates', async () => {
  const api = service({
    getMergedPullRequests: vi.fn(async () => [merged('acme/api', 1, '2026-09-30T10:00:00Z')]),
  });
  const result = await fetchCompleted(api, defaultState(), now);
  expect(result.prs).toHaveLength(1);
  expect(api.getMergedPullRequests).toHaveBeenCalledTimes(3);
  expect(api.getMergedPullRequests).toHaveBeenCalledWith('reviewed-by', '2026-09-24', []);
});

it('drops PRs merged before the cutoff, never merged, or in ignored repositories', async () => {
  const state = defaultState();
  state.trackedRepositories = ['acme/api', 'skip/me'];
  state.ignoreRules = [{ kind: 'repository', value: 'skip/*' }];
  const api = service({
    getRepositoryMergedPullRequests: vi.fn(async () => [
      merged('acme/api', 1, '2026-09-20T10:00:00Z'),
      merged('acme/api', 2, null),
      merged('acme/api', 3, '2026-09-25T10:00:00Z'),
      merged('skip/me', 4, '2026-09-30T10:00:00Z'),
    ]),
  });
  const result = await fetchCompleted(api, state, now);
  expect(result.prs.map((p) => p.id)).toEqual(['acme/api#3']);
  expect(api.getRepositoryMergedPullRequests).toHaveBeenCalledTimes(1);
});

it('keeps results from sources that worked and warns about the ones that failed', async () => {
  const api = service({
    getMergedPullRequests: vi.fn(async (qualifier) => {
      if (qualifier === 'author') throw new Error('offline');
      return [merged('acme/api', 1, '2026-09-30T10:00:00Z')];
    }),
  });
  const result = await fetchCompleted(api, defaultState(), now);
  expect(result.prs).toHaveLength(1);
  expect(result.warnings).toEqual(['author: Error: offline']);
});

it('builds merged search and repository queries', async () => {
  const query = vi.fn(async (q: string) =>
    q.includes('DeskMergedSearch')
      ? { search: { nodes: [null, merged('a/b', 1, '2026-09-30T10:00:00Z')] } }
      : { repository: null },
  );
  const github = new GhGitHubService(query as never);
  expect(await github.getMergedPullRequests('author', '2026-09-24', ['x/y'])).toHaveLength(1);
  expect(query.mock.calls[0][0]).toContain(
    'is:pr is:merged author:@me merged:>=2026-09-24 sort:updated-desc -repo:x/y',
  );
  await expect(github.getRepositoryMergedPullRequests('a/b')).rejects.toThrow('not found');
  expect(query.mock.calls[1][0]).toContain('states: MERGED');
});
