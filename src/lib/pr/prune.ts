import { ignoresRepository } from './ignore';
import type { DashboardSnapshot } from '../github/refresh';
import type { AppState } from '../store/app-state';

export interface PrunedPreferences {
  watchedPullRequests: string[];
  labeledPullRequests: Record<string, string[]>;
  snoozedPullRequests: AppState['snoozedPullRequests'];
}

// Watches, labels and snoozes only matter while a PR is live, so a refresh drops them for PRs
// that finished, and drops snoozes whose time is up. Anything whose state cannot be known — a
// failed fetch or discovery — is kept.
export function prunePreferences(
  local: AppState,
  snapshot: DashboardSnapshot,
  now: number,
): PrunedPreferences | null {
  const stale = new Set(snapshot.staleIds);
  const finished = new Set(
    snapshot.prs.filter((pr) => pr.state !== 'OPEN' && !stale.has(pr.id)).map((pr) => pr.id),
  );
  const tracked = new Set(Object.values(snapshot.sources).flat());
  // A repository ignore rule hides a PR without untracking it; removing the rule must not
  // have lost its labels.
  const untracked = (id: string) =>
    snapshot.discoveryComplete &&
    !tracked.has(id) &&
    !ignoresRepository(id.split('#')[0], local.ignoreRules);
  const watchedPullRequests = local.watchedPullRequests.filter((id) => !finished.has(id));
  const labeledPullRequests = Object.fromEntries(
    Object.entries(local.labeledPullRequests).filter(([id]) => !finished.has(id) && !untracked(id)),
  );
  const snoozedPullRequests = Object.fromEntries(
    Object.entries(local.snoozedPullRequests).filter(
      ([id, { until }]) => Date.parse(until) > now && !finished.has(id),
    ),
  );
  if (
    watchedPullRequests.length === local.watchedPullRequests.length &&
    Object.keys(labeledPullRequests).length === Object.keys(local.labeledPullRequests).length &&
    Object.keys(snoozedPullRequests).length === Object.keys(local.snoozedPullRequests).length
  )
    return null;
  return { watchedPullRequests, labeledPullRequests, snoozedPullRequests };
}
