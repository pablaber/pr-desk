import type { PullRequest } from './types';

// A known bot is a GitHub App, stored as `name[bot]`, or a machine user, stored as its bare login.
// The account type is part of the key, so a user account never passes for an App of the same name.
export function knownBotKey(pr: Pick<PullRequest, 'author' | 'authorIsBot'>): string {
  const login = pr.author.toLowerCase();
  return pr.authorIsBot ? `${login}[bot]` : login;
}

export function isKnownBot(
  pr: Pick<PullRequest, 'author' | 'authorIsBot'>,
  knownBots: string[],
): boolean {
  return pr.author !== '' && knownBots.includes(knownBotKey(pr));
}
