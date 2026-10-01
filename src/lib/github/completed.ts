import { exactIgnoredRepositories, ignoresRepository } from '../pr/ignore';
import type { CompletedPR } from '../pr/types';
import type { AppState } from '../store/app-state';
import { parsePullRequest } from '../store/app-state';
import { pool } from './pool';
import type { GitHubService, MergedSearchQualifier, RawMergedPR } from './types';

export const COMPLETED_DAYS = 7;

export interface CompletedSnapshot {
  prs: CompletedPR[];
  warnings: string[];
}

// Reviewing clears a review request, so "was in my review queue" needs both sources.
const searches: MergedSearchQualifier[] = ['author', 'reviewed-by', 'user-review-requested'];

// Merged PRs are not kept anywhere: each call asks GitHub again, mirroring the board's own
// discovery sources, so anything merged while the app was closed still shows up.
export async function fetchCompleted(
  service: GitHubService,
  local: AppState,
  now: number,
): Promise<CompletedSnapshot> {
  const cutoff = now - COMPLETED_DAYS * 86400000;
  const since = new Date(cutoff).toISOString().slice(0, 10);
  const ignored = exactIgnoredRepositories(local.ignoreRules);
  const jobs: { key: string; run: () => Promise<RawMergedPR[]> }[] = [
    ...searches.map((qualifier) => ({
      key: qualifier,
      run: () => service.getMergedPullRequests(qualifier, since, ignored),
    })),
    ...local.trackedRepositories
      .filter((repo) => !ignoresRepository(repo, local.ignoreRules))
      .map((repo) => ({ key: repo, run: () => service.getRepositoryMergedPullRequests(repo) })),
  ];
  const found = new Map<string, CompletedPR>();
  const warnings: string[] = [];
  await pool(jobs, async (job) => {
    try {
      for (const raw of await job.run()) {
        const mergedAt = raw.mergedAt ? Date.parse(raw.mergedAt) : NaN;
        if (!(mergedAt >= cutoff)) continue;
        const id = parsePullRequest(raw.url);
        if (ignoresRepository(id.split('#')[0], local.ignoreRules) || found.has(id)) continue;
        found.set(id, {
          id,
          url: raw.url,
          repository: raw.repository.nameWithOwner,
          number: raw.number,
          title: raw.title,
          author: raw.author?.login ?? '',
          mergedAt: raw.mergedAt!,
          mergedBy: raw.mergedBy?.login ?? null,
        });
      }
    } catch (e) {
      warnings.push(`${job.key}: ${String(e)}`);
    }
  });
  return { prs: [...found.values()], warnings };
}
