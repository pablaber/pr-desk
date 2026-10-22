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
  baseRefName: string;
  headRefName: string;
  isCrossRepository: boolean;
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
      commit: {
        oid: string;
        statusCheckRollup: { contexts: Connection<RawCheck> } | null;
      };
    }[];
  };
  recentCommits?: {
    nodes: {
      commit: {
        oid?: string;
        parents?: { totalCount: number };
        author?: { name?: string | null; user: { login: string } | null } | null;
      };
    }[];
  };
  latestOpinionatedReviews?: {
    nodes: {
      state: string;
      author: { login: string } | null;
      commit: { oid: string } | null;
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
export interface RawHistoryPR {
  url: string;
  number: number;
  title: string;
  author: { __typename?: string; login: string } | null;
  repository: { nameWithOwner: string };
  createdAt: string;
  mergedAt: string | null;
  mergedBy: { login: string } | null;
  reviews: { nodes: { submittedAt: string }[] } | null;
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
  getHistoryPullRequests(search: string, login: string): Promise<RawHistoryPR[]>;
  validateRepository(repo: string): Promise<void>;
  getPullRequest(id: string, seed?: RawPR): Promise<PullRequest>;
}

export interface GhCliInfo {
  version: string;
  path: string;
}

// Facts about a failed gh call. The bridge only passes allowlisted, validated fields, never gh's
// output or GitHub's messages.
export interface GitHubRequestDetails {
  operation: string;
  // Shell-quoted, so it can be rerun in Terminal.
  command: string;
  // `exit` means gh failed without an HTTP response (or its output was not read, as for auth).
  failure: 'launch' | 'timeout' | 'exit' | 'http' | 'graphql' | 'invalid-response';
  exitStatus?: number;
  durationMs: number;
  httpStatus?: number;
  requestId?: string;
  rateLimit?: {
    resource?: string;
    limit?: number;
    remaining?: number;
    used?: number;
    resetAt?: string;
  };
  retryAfterSeconds?: number;
  graphqlErrors?: { type?: string; code?: string; path?: (string | number)[] }[];
}

export interface SourceWarning {
  message: string;
  details?: GitHubRequestDetails;
}
