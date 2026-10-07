import type { AppState } from '../store/app-state';
import { isKnownBot } from './bots';
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
    isKnownBot(pr.author, prefs.knownBots) &&
    (pr.reasons.includes('tracked-repository') || pr.reasons.includes('watched'));
  const managed = owned || bot;
  const waitingOn = [
    ...new Set(
      pr.checks
        .filter(
          (c) =>
            c.state === 'pending' &&
            prefs.checkRules.some(
              (rule) =>
                matchesGlob(pr.repository, rule.repository) && matchesGlob(c.name, rule.check),
            ),
        )
        .map((c) => c.name),
    ),
  ];
  const checks = pr.checks.filter((c) => !(c.state === 'pending' && waitingOn.includes(c.name)));
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
    directReviewRequested: pr.directReviewers.some((r) => r.toLowerCase() === login.toLowerCase()),
    trackedRepository: pr.reasons.includes('tracked-repository'),
    activeThreads: pr.activeUnresolvedThreads,
    changesRequested: pr.reviewDecision === 'CHANGES_REQUESTED',
    failedChecks: pr.checks.filter((c) => c.state === 'failed').length,
    checksRunning: checks.some((c) => c.state === 'pending'),
    checksPassing: checks.every((c) => c.state === 'passing'),
    waitingOn,
    conflict: pr.mergeable === 'CONFLICTING',
    queued: pr.mergeQueue !== null,
    autoMerge: pr.autoMerge,
    // Strict definition, which the in-app merge relies on.
    ready:
      approved &&
      notQueued &&
      waitingOn.length === 0 &&
      ['CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(pr.mergeStateStatus),
    // GitHub reports a required pending check as BLOCKED and does not say which rule blocks,
    // so BLOCKED is tolerated only while a check the user marked non-blocking is pending.
    readyPendingChecks:
      approved &&
      notQueued &&
      waitingOn.length > 0 &&
      ['BLOCKED', 'CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(pr.mergeStateStatus),
    // The missing review is what makes GitHub report BLOCKED, so it is expected here; the
    // in-app approve and merge revalidates readiness after approving. Every raw check must
    // pass, so a pending check the user marked non-blocking still disqualifies the PR.
    approvable:
      bot &&
      !pr.draft &&
      pr.reviewDecision !== 'APPROVED' &&
      pr.reviewDecision !== 'CHANGES_REQUESTED' &&
      pr.checks.every((c) => c.state === 'passing') &&
      pr.mergeable === 'MERGEABLE' &&
      notQueued &&
      ['BLOCKED', 'CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(pr.mergeStateStatus),
  };
}
export type PullRequestSignals = ReturnType<typeof deriveSignals>;
