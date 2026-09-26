import { exactIgnoredRepositories, ignoresRepository } from '../pr/ignore';
import type { AppState } from '../store/app-state';
import type { PullRequest, TrackingReason } from '../pr/types';
import { parsePullRequest } from '../store/app-state';
import { completeSeed } from './normalize';
import type { GitHubService, RawPR } from './types';
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
  const ignored = exactIgnoredRepositories(local.ignoreRules);
  const include = (id: string) => !ignoresRepository(id.split('#')[0], local.ignoreRules);
  const jobs: { key: string; reason: TrackingReason; run: () => Promise<RawPR[]> }[] = [
    {
      key: 'owned',
      reason: 'owned',
      run: () => service.getOwnedPullRequests(ignored),
    },
    {
      key: 'reviews',
      reason: 'direct-review-request',
      run: () => service.getDirectReviewRequests(ignored),
    },
    ...local.trackedRepositories.filter(include).map((repo) => ({
      key: repo,
      reason: 'tracked-repository' as const,
      run: () => service.getRepositoryPullRequests(repo),
    })),
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
  const discoveries = new Map<string, RawPR[]>();
  await pool(jobs, async (job) => {
    try {
      const found = (await job.run()).filter((pr) => include(parsePullRequest(pr.url)));
      discoveries.set(job.key, found);
      sources[job.key] = [...new Set(found.map((pr) => parsePullRequest(pr.url)))];
    } catch (e) {
      sources[job.key] = (previous?.sources[job.key] ?? []).filter(include);
      warnings.push(`${job.key}: ${String(e)} Previous results retained.`);
      staleIds.push(...sources[job.key]);
    }
  });
  const seeds = new Map<string, RawPR>();
  for (const job of jobs)
    for (const candidate of discoveries.get(job.key) ?? []) {
      const id = parsePullRequest(candidate.url),
        old = seeds.get(id);
      if (
        !old ||
        Date.parse(candidate.updatedAt) > Date.parse(old.updatedAt) ||
        (candidate.updatedAt === old.updatedAt && completeSeed(candidate) && !completeSeed(old))
      )
        seeds.set(id, candidate);
    }
  sources.watched = [...new Set(local.watchedPullRequests.map(parsePullRequest).filter(include))];
  const reasons = new Map<string, Set<TrackingReason>>();
  for (const job of [...jobs, { key: 'watched', reason: 'watched' as const }])
    for (const id of sources[job.key]) {
      if (!reasons.has(id)) reasons.set(id, new Set());
      reasons.get(id)!.add(job.reason);
    }
  const prs: PullRequest[] = [];
  await pool([...reasons], async ([id, why]) => {
    try {
      prs.push({ ...(await service.getPullRequest(id, seeds.get(id))), reasons: [...why] });
    } catch (e) {
      warnings.push(`${id}: ${String(e)}`);
      staleIds.push(id);
      const old = previous?.prs.find((p) => p.id === id);
      if (old) prs.push({ ...old, reasons: [...why] });
    }
  });
  return { prs, sources, warnings, staleIds: [...new Set(staleIds)] };
}
