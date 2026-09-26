import type { DashboardState } from './types';
import type { PullRequestSignals } from './signals';
export interface DashboardRule {
  id: string;
  state: DashboardState;
  priority: number;
  matches(s: PullRequestSignals): boolean;
  getLabel(s: PullRequestSignals): string;
  // Catch-all rules describe why a PR is on the desk, not something to act on, so they
  // never join the secondary status list.
  showAsStatus?: boolean;
}
export const dashboardRules: DashboardRule[] = [
  {
    id: 'review',
    state: 'needs-attention',
    priority: 100,
    matches: (s) => s.directReviewRequested,
    getLabel: () => 'Review requested',
  },
  {
    id: 'threads',
    state: 'needs-attention',
    priority: 90,
    matches: (s) => s.owned && s.activeThreads > 0,
    getLabel: (s) => `${s.activeThreads} unresolved thread${s.activeThreads === 1 ? '' : 's'}`,
  },
  {
    id: 'changes',
    state: 'needs-attention',
    priority: 80,
    matches: (s) => s.owned && s.changesRequested,
    getLabel: () => 'Changes requested',
  },
  {
    id: 'checks',
    state: 'needs-attention',
    priority: 70,
    matches: (s) => s.owned && s.failedChecks > 0,
    getLabel: () => 'Checks failed',
  },
  {
    id: 'conflict',
    state: 'needs-attention',
    priority: 60,
    matches: (s) => s.owned && s.conflict,
    getLabel: () => 'Merge conflict',
  },
  {
    id: 'ready',
    state: 'ready-to-merge',
    priority: 50,
    matches: (s) => s.ready,
    getLabel: () => 'Ready to merge',
  },
  {
    id: 'tracked-repository',
    state: 'needs-attention',
    priority: 10,
    matches: (s) => s.trackedRepository && !s.pr.draft,
    getLabel: () => 'Open in a tracked repository',
    showAsStatus: false,
  },
  {
    id: 'waiting',
    state: 'waiting',
    priority: 0,
    matches: () => true,
    showAsStatus: false,
    getLabel: (s) =>
      s.pr.draft
        ? 'Draft'
        : s.pr.checks.some((c) => c.state === 'pending')
          ? 'Checks running'
          : s.owned
            ? 'Waiting for review or merge requirements'
            : 'No action needed',
  },
];
