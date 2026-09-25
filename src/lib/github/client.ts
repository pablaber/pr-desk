import { invoke } from '@tauri-apps/api/core';
import { parsePullRequest, parseRepository } from '../store/app-state';
import { normalize } from './normalize';
import { pullRequestQuery, repositoryQuery, searchQuery } from './queries';
import type { Connection, GitHubService, RawPR } from './types';
export type QueryRunner = <T>(query: string) => Promise<T>;
export class GhGitHubService implements GitHubService {
  constructor(
    private query: QueryRunner = (query) => invoke('github', { operation: 'graphql', query }),
  ) {}
  async authenticate() {
    await invoke('github', { operation: 'auth' });
  }
  async getCurrentUser() {
    return (
      await this.query<{ viewer: { login: string } }>('query DeskViewer { viewer { login } }')
    ).viewer.login;
  }
  private async search(search: string): Promise<string[]> {
    const urls: string[] = [];
    let cursor: string | null = null;
    do {
      const { search: result }: { search: Connection<{ url: string }> & { issueCount: number } } =
        await this.query<{ search: Connection<{ url: string }> & { issueCount: number } }>(
          searchQuery(search, cursor),
        );
      if (result.issueCount > 1000)
        throw new Error(
          'This source exceeds GitHub’s 1,000-result search limit. Narrow the account scope.',
        );
      urls.push(...result.nodes.filter(Boolean).map((n) => parsePullRequest(n.url)));
      cursor = result.pageInfo.hasNextPage ? result.pageInfo.endCursor : null;
    } while (cursor);
    return urls;
  }
  getOwnedPullRequests() {
    return this.search('is:pr is:open author:@me');
  }
  getDirectReviewRequests() {
    return this.search('is:pr is:open user-review-requested:@me');
  }
  async validateRepository(repo: string) {
    const data = await this.query<{ repository: unknown }>(
      repositoryQuery(parseRepository(repo), null, true),
    );
    if (!data.repository)
      throw new Error('Repository not found or not accessible to your GitHub account.');
  }
  async getRepositoryPullRequests(repo: string) {
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const data: { repository: { pullRequests: Connection<{ url: string }> } | null } =
        await this.query<{ repository: { pullRequests: Connection<{ url: string }> } | null }>(
          repositoryQuery(parseRepository(repo), cursor),
        );
      if (!data.repository) throw new Error('Repository not found or inaccessible.');
      const result = data.repository.pullRequests;
      ids.push(...result.nodes.map((n) => parsePullRequest(n.url)));
      cursor = result.pageInfo.hasNextPage ? result.pageInfo.endCursor : null;
    } while (cursor);
    return ids;
  }
  async getPullRequest(input: string) {
    const id = parsePullRequest(input);
    const first = await this.query<{ repository: { pullRequest: RawPR | null } | null }>(
      pullRequestQuery(id),
    );
    const raw = first.repository?.pullRequest;
    if (!raw)
      throw new Error('PR not found or inaccessible. Saved preferences have been retained.');
    const connections = (pr: RawPR) => [
      pr.reviewRequests,
      pr.reviewThreads,
      pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts,
    ];
    let pages = connections(raw);
    while (pages.some((p) => p?.pageInfo.hasNextPage)) {
      const next = await this.query<{ repository: { pullRequest: RawPR } }>(
        pullRequestQuery(
          id,
          pages.map((p) => (p?.pageInfo.hasNextPage ? p.pageInfo.endCursor : null)),
        ),
      );
      const nextPages = connections(next.repository.pullRequest);
      const targets = connections(raw);
      pages.forEach((p, i) => {
        if (p?.pageInfo.hasNextPage && nextPages[i] && targets[i]) {
          // Connections are accumulated by position, keeping their distinct node types.
          (targets[i]!.nodes as unknown[]).push(...nextPages[i]!.nodes);
        }
      });
      pages = nextPages.map((p, i) => (pages[i]?.pageInfo.hasNextPage ? p : undefined));
    }
    return normalize(raw);
  }
}
