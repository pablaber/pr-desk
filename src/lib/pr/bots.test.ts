import { describe, expect, it } from 'vitest';
import { botKey, isKnownBot } from './bots';

describe('bots', () => {
  it('normalizes the GraphQL, gh and bot-suffix forms to one key', () => {
    expect(botKey('dependabot')).toBe('dependabot');
    expect(botKey('app/dependabot')).toBe('dependabot');
    expect(botKey('Dependabot[bot]')).toBe('dependabot');
  });

  it('matches known bots in every author form', () => {
    const known = ['dependabot[bot]'];
    expect(isKnownBot('dependabot', known)).toBe(true);
    expect(isKnownBot('app/dependabot', known)).toBe(true);
    expect(isKnownBot('Dependabot[bot]', known)).toBe(true);
    expect(isKnownBot('renovate', known)).toBe(false);
    expect(isKnownBot('dependabot', [])).toBe(false);
  });
});
