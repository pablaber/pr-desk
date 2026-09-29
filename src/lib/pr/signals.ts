import type { CheckRule } from '../store/app-state';
import { matchesGlob } from './ignore';
import type { PullRequest } from './types';
export function deriveSignals(pr: PullRequest, login: string, checkRules: CheckRule[] = []) {
  const owned = pr.author.toLowerCase() === login.toLowerCase();
  const waitingOn = [
    ...new Set(
      pr.checks
        .filter(
          (c) =>
            c.state === 'pending' &&
            checkRules.some(
              (rule) =>
                matchesGlob(pr.repository, rule.repository) && matchesGlob(c.name, rule.check),
            ),
        )
        .map((c) => c.name),
    ),
  ];
  const checks = pr.checks.filter((c) => !(c.state === 'pending' && waitingOn.includes(c.name)));
  const approved =
    owned &&
    !pr.draft &&
    pr.reviewDecision === 'APPROVED' &&
    checks.every((c) => c.state === 'passing') &&
    pr.mergeable === 'MERGEABLE';
  return {
    pr,
    owned,
    directReviewRequested: pr.directReviewers.some((r) => r.toLowerCase() === login.toLowerCase()),
    trackedRepository: pr.reasons.includes('tracked-repository'),
    activeThreads: pr.activeUnresolvedThreads,
    changesRequested: pr.reviewDecision === 'CHANGES_REQUESTED',
    failedChecks: pr.checks.filter((c) => c.state === 'failed').length,
    checksRunning: checks.some((c) => c.state === 'pending'),
    checksPassing: checks.every((c) => c.state === 'passing'),
    waitingOn,
    conflict: pr.mergeable === 'CONFLICTING',
    // Strict definition, which the in-app merge relies on.
    ready:
      approved &&
      waitingOn.length === 0 &&
      ['CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(pr.mergeStateStatus),
    // GitHub reports a required pending check as BLOCKED and does not say which rule blocks,
    // so BLOCKED is tolerated only while a check the user marked non-blocking is pending.
    readyPendingChecks:
      approved &&
      waitingOn.length > 0 &&
      ['BLOCKED', 'CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(pr.mergeStateStatus),
  };
}
export type PullRequestSignals = ReturnType<typeof deriveSignals>;
