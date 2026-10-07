import type { PullRequest } from '../pr/types';
export interface Connection<T> {
  nodes: T[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}
export interface RawCheck {
  __typename: string;
  name?: string;
  context?: string;
  status?: string;
  conclusion?: string;
  state?: string;
}
export interface RawPR {
  url: string;
  number: number;
  title: string;
  author: { __typename?: string; login: string } | null;
  repository: { nameWithOwner: string };
  state: PullRequest['state'];
  isDraft: boolean;
  updatedAt: string;
  reviewDecision: string | null;
  mergeable: string;
  mergeStateStatus: string;
  mergeQueueEntry?: { state: string; position: number } | null;
  autoMergeRequest?: { enabledAt: string | null } | null;
  reviewRequests: Connection<{ requestedReviewer: { __typename: string; login?: string } | null }>;
  reviewThreads: Connection<{ isResolved: boolean; isOutdated: boolean }>;
  commits: {
    nodes: {
      commit: { oid: string; statusCheckRollup: { contexts: Connection<RawCheck> } | null };
    }[];
  };
}
export interface RawMergedPR {
  url: string;
  number: number;
  title: string;
  author: { login: string } | null;
  repository: { nameWithOwner: string };
  mergedAt: string | null;
  mergedBy: { login: string } | null;
}
export type MergedSearchQualifier = 'author' | 'reviewed-by' | 'user-review-requested';
export interface GitHubService {
  authenticate(): Promise<void>;
  getCurrentUser(): Promise<{ login: string; avatarUrl: string }>;
  getOwnedPullRequests(ignoredRepositories?: string[]): Promise<RawPR[]>;
  getDirectReviewRequests(ignoredRepositories?: string[]): Promise<RawPR[]>;
  getRepositoryPullRequests(repo: string): Promise<RawPR[]>;
  getMergedPullRequests(
    qualifier: MergedSearchQualifier,
    since: string,
    ignoredRepositories?: string[],
  ): Promise<RawMergedPR[]>;
  getRepositoryMergedPullRequests(repo: string): Promise<RawMergedPR[]>;
  validateRepository(repo: string): Promise<void>;
  getPullRequest(id: string, seed?: RawPR): Promise<PullRequest>;
}

export interface GhCliInfo {
  version: string;
  path: string;
}
