import { expect, it, vi } from 'vitest';
import { GhGitHubService } from './client';
import { fetchHistory } from './history';
import type { RawHistoryPR } from './types';

const raw = (number: number, overrides: Partial<RawHistoryPR> = {}): RawHistoryPR => ({
  url: `https://github.com/Acme/API/pull/${number}`,
  number,
  title: `PR ${number}`,
  author: { login: 'renovate', __typename: 'Bot' },
  repository: { nameWithOwner: 'acme/api' },
  createdAt: '2026-10-14T10:00:00Z',
  mergedAt: '2026-10-15T10:00:00Z',
  mergedBy: { login: 'me' },
  reviews: { nodes: [{ submittedAt: '2026-10-15T09:00:00Z' }] },
  ...overrides,
});

it('runs the four searches without ignore exclusions and normalizes the results', async () => {
  const getHistoryPullRequests = vi.fn(async (search: string, _login: string) =>
    search.startsWith('repo:') ? [raw(1, { author: null, mergedBy: null, reviews: null })] : [],
  );
  const result = await fetchHistory({ getHistoryPullRequests }, 'me', ['acme/api'], '2026-10-15');
  expect(getHistoryPullRequests.mock.calls).toEqual([
    ['is:pr is:merged author:@me merged:>=2026-10-15', 'me'],
    ['is:pr reviewed-by:@me updated:>=2026-10-15', 'me'],
    ['is:pr is:merged user-review-requested:@me merged:>=2026-10-15', 'me'],
    ['repo:acme/api is:pr is:merged merged:>=2026-10-15', 'me'],
  ]);
  expect(result).toEqual({
    entries: [
      {
        id: 'acme/api#1',
        url: 'https://github.com/Acme/API/pull/1',
        repository: 'acme/api',
        number: 1,
        title: 'PR 1',
        author: '',
        authorIsApp: false,
        createdAt: '2026-10-14T10:00:00Z',
        mergedAt: '2026-10-15T10:00:00Z',
        mergedBy: null,
        approvedAt: null,
      },
    ],
    warnings: [],
    complete: true,
  });
});

it('marks the sync incomplete when any search fails', async () => {
  const getHistoryPullRequests = vi.fn(async (search: string) => {
    if (search.includes('reviewed-by')) throw new Error('offline');
    return [raw(2)];
  });
  const result = await fetchHistory({ getHistoryPullRequests }, 'me', [], '2026-10-15');
  expect(result.complete).toBe(false);
  expect(result.warnings).toEqual([
    'History sync (is:pr reviewed-by:@me updated:>=2026-10-15): Error: offline',
  ]);
  expect(result.entries[0]).toMatchObject({
    authorIsApp: true,
    mergedBy: 'me',
    approvedAt: '2026-10-15T09:00:00Z',
  });
});

it('pages through history search results with your first approval', async () => {
  const query = vi.fn(async (q: string) => ({
    search: q.includes('after: null')
      ? { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [raw(1), {}] }
      : { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [raw(2)] },
  }));
  const github = new GhGitHubService(query as never);
  const prs = await github.getHistoryPullRequests('is:pr author:@me', 'me');
  expect(prs.map((p) => p.number)).toEqual([1, 2]);
  expect(query.mock.calls[0][0]).toMatch(/^query DeskHistorySearch \{/);
  expect(query.mock.calls[0][0]).toContain('first: 50');
  expect(query.mock.calls[0][0]).toContain('reviews(author: "me", states: APPROVED, first: 1)');
  expect(query.mock.calls[1][0]).toContain('after: "c1"');
});
