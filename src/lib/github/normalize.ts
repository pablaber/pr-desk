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
// Only the last three commits are fetched, so a reviewed commit older than those counts as a
// change. So does a rebase, which rewrites the reviewed commit, and a review GitHub can no longer
// tie to a commit.
function changedSince(raw: RawPR, reviewed: string | undefined) {
  const recent = raw.recentCommits?.nodes ?? [];
  const index = recent.findIndex((n) => n.commit.oid === reviewed);
  if (index === -1) {
    const head = raw.commits.nodes[0]?.commit.oid;
    return head !== undefined && head !== reviewed;
  }
  return recent.slice(index + 1).some((n) => n.commit.parents?.totalCount === 1);
}
function changeRequests(raw: RawPR): PullRequest['changeRequests'] {
  return (raw.latestOpinionatedReviews?.nodes ?? []).flatMap((review) =>
    review.state === 'CHANGES_REQUESTED' && review.author?.login
      ? [
          {
            login: review.author.login,
            pushedSince: changedSince(raw, review.commit?.oid),
          },
        ]
      : [],
  );
}
function approvers(raw: RawPR): PullRequest['approvers'] {
  return (raw.latestOpinionatedReviews?.nodes ?? []).flatMap((review) =>
    review.state === 'APPROVED' && review.author?.login ? [review.author.login] : [],
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
    approvers: approvers(raw),
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
