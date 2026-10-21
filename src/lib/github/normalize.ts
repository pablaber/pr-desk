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
// Updating the branch from the base creates a merge commit authored by whoever clicked it,
// which says nothing about who changed the PR, so merge commits are skipped.
function latestChange(raw: RawPR) {
  return [...(raw.recentCommits?.nodes ?? [])]
    .reverse()
    .find((n) => n.commit.parents?.totalCount === 1)?.commit;
}
function headAuthor(raw: RawPR): PullRequest['headAuthor'] {
  const author = latestChange(raw)?.author;
  return { login: author?.user?.login ?? '', name: author?.name ?? '' };
}
// Only the last three commits are fetched, so after three branch updates in a row the head
// stands in. A rebase rewrites the reviewed commit, so it counts as a change, as does a review
// GitHub can no longer tie to a commit.
function changeRequests(raw: RawPR): PullRequest['changeRequests'] {
  const latest = latestChange(raw)?.oid ?? raw.commits.nodes[0]?.commit.oid;
  return (raw.latestOpinionatedReviews?.nodes ?? []).flatMap((review) =>
    review.state === 'CHANGES_REQUESTED' && review.author?.login
      ? [
          {
            login: review.author.login,
            pushedSince: latest !== undefined && review.commit?.oid !== latest,
          },
        ]
      : [],
  );
}
export function normalize(raw: RawPR): PullRequest {
  return {
    id: `${raw.repository.nameWithOwner.toLowerCase()}#${raw.number}`,
    url: raw.url,
    repository: raw.repository.nameWithOwner,
    number: raw.number,
    title: raw.title,
    headOid: raw.commits.nodes[0]?.commit.oid ?? '',
    headAuthor: headAuthor(raw),
    author: raw.author?.login ?? '',
    authorIsBot: raw.author?.__typename === 'Bot',
    state: raw.state,
    draft: raw.isDraft,
    baseRefName: raw.baseRefName,
    headRefName: raw.headRefName,
    crossRepository: raw.isCrossRepository,
    updatedAt: raw.updatedAt,
    reviewDecision: raw.reviewDecision,
    mergeable: raw.mergeable,
    mergeStateStatus: raw.mergeStateStatus,
    mergeQueue: raw.mergeQueueEntry
      ? { state: raw.mergeQueueEntry.state, position: raw.mergeQueueEntry.position }
      : null,
    autoMerge: raw.autoMergeRequest != null,
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
    changeRequests: changeRequests(raw),
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
