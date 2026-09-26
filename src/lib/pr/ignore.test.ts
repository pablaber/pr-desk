import { expect, it } from 'vitest';
import { matchesGlob, exactIgnoredRepositories, ignoresPullRequest } from './ignore';
import { classify } from './classify';
import { defaultState, type IgnoreRule } from '../store/app-state';
import { pr } from '../../test/fixtures';

it.each([
  ['acme/api', 'ACME/API', true],
  ['acme/api-extra', 'acme/api', false],
  ['acme/api', 'acme/*', true],
  ['other/docs', '*/docs', true],
  ['acme/service-1', 'acme/service-?', true],
  ['acme/service-12', 'acme/service-?', false],
  ['acme/service-', 'acme/service-?', false],
  ['chore:', 'CHORE:*', true],
  ['fix: chore: test', 'chore:*', false],
  ['Update dependencies', '*dependenc*', true],
  ['[deps] bump (a.b)+', '[deps] bump (a.b)+', true],
  ['deps bump axb', '[deps] bump (a.b)+', false],
  ['', '*', true],
  ['', '?', false],
  ['x😀z', 'x?z', true],
  ['abcabcend', '*abc*end', true],
  ['abcdef', '*a**c*f*', true],
  ['abcdef', '*a*c*z', false],
])('matches %s against %s: %s', (value, pattern, expected) => {
  expect(matchesGlob(value, pattern)).toBe(expected);
});

it('handles many wildcard segments without exponential backtracking', () => {
  expect(matchesGlob('a'.repeat(10000), '*a'.repeat(100) + 'b')).toBe(false);
});

it('uses OR semantics, exact author logins and literal bot suffixes', () => {
  const rules: IgnoreRule[] = [
    { kind: 'repository', value: 'other/*' },
    { kind: 'author', value: 'DEPENDABOT[bot]' },
    { kind: 'title', value: 'chore:*' },
  ];
  expect(ignoresPullRequest(pr({ author: 'dependabot[bot]' }), rules)).toBe(true);
  expect(ignoresPullRequest(pr({ author: 'dependabot' }), rules)).toBe(false);
  expect(ignoresPullRequest(pr({ author: '' }), rules)).toBe(false);
  expect(ignoresPullRequest(pr({ title: 'Chore: bump' }), rules)).toBe(true);
  expect(ignoresPullRequest(pr({ repository: 'other/api' }), rules)).toBe(true);
  expect(exactIgnoredRepositories([...rules, { kind: 'repository', value: 'acme/api' }])).toEqual([
    'acme/api',
  ]);
});

it.each(['owned', 'direct-review-request', 'tracked-repository', 'watched'] as const)(
  'applies every rule type to %s and keeps individual ignores separate',
  (reason) => {
    const local = defaultState();
    const item = pr({ reasons: [reason] });
    for (const rule of [
      { kind: 'repository', value: 'acme/*' },
      { kind: 'author', value: 'ME' },
      { kind: 'title', value: '*CACHING' },
    ] satisfies IgnoreRule[]) {
      local.ignoreRules = [rule];
      expect(classify(item, 'me', local)).toBeNull();
      local.ignoreRules = [];
      expect(classify(item, 'me', local)).not.toBeNull();
    }
    local.ignoredPullRequests[item.id] = { ignoredAt: new Date().toISOString() };
    expect(classify(item, 'me', local)).toBeNull();
  },
);
