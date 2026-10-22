import type { HistoryEntry } from '../lib/history/types';
import type { PullRequest } from '../lib/pr/types';
export function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 'acme/api#1',
    url: 'https://github.com/acme/api/pull/1',
    repository: 'acme/api',
    number: 1,
    title: 'Improve caching',
    headOid: 'a'.repeat(40),
    headAuthor: { login: '', name: '' },
    author: 'me',
    authorIsBot: false,
    state: 'OPEN',
    draft: false,
    baseRefName: 'main',
    headRefName: 'feature',
    crossRepository: false,
    updatedAt: '2026-09-20T10:00:00Z',
    reviewDecision: 'REVIEW_REQUIRED',
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    mergeQueue: null,
    autoMerge: false,
    directReviewers: [],
    activeUnresolvedThreads: 0,
    outdatedUnresolvedThreads: 0,
    checks: [],
    changeRequests: [],
    reasons: ['owned'],
    ...overrides,
  };
}

export function historyEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'acme/api#1',
    url: 'https://github.com/acme/api/pull/1',
    repository: 'acme/api',
    number: 1,
    title: 'Improve caching',
    author: 'me',
    authorIsApp: false,
    createdAt: '2026-09-20T10:00:00Z',
    mergedAt: null,
    mergedBy: null,
    approvedAt: null,
    ...overrides,
  };
}
