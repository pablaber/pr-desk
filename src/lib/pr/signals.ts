import type { AppState } from '../store/app-state';
import { isBotCommit, isKnownBot } from './bots';
import { matchesGlob } from './ignore';
import type { PullRequest } from './types';
export function deriveSignals(
  pr: PullRequest,
  login: string,
  prefs: Pick<AppState, 'checkRules' | 'knownBots'>,
) {
  const owned = pr.author.toLowerCase() === login.toLowerCase();
  const bot =
    !owned &&
    isKnownBot(pr, prefs.knownBots) &&
    (pr.reasons.includes('tracked-repository') || pr.reasons.includes('watched'));
  const managed = owned || bot;
  // Branch protection can require the latest push to be approved by someone else, and GitHub
  // hides whether it does. The pusher is not exposed either; the head commit author stands in.
  const lastPushedByYou = !owned && pr.headAuthor.login.toLowerCase() === login.toLowerCase();
  // A commit author GitHub cannot link to an account may still be you, so only the bot's own
  // latest change is safe to approve in-app.
  const headByBot = bot && isBotCommit(pr);
  const matchingRules = (name: string) =>
    prefs.checkRules.filter(
      (rule) => matchesGlob(pr.repository, rule.repository) && matchesGlob(name, rule.check),
    );
  const exempt = (state: 'pending' | 'failed') => [
    ...new Set(
      pr.checks
        .filter(
          (c) =>
            c.state === state &&
            matchingRules(c.name).some((rule) => state === 'pending' || rule.allowFailures),
        )
        .map((c) => c.name),
    ),
  ];
  const waitingOn = exempt('pending');
  const allowedFailures = exempt('failed');
  const checks = pr.checks.filter(
    (c) =>
      !(c.state === 'pending' && waitingOn.includes(c.name)) &&
      !(c.state === 'failed' && allowedFailures.includes(c.name)),
  );
  const nonBlocking = waitingOn.length + allowedFailures.length > 0;
  const approved =
    managed &&
    !pr.draft &&
    pr.reviewDecision === 'APPROVED' &&
    checks.every((c) => c.state === 'passing') &&
    pr.mergeable === 'MERGEABLE';
  // A PR already in the merge queue or with auto-merge on has nothing left for the user to do.
  const notQueued = pr.mergeQueue === null && !pr.autoMerge;
  return {
    pr,
    owned,
    bot,
    managed,
    lastPushedByYou,
    headByBot,
    directReviewRequested: pr.directReviewers.some((r) => r.toLowerCase() === login.toLowerCase()),
    trackedRepository: pr.reasons.includes('tracked-repository'),
    activeThreads: pr.activeUnresolvedThreads,
    changesRequested: pr.reviewDecision === 'CHANGES_REQUESTED',
    failedChecks: checks.filter((c) => c.state === 'failed').length,
    checksRunning: checks.some((c) => c.state === 'pending'),
    checksPassing: checks.every((c) => c.state === 'passing'),
    waitingOn,
    allowedFailures,
    conflict: pr.mergeable === 'CONFLICTING',
    // GitHub only reports BEHIND when branch protection requires an up-to-date branch.
    behind: pr.mergeStateStatus === 'BEHIND',
    queued: pr.mergeQueue !== null,
    autoMerge: pr.autoMerge,
    // Strict definition, which the in-app merge relies on.
    ready:
      approved &&
      notQueued &&
      !nonBlocking &&
      ['CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(pr.mergeStateStatus),
    // GitHub reports a required pending check as BLOCKED and does not say which rule blocks,
    // so BLOCKED is tolerated only while a check the user marked non-blocking is pending, or
    // has failed under a rule that allows failures.
    readyNonBlockingChecks:
      approved &&
      notQueued &&
      nonBlocking &&
      ['BLOCKED', 'CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(pr.mergeStateStatus),
    // The missing review is what makes GitHub report BLOCKED, so it is expected here; the
    // in-app approve and merge revalidates readiness after approving. Every raw check must
    // pass, so a non-blocking pending or allowed failed check still disqualifies the PR.
    approvable:
      headByBot &&
      !pr.draft &&
      pr.reviewDecision !== 'APPROVED' &&
      pr.reviewDecision !== 'CHANGES_REQUESTED' &&
      pr.checks.every((c) => c.state === 'passing') &&
      pr.mergeable === 'MERGEABLE' &&
      notQueued &&
      ['BLOCKED', 'CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(pr.mergeStateStatus),
    // Checks are not required: an outdated branch is often why they fail.
    updatable:
      managed &&
      !pr.draft &&
      pr.mergeStateStatus === 'BEHIND' &&
      pr.mergeable === 'MERGEABLE' &&
      notQueued,
  };
}
export type PullRequestSignals = ReturnType<typeof deriveSignals>;
