import type { PullRequest } from '../lib/pr/types';
export function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 'acme/api#1',
    url: 'https://github.com/acme/api/pull/1',
    repository: 'acme/api',
    number: 1,
    title: 'Improve caching',
    headOid: 'a'.repeat(40),
    author: 'me',
    authorIsBot: false,
    state: 'OPEN',
    draft: false,
    updatedAt: '2026-09-20T10:00:00Z',
    reviewDecision: null,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    mergeQueue: null,
    autoMerge: false,
    directReviewers: [],
    activeUnresolvedThreads: 0,
    outdatedUnresolvedThreads: 0,
    checks: [],
    reasons: ['owned'],
    ...overrides,
  };
}
