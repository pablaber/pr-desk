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
  isRequired: boolean;
}
export interface RawPR {
  url: string;
  number: number;
  title: string;
  author: { login: string } | null;
  repository: { nameWithOwner: string };
  state: PullRequest['state'];
  isDraft: boolean;
  updatedAt: string;
  reviewDecision: string | null;
  mergeable: string;
  mergeStateStatus: string;
  reviewRequests: Connection<{ requestedReviewer: { __typename: string; login?: string } | null }>;
  reviewThreads: Connection<{ isResolved: boolean; isOutdated: boolean }>;
  commits: {
    nodes: { commit: { statusCheckRollup: { contexts: Connection<RawCheck> } | null } }[];
  };
}
export interface GitHubService {
  authenticate(): Promise<void>;
  getCurrentUser(): Promise<string>;
  getOwnedPullRequests(): Promise<string[]>;
  getDirectReviewRequests(): Promise<string[]>;
  getRepositoryPullRequests(repo: string): Promise<string[]>;
  validateRepository(repo: string): Promise<void>;
  getPullRequest(id: string): Promise<PullRequest>;
}
