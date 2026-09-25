import { dashboardRules, type DashboardRule } from './dashboard-rules';
import { deriveSignals } from './signals';
import type { PullRequest } from './types';
import type { AppState } from '../store/app-state';
export function classify(
  pr: PullRequest,
  login: string,
  local: AppState,
  now = Date.now(),
  rules: DashboardRule[] = dashboardRules,
) {
  if (
    pr.state !== 'OPEN' ||
    local.ignoredRepositories.some((repo) => repo.toLowerCase() === pr.repository.toLowerCase()) ||
    local.ignoredPullRequests[pr.id] ||
    Date.parse(local.snoozedPullRequests[pr.id]?.until ?? '') > now
  )
    return null;
  const signals = deriveSignals(pr, login);
  const matches = rules.filter((r) => r.matches(signals)).sort((a, b) => b.priority - a.priority);
  const primary = matches[0];
  return {
    pr,
    state: primary.state,
    priority: primary.priority,
    primary: primary.getLabel(signals),
    statuses: matches.filter((r) => r.id !== 'waiting').map((r) => r.getLabel(signals)),
  };
}
export type ClassifiedPR = NonNullable<ReturnType<typeof classify>>;
// GitHub does not expose when a PR first entered a triage state. updatedAt is the v1 approximation.
export function sortPullRequests(a: ClassifiedPR, b: ClassifiedPR) {
  if (a.state === 'needs-attention' && a.priority !== b.priority) return b.priority - a.priority;
  const delta = Date.parse(a.pr.updatedAt) - Date.parse(b.pr.updatedAt);
  return (a.state === 'waiting' ? -delta : delta) || a.pr.id.localeCompare(b.pr.id);
}
