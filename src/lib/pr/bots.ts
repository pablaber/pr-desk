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

// Whether the bot made the latest non-merge commit. An App commit either links to the App's own
// `name[bot]` account, which no user can hold, or links to none and carries `name[bot]` as its
// git author name. Any other linked login is a user's.
export function isBotCommit(
  pr: Pick<PullRequest, 'author' | 'authorIsBot' | 'headAuthor'>,
): boolean {
  const { login, name } = pr.headAuthor;
  if (pr.author === '') return false;
  return pr.authorIsBot
    ? (login === '' ? name : login).toLowerCase() === knownBotKey(pr)
    : login.toLowerCase() === pr.author.toLowerCase();
}
