// GraphQL reports a bot as `dependabot`, while `gh pr view` reports `app/dependabot`.
export function botKey(login: string): string {
  return login
    .toLowerCase()
    .replace(/^app\//, '')
    .replace(/\[bot\]$/, '');
}

export function isKnownBot(author: string, knownBots: string[]): boolean {
  const key = botKey(author);
  return knownBots.some((bot) => botKey(bot) === key);
}
