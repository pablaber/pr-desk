export type TrackingReason = 'owned' | 'direct-review-request' | 'tracked-repository' | 'watched';
export type DashboardState = 'ready-to-merge' | 'needs-attention' | 'waiting';
export interface PullRequest {
  id: string;
  url: string;
  repository: string;
  number: number;
  title: string;
  headOid: string;
  author: string;
  // A GitHub App rather than a user account; GraphQL reports both by bare login.
  authorIsBot: boolean;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  draft: boolean;
  baseRefName: string;
  headRefName: string;
  // The head branch lives in a fork, so no other PR in the repository can be based on it.
  crossRepository: boolean;
  updatedAt: string;
  reviewDecision: string | null;
  mergeable: string;
  mergeStateStatus: string;
  mergeQueue: { state: string; position: number } | null;
  autoMerge: boolean;
  directReviewers: string[];
  activeUnresolvedThreads: number;
  outdatedUnresolvedThreads: number;
  checks: { name: string; state: 'passing' | 'pending' | 'failed' }[];
  reasons: TrackingReason[];
}
export interface CompletedPR {
  id: string;
  url: string;
  repository: string;
  number: number;
  title: string;
  author: string;
  mergedAt: string;
  mergedBy: string | null;
}
