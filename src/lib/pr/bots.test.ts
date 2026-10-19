import { describe, expect, it } from 'vitest';
import { isBotCommit, isKnownBot, knownBotKey } from './bots';

describe('bots', () => {
  it('keys GitHub Apps with a bot suffix and users by bare login', () => {
    expect(knownBotKey({ author: 'Dependabot', authorIsBot: true })).toBe('dependabot[bot]');
    expect(knownBotKey({ author: 'CI-User', authorIsBot: false })).toBe('ci-user');
  });

  it('matches known bots only with the same account type', () => {
    const known = ['dependabot[bot]', 'ci-user'];
    expect(isKnownBot({ author: 'dependabot', authorIsBot: true }, known)).toBe(true);
    expect(isKnownBot({ author: 'CI-User', authorIsBot: false }, known)).toBe(true);
    expect(isKnownBot({ author: 'dependabot', authorIsBot: false }, known)).toBe(false);
    expect(isKnownBot({ author: 'ci-user', authorIsBot: true }, known)).toBe(false);
    expect(isKnownBot({ author: 'renovate', authorIsBot: true }, known)).toBe(false);
    expect(isKnownBot({ author: '', authorIsBot: false }, [''])).toBe(false);
  });

  it('recognises the bot’s own commits by account type', () => {
    const app = (login: string, name: string) =>
      isBotCommit({ author: 'renovate', authorIsBot: true, headAuthor: { login, name } });
    const user = (login: string, name: string) =>
      isBotCommit({ author: 'ci-user', authorIsBot: false, headAuthor: { login, name } });
    expect(app('', 'Renovate[bot]')).toBe(true);
    expect(app('renovate', 'renovate[bot]')).toBe(false);
    expect(app('', 'renovate')).toBe(false);
    expect(app('', 'Pat')).toBe(false);
    expect(user('CI-User', 'CI')).toBe(true);
    expect(user('', 'ci-user')).toBe(false);
    expect(user('me', 'Me')).toBe(false);
    expect(
      isBotCommit({ author: '', authorIsBot: false, headAuthor: { login: '', name: '' } }),
    ).toBe(false);
  });
});
