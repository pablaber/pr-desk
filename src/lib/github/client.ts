import { invoke } from '@tauri-apps/api/core';
import { parsePullRequest, parseRepository } from '../store/app-state';
import { githubErrorMessage } from './errors';
import { normalize, rawConnections } from './normalize';
import { pullRequestQuery, repositoryQuery, searchQuery } from './queries';
import type { Connection, GitHubService, RawPR } from './types';
export type QueryRunner = <T>(query: string) => Promise<T>;
export class GhGitHubService implements GitHubService {
  constructor(
    private query: QueryRunner = async (query) => {
      try {
        return await invoke('github', { operation: 'graphql', query });
      } catch (error) {
        throw new Error(githubErrorMessage(error));
      }
    },
  ) {}
  async closeStalePullRequest(input: string) {
    const [repository, number] = parsePullRequest(input).split('#');
    await invoke('close_stale_pr', { url: `https://github.com/${repository}/pull/${number}` });
  }
  async authenticate() {
    await invoke('github', { operation: 'auth' });
  }
  async getCurrentUser() {
    return (
      await this.query<{ viewer: { login: string } }>('query DeskViewer { viewer { login } }')
    ).viewer.login;
  }
  private async search(search: string, ignoredRepositories: string[]): Promise<RawPR[]> {
    search = [
      search,
      ...[...new Set(ignoredRepositories.map(parseRepository))].map((repo) => `-repo:${repo}`),
    ].join(' ');
    const prs: RawPR[] = [];
    let cursor: string | null = null;
    do {
      const { search: result }: { search: Connection<RawPR> & { issueCount: number } } =
        await this.query<{ search: Connection<RawPR> & { issueCount: number } }>(
          searchQuery(search, cursor),
        );
      if (result.issueCount > 1000)
        throw new Error(
          'This source exceeds GitHub’s 1,000-result search limit. Narrow the account scope.',
        );
      prs.push(...result.nodes.filter(Boolean));
      cursor = continuationCursor(result, cursor);
    } while (cursor);
    return prs;
  }
  getOwnedPullRequests(ignoredRepositories: string[] = []) {
    return this.search('is:pr is:open author:@me', ignoredRepositories);
  }
  getDirectReviewRequests(ignoredRepositories: string[] = []) {
    return this.search('is:pr is:open user-review-requested:@me', ignoredRepositories);
  }
  async validateRepository(repo: string) {
    const data = await this.query<{ repository: unknown }>(
      repositoryQuery(parseRepository(repo), null, true),
    );
    if (!data.repository) throw new Error('GITHUB_REPOSITORY_NOT_FOUND');
  }
  async getRepositoryPullRequests(repo: string) {
    const prs: RawPR[] = [];
    let cursor: string | null = null;
    do {
      const data: { repository: { pullRequests: Connection<RawPR> } | null } = await this.query<{
        repository: { pullRequests: Connection<RawPR> } | null;
      }>(repositoryQuery(parseRepository(repo), cursor));
      if (!data.repository) throw new Error('Repository not found or inaccessible.');
      const result = data.repository.pullRequests;
      prs.push(...result.nodes.filter(Boolean));
      cursor = continuationCursor(result, cursor);
    } while (cursor);
    return prs;
  }
  async getPullRequest(input: string, seed?: RawPR) {
    const id = parsePullRequest(input);
    const first =
      seed ??
      (await this.query<{ repository: { pullRequest: RawPR | null } | null }>(pullRequestQuery(id)))
        .repository?.pullRequest;
    if (!first)
      throw new Error('PR not found or inaccessible. Saved preferences have been retained.');
    const raw = structuredClone(first);
    while (rawConnections(raw).some((p) => p?.pageInfo.hasNextPage)) {
      const pages = rawConnections(raw);
      const cursors = pages.map((p) => {
        if (!p?.pageInfo.hasNextPage) return undefined;
        if (!p.pageInfo.endCursor) throw new Error('Missing continuation cursor.');
        return p.pageInfo.endCursor;
      });
      const next = (
        await this.query<{ repository: { pullRequest: RawPR | null } | null }>(
          pullRequestQuery(id, cursors),
        )
      ).repository?.pullRequest;
      if (!next) throw new Error('PR not found or inaccessible.');
      if (
        cursors[2] !== undefined &&
        raw.commits.nodes[0]?.commit.oid !== next.commits?.nodes[0]?.commit.oid
      )
        throw new Error('Latest commit changed while fetching checks.');
      const nextPages = rawConnections(next);
      pages.forEach((target, i) => {
        if (cursors[i] === undefined || !target) return;
        const incoming = nextPages[i];
        if (
          !incoming ||
          (incoming.pageInfo.hasNextPage && incoming.pageInfo.endCursor === cursors[i])
        )
          throw new Error('Invalid connection continuation.');
        (target.nodes as unknown[]).push(...incoming.nodes);
        target.pageInfo = incoming.pageInfo;
      });
    }
    return normalize(raw);
  }
}

function continuationCursor(connection: Connection<unknown>, previous: string | null) {
  if (!connection.pageInfo.hasNextPage) return null;
  const cursor = connection.pageInfo.endCursor;
  if (!cursor || cursor === previous) throw new Error('Invalid discovery continuation cursor.');
  return cursor;
}
