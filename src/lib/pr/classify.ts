import { ignoresPullRequest } from './ignore';
import { dashboardRules, type DashboardRule } from './dashboard-rules';
import { deriveSignals } from './signals';
import type { PullRequest } from './types';
import type { AppState, CheckRule } from '../store/app-state';
export function classify(
  pr: PullRequest,
  login: string,
  local: AppState,
  now = Date.now(),
  rules: DashboardRule[] = dashboardRules,
) {
  if (hiddenReason(pr, login, local, now)) return null;
  return describePullRequest(pr, login, local.checkRules, rules);
}
export type HiddenReason = 'not-open' | 'ignore-rule' | 'ignored' | 'snoozed' | 'others-draft';
export function hiddenReason(
  pr: PullRequest,
  login: string,
  local: AppState,
  now = Date.now(),
): HiddenReason | null {
  if (pr.state !== 'OPEN') return 'not-open';
  if (ignoresPullRequest(pr, local.ignoreRules)) return 'ignore-rule';
  if (local.ignoredPullRequests[pr.id]) return 'ignored';
  if (Date.parse(local.snoozedPullRequests[pr.id]?.until ?? '') > now) return 'snoozed';
  if (pr.draft && pr.author.toLowerCase() !== login.toLowerCase()) return 'others-draft';
  return null;
}
export function describePullRequest(
  pr: PullRequest,
  login: string,
  checkRules: CheckRule[] = [],
  rules: DashboardRule[] = dashboardRules,
) {
  const signals = deriveSignals(pr, login, checkRules);
  const matches = rules.filter((r) => r.matches(signals)).sort((a, b) => b.priority - a.priority);
  const primary = matches[0];
  return {
    pr,
    state: primary.state,
    priority: primary.priority,
    canMerge: signals.ready && primary.state === 'ready-to-merge',
    primary: primary.getLabel(signals),
    statuses: matches.filter((r) => r.showAsStatus !== false).map((r) => r.getLabel(signals)),
  };
}
export type ClassifiedPR = NonNullable<ReturnType<typeof classify>>;
// GitHub does not expose when a PR first entered a triage state. updatedAt is the v1 approximation.
export function sortPullRequests(a: ClassifiedPR, b: ClassifiedPR) {
  if (a.state === 'needs-attention' && a.priority !== b.priority) return b.priority - a.priority;
  const delta = Date.parse(a.pr.updatedAt) - Date.parse(b.pr.updatedAt);
  return (a.state === 'waiting' ? -delta : delta) || a.pr.id.localeCompare(b.pr.id);
}
