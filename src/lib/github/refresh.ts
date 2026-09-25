import type { AppState } from '../store/app-state';
import type { PullRequest, TrackingReason } from '../pr/types';
import type { GitHubService } from './types';
export interface DashboardSnapshot {
  prs: PullRequest[];
  sources: Record<string, string[]>;
  warnings: string[];
  staleIds: string[];
}
export async function refreshDashboard(
  service: GitHubService,
  local: AppState,
  previous?: DashboardSnapshot,
): Promise<DashboardSnapshot> {
  const warnings: string[] = [],
    sources: Record<string, string[]> = {},
    staleIds: string[] = [];
  const ignored = new Set(local.ignoredRepositories.map((repo) => repo.toLowerCase()));
  const include = (id: string) => !ignored.has(id.split('#')[0].toLowerCase());
  const jobs: { key: string; reason: TrackingReason; run: () => Promise<string[]> }[] = [
    {
      key: 'owned',
      reason: 'owned',
      run: () => service.getOwnedPullRequests(local.ignoredRepositories),
    },
    {
      key: 'reviews',
      reason: 'direct-review-request',
      run: () => service.getDirectReviewRequests(local.ignoredRepositories),
    },
    ...local.trackedRepositories.filter(include).map((repo) => ({
      key: repo,
      reason: 'tracked-repository' as const,
      run: () => service.getRepositoryPullRequests(repo),
    })),
    { key: 'watched', reason: 'watched', run: async () => local.watchedPullRequests },
  ];
  // Bounded concurrency avoids spawning one gh process per PR at once.
  async function pool<T>(items: T[], work: (item: T) => Promise<void>) {
    let index = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, items.length) }, async () => {
        while (index < items.length) await work(items[index++]);
      }),
    );
  }
  await pool(jobs, async (job) => {
    try {
      sources[job.key] = (await job.run()).filter(include);
    } catch (e) {
      sources[job.key] = (previous?.sources[job.key] ?? []).filter(include);
      warnings.push(`${job.key}: ${String(e)} Previous results retained.`);
      staleIds.push(...sources[job.key]);
    }
  });
  const reasons = new Map<string, Set<TrackingReason>>();
  for (const job of jobs)
    for (const id of sources[job.key]) {
      if (!reasons.has(id)) reasons.set(id, new Set());
      reasons.get(id)!.add(job.reason);
    }
  const prs: PullRequest[] = [];
  await pool([...reasons], async ([id, why]) => {
    try {
      prs.push({ ...(await service.getPullRequest(id)), reasons: [...why] });
    } catch (e) {
      warnings.push(`${id}: ${String(e)}`);
      staleIds.push(id);
      const old = previous?.prs.find((p) => p.id === id);
      if (old) prs.push({ ...old, reasons: [...why] });
    }
  });
  return { prs, sources, warnings, staleIds: [...new Set(staleIds)] };
}
