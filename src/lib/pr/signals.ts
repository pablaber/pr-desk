import type { PullRequest } from './types';
export function deriveSignals(pr: PullRequest, login: string) {
  const owned = pr.author.toLowerCase() === login.toLowerCase();
  const required = pr.checks.filter((c) => c.required);
  return {
    pr,
    owned,
    directReviewRequested: pr.directReviewers.some((r) => r.toLowerCase() === login.toLowerCase()),
    trackedRepository: pr.reasons.includes('tracked-repository'),
    activeThreads: pr.activeUnresolvedThreads,
    changesRequested: pr.reviewDecision === 'CHANGES_REQUESTED',
    failedRequiredChecks: required.filter((c) => c.state === 'failed').length,
    requiredChecksPassing: required.every((c) => c.state === 'passing'),
    conflict: pr.mergeable === 'CONFLICTING',
    ready:
      owned &&
      !pr.draft &&
      pr.reviewDecision === 'APPROVED' &&
      required.every((c) => c.state === 'passing') &&
      pr.mergeable === 'MERGEABLE' &&
      ['CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(pr.mergeStateStatus),
  };
}
export type PullRequestSignals = ReturnType<typeof deriveSignals>;
