import { describe, expect, it } from 'vitest';
import { isKnownBot, knownBotKey } from './bots';

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
});
