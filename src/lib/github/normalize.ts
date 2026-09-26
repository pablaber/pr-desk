import type { PullRequest } from '../pr/types';
import type { RawCheck, RawPR } from './types';
export function normalizeCheck(check: RawCheck): PullRequest['checks'][number] {
  const status =
    check.__typename === 'CheckRun'
      ? check.status === 'COMPLETED'
        ? check.conclusion
        : 'PENDING'
      : check.state;
  return {
    name: check.name ?? check.context ?? 'Check',
    state: ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(status ?? '')
      ? 'passing'
      : [
            'FAILURE',
            'ERROR',
            'CANCELLED',
            'TIMED_OUT',
            'ACTION_REQUIRED',
            'STARTUP_FAILURE',
            'STALE',
          ].includes(status ?? '')
        ? 'failed'
        : 'pending',
  };
}
export function normalize(raw: RawPR): PullRequest {
  return {
    id: `${raw.repository.nameWithOwner.toLowerCase()}#${raw.number}`,
    url: raw.url,
    repository: raw.repository.nameWithOwner,
    number: raw.number,
    title: raw.title,
    author: raw.author?.login ?? '',
    state: raw.state,
    draft: raw.isDraft,
    updatedAt: raw.updatedAt,
    reviewDecision: raw.reviewDecision,
    mergeable: raw.mergeable,
    mergeStateStatus: raw.mergeStateStatus,
    directReviewers: raw.reviewRequests.nodes.flatMap((r) =>
      r.requestedReviewer?.__typename === 'User' && r.requestedReviewer.login
        ? [r.requestedReviewer.login]
        : [],
    ),
    activeUnresolvedThreads: raw.reviewThreads.nodes.filter((t) => !t.isResolved && !t.isOutdated)
      .length,
    outdatedUnresolvedThreads: raw.reviewThreads.nodes.filter((t) => !t.isResolved && t.isOutdated)
      .length,
    checks: (raw.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? []).map(
      normalizeCheck,
    ),
    reasons: [],
  };
}

export function rawConnections(pr: RawPR) {
  return [
    pr.reviewRequests,
    pr.reviewThreads,
    pr.commits?.nodes[0]?.commit.statusCheckRollup?.contexts,
  ];
}
export function completeSeed(pr: RawPR) {
  return !rawConnections(pr).some((p) => p?.pageInfo.hasNextPage);
}
