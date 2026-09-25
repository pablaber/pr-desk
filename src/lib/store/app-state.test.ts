import { expect, it } from 'vitest';
import {
  parsePullRequest,
  parseRepository,
  snoozeUntil,
  defaultState,
  migrateState,
  isRefreshInterval,
} from './app-state';
it('validates and canonicalizes input', () => {
  expect(parseRepository(' Acme/API ')).toBe('acme/api');
  expect(parsePullRequest('https://github.com/Acme/API/pull/123/files')).toBe('acme/api#123');
  expect(parsePullRequest('Acme/API#123')).toBe('acme/api#123');
  for (const value of [
    'https://evil.test/acme/api/pull/1',
    'https://github.com/acme/api/issues/1',
    'acme/api#0',
  ])
    expect(() => parsePullRequest(value)).toThrow();
  expect(() => parseRepository('no-owner')).toThrow();
});
it('snoozes tomorrow and the next Monday at local 9 AM', () => {
  const monday = new Date(2026, 8, 21, 13);
  const tomorrow = new Date(snoozeUntil('tomorrow', monday));
  expect(tomorrow.getDate()).toBe(22);
  expect(tomorrow.getHours()).toBe(9);
  expect(new Date(snoozeUntil('monday', monday)).getDate()).toBe(28);
  expect(Date.parse(snoozeUntil('1h', monday)) - monday.getTime()).toBe(3600000);
});

it('defaults to five minutes and migrates reserved v1 settings without losing preferences', () => {
  expect(defaultState().settings.automaticRefreshMinutes).toBe(5);
  const legacy = {
    ...defaultState(),
    schemaVersion: 1,
    watchedPullRequests: ['acme/api#1'],
    settings: { automaticRefreshMinutes: 0 },
  };
  expect(migrateState(legacy)).toMatchObject({
    schemaVersion: 2,
    watchedPullRequests: ['acme/api#1'],
    settings: { automaticRefreshMinutes: 5 },
  });
});
it('preserves Never and all valid intervals, and repairs invalid stored intervals', () => {
  for (const minutes of [0, 1, 5, 37, 60]) {
    expect(
      migrateState({ ...defaultState(), settings: { automaticRefreshMinutes: minutes } }).settings
        .automaticRefreshMinutes,
    ).toBe(minutes);
  }
  for (const minutes of [-1, 61, 1.5, null, '5', undefined]) {
    expect(isRefreshInterval(minutes)).toBe(false);
    expect(
      migrateState({ ...defaultState(), settings: { automaticRefreshMinutes: minutes } }).settings
        .automaticRefreshMinutes,
    ).toBe(5);
  }
  expect(() => migrateState({ ...defaultState(), schemaVersion: 3 })).toThrow('Unsupported');
});
