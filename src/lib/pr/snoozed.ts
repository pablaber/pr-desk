import type { AppState } from '../store/app-state';
import type { PullRequest } from './types';
import { describePullRequest } from './classify';

export function snoozedPullRequests(
  local: AppState,
  prs: PullRequest[],
  login: string,
  now: number,
) {
  const byId = new Map(prs.map((pr) => [pr.id, pr]));
  return Object.entries(local.snoozedPullRequests)
    .filter(([, snooze]) => Date.parse(snooze.until) > now)
    .sort(
      ([a, left], [b, right]) =>
        Date.parse(left.until) - Date.parse(right.until) || a.localeCompare(b),
    )
    .map(([id, { until }]) => {
      const pr = byId.get(id);
      return { id, until, item: pr ? describePullRequest(pr, login) : null };
    });
}
