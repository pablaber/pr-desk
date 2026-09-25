export type TrackingReason = 'owned' | 'direct-review-request' | 'tracked-repository' | 'watched';
export type DashboardState = 'ready-to-merge' | 'needs-attention' | 'waiting';
export interface PullRequest {
  id: string;
  url: string;
  repository: string;
  number: number;
  title: string;
  author: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  draft: boolean;
  updatedAt: string;
  reviewDecision: string | null;
  mergeable: string;
  mergeStateStatus: string;
  directReviewers: string[];
  activeUnresolvedThreads: number;
  outdatedUnresolvedThreads: number;
  checks: { name: string; required: boolean; state: 'passing' | 'pending' | 'failed' }[];
  reasons: TrackingReason[];
}
