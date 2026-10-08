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
    matches: (s) => s.managed && s.failedChecks > 0,
    getLabel: () => 'Checks failed',
  },
  {
    id: 'conflict',
    state: 'needs-attention',
    priority: 60,
    matches: (s) => s.managed && s.conflict,
    getLabel: () => 'Merge conflict',
  },
  {
    id: 'queued',
    state: 'waiting',
    priority: 55,
    matches: (s) => s.queued,
    getLabel: (s) => `Queued to merge${s.pr.mergeQueue ? ` · #${s.pr.mergeQueue.position}` : ''}`,
  },
  {
    id: 'auto-merge',
    state: 'waiting',
    priority: 54,
    matches: (s) => s.autoMerge && !s.queued,
    getLabel: () => 'Auto-merge enabled',
  },
  {
    id: 'ready',
    state: 'ready-to-merge',
    priority: 50,
    matches: (s) => s.ready,
    getLabel: () => 'Ready to merge',
  },
  {
    id: 'ready-pending-checks',
    state: 'ready-to-merge',
    priority: 50,
    matches: (s) => s.readyPendingChecks,
    getLabel: (s) => `Ready · ${s.waitingOn.join(', ')} pending`,
  },
  {
    id: 'tracked-repository',
    state: 'needs-attention',
    priority: 10,
    // Approval satisfies the tracked-repository review prompt; direct requests still apply.
    matches: (s) =>
      s.trackedRepository && !s.owned && !s.pr.draft && s.pr.reviewDecision !== 'APPROVED',
    getLabel: () => 'Waiting for your review',
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
        : s.checksRunning
          ? 'Checks running'
          : s.managed
            ? s.pr.reviewDecision === 'APPROVED'
              ? 'Waiting on merge requirements'
              : 'Waiting for review'
            : 'No action needed',
  },
];
