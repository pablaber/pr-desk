import { expect, it } from 'vitest';
import { defaultState } from '../store/app-state';
import { pr } from '../../test/fixtures';
import { snoozedPullRequests } from './snoozed';

it('sorts active snoozes soonest first, retains unavailable PRs, and excludes expired snoozes', () => {
  const local = defaultState();
  local.snoozedPullRequests = {
    'acme/api#1': { until: '2026-09-26T12:00:00Z' },
    'acme/api#2': { until: '2026-09-26T11:00:00Z' },
    'acme/api#3': { until: '2026-09-26T10:00:00Z' },
  };
  const rows = snoozedPullRequests(local, [pr()], 'me', Date.parse('2026-09-26T10:00:00Z'));
  expect(rows.map((row) => row.id)).toEqual(['acme/api#2', 'acme/api#1']);
  expect(rows[0].item).toBeNull();
  expect(rows[1].item?.pr.title).toBe('Improve caching');
});
