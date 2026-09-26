import { expect, it } from 'vitest';
import { defaultState } from '../store/app-state';
import { pr } from '../../test/fixtures';
import { ignoredPullRequests } from './ignored';

it('lists most recently ignored first and keeps entries whose details are unavailable', () => {
  const local = defaultState();
  local.ignoredPullRequests = {
    'acme/api#1': { ignoredAt: '2026-09-24T10:00:00Z' },
    'acme/api#7': { ignoredAt: '2026-09-25T10:00:00Z' },
    'acme/web#3': { ignoredAt: 'not a date' },
  };
  const rows = ignoredPullRequests(local, [pr()], 'me');
  expect(rows.map((row) => row.id)).toEqual(['acme/api#7', 'acme/api#1', 'acme/web#3']);
  expect(rows[0].item).toBeNull();
  expect(rows[0].repository).toBe('acme/api');
  expect(rows[0].number).toBe('7');
  expect(rows[0].url).toBe('https://github.com/acme/api/pull/7');
  expect(rows[1].item?.pr.title).toBe('Improve caching');
  expect(rows[1].item?.pr.author).toBe('me');
  expect(rows[1].url).toBe('https://github.com/acme/api/pull/1');
});

it('describes closed pull requests that are still ignored', () => {
  const local = defaultState();
  local.ignoredPullRequests = { 'acme/api#1': { ignoredAt: '2026-09-24T10:00:00Z' } };
  const rows = ignoredPullRequests(local, [pr({ state: 'CLOSED' })], 'me');
  expect(rows[0].item?.pr.state).toBe('CLOSED');
});
