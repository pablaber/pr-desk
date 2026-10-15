import type { HistoryEntry, HistorySyncResult } from '../history/types';
import { parsePullRequest } from '../store/app-state';
import { pool } from './pool';
import type { GitHubService, RawHistoryPR } from './types';

function toEntry(raw: RawHistoryPR): HistoryEntry {
  return {
    id: parsePullRequest(raw.url),
    url: raw.url,
    repository: raw.repository.nameWithOwner,
    number: raw.number,
    title: raw.title,
    author: raw.author?.login ?? '',
    authorIsApp: raw.author?.__typename === 'Bot',
    createdAt: raw.createdAt,
    mergedAt: raw.mergedAt,
    mergedBy: raw.mergedBy?.login ?? null,
    approvedAt: raw.reviews?.nodes[0]?.submittedAt ?? null,
  };
}

// `since` is a YYYY-MM-DD day. Search cannot filter by who merged, so merges by you are found
// among PRs you wrote, reviewed or were asked to review, and those in tracked repositories.
export async function fetchHistory(
  service: Pick<GitHubService, 'getHistoryPullRequests'>,
  login: string,
  trackedRepositories: string[],
  since: string,
): Promise<HistorySyncResult> {
  const searches = [
    `is:pr is:merged author:@me merged:>=${since}`,
    `is:pr reviewed-by:@me updated:>=${since}`,
    `is:pr is:merged user-review-requested:@me merged:>=${since}`,
    ...trackedRepositories.map((repo) => `repo:${repo} is:pr is:merged merged:>=${since}`),
  ];
  const entries: HistoryEntry[] = [];
  const warnings: string[] = [];
  await pool(searches, async (search) => {
    try {
      entries.push(...(await service.getHistoryPullRequests(search, login)).map(toEntry));
    } catch (e) {
      warnings.push(`History sync (${search}): ${String(e)}`);
    }
  });
  return { entries, warnings, complete: warnings.length === 0 };
}
