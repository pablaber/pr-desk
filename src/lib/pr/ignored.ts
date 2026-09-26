import type { AppState } from '../store/app-state';
import type { PullRequest } from './types';
import { describePullRequest } from './classify';

// Saved entries only hold the identifier and when it was ignored, so repository and number
// come from the identifier and the rest from whatever the last refresh could fetch.
export function ignoredPullRequests(local: AppState, prs: PullRequest[], login: string) {
  const byId = new Map(prs.map((pr) => [pr.id, pr]));
  return Object.entries(local.ignoredPullRequests)
    .sort(
      ([a, left], [b, right]) =>
        ignoredTime(right.ignoredAt) - ignoredTime(left.ignoredAt) || a.localeCompare(b),
    )
    .map(([id, { ignoredAt }]) => {
      const pr = byId.get(id);
      const [repository, number] = id.split('#');
      return {
        id,
        ignoredAt,
        repository,
        number,
        url: pr?.url ?? `https://github.com/${repository}/pull/${number}`,
        item: pr ? describePullRequest(pr, login) : null,
      };
    });
}

// An entry whose saved date does not parse sorts last rather than dropping out of the list.
function ignoredTime(ignoredAt: string): number {
  const parsed = Date.parse(ignoredAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}
