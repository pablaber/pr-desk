import { expect, it } from 'vitest';
import {
  parsePullRequest,
  parseRepository,
  snoozeUntil,
  defaultState,
  migrateState,
  isRefreshInterval,
  defaultSnoozeOptions,
  parseSnoozeOptions,
  snoozeOptionLabel,
  type SnoozeOption,
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
const monday = new Date(2026, 8, 21, 13);
it('snoozes tomorrow and the next Monday at the configured local hour', () => {
  const tomorrow = new Date(snoozeUntil({ kind: 'next', day: 'tomorrow', hour: 9 }, monday));
  expect(tomorrow.getDate()).toBe(22);
  expect(tomorrow.getHours()).toBe(9);
  // A weekday that is today means the next one, never zero minutes from now.
  expect(new Date(snoozeUntil({ kind: 'next', day: 'monday', hour: 9 }, monday)).getDate()).toBe(
    28,
  );
  const friday = new Date(snoozeUntil({ kind: 'next', day: 'friday', hour: 17 }, monday));
  expect([friday.getDate(), friday.getHours()]).toEqual([25, 17]);
  expect(new Date(snoozeUntil({ kind: 'next', day: 'sunday', hour: 0 }, monday)).getDate()).toBe(
    27,
  );
});
it('snoozes for a duration measured from now', () => {
  const minutes = (option: SnoozeOption) =>
    (Date.parse(snoozeUntil(option, monday)) - monday.getTime()) / 60000;
  expect(minutes({ kind: 'duration', amount: 30, unit: 'minutes' })).toBe(30);
  expect(minutes({ kind: 'duration', amount: 4, unit: 'hours' })).toBe(240);
  expect(minutes({ kind: 'duration', amount: 1, unit: 'days' })).toBe(1440);
  expect(minutes({ kind: 'duration', amount: 1, unit: 'weeks' })).toBe(10080);
});
it('labels snooze options for the card menu', () => {
  expect(defaultSnoozeOptions().map(snoozeOptionLabel)).toEqual([
    '1 hour',
    '4 hours',
    '1 day',
    '1 week',
  ]);
  expect(snoozeOptionLabel({ kind: 'next', day: 'tomorrow', hour: 9 })).toBe(
    'Until tomorrow, 9 AM',
  );
  expect(snoozeOptionLabel({ kind: 'next', day: 'monday', hour: 13 })).toBe('Until Monday, 1 PM');
  expect(snoozeOptionLabel({ kind: 'next', day: 'friday', hour: 0 })).toBe('Until Friday, 12 AM');
});
it('validates configured snooze options', () => {
  expect(parseSnoozeOptions([])).toEqual([]);
  expect(parseSnoozeOptions(defaultSnoozeOptions())).toEqual(defaultSnoozeOptions());
  expect(() =>
    parseSnoozeOptions([...defaultSnoozeOptions(), { kind: 'duration', amount: 1, unit: 'hours' }]),
  ).toThrow('already configured');
  expect(() =>
    parseSnoozeOptions([
      ...defaultSnoozeOptions(),
      { kind: 'duration', amount: 2, unit: 'hours' },
      { kind: 'duration', amount: 3, unit: 'hours' },
    ]),
  ).toThrow('at most five');
  for (const option of [
    { kind: 'duration', amount: 0, unit: 'hours' },
    { kind: 'duration', amount: -1, unit: 'hours' },
    { kind: 'duration', amount: 1.5, unit: 'hours' },
    { kind: 'duration', amount: 1000, unit: 'hours' },
    { kind: 'duration', amount: Number.NaN, unit: 'hours' },
    { kind: 'duration', amount: '2', unit: 'hours' },
    { kind: 'duration', amount: 2, unit: 'fortnights' },
    { kind: 'next', day: 'someday', hour: 9 },
    { kind: 'next', day: 'monday', hour: 24 },
    { kind: 'next', day: 'monday', hour: -1 },
    { kind: 'next', day: 'monday' },
    { kind: 'elsewhen' },
    null,
    '1h',
  ])
    expect(() => parseSnoozeOptions([option])).toThrow();
  for (const value of [undefined, null, 'nope', {}])
    expect(() => parseSnoozeOptions(value)).toThrow();
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
    schemaVersion: 4,
    watchedPullRequests: ['acme/api#1'],
    settings: { automaticRefreshMinutes: 5, snoozeOptions: defaultSnoozeOptions() },
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
  expect(() => migrateState({ ...defaultState(), schemaVersion: 5 })).toThrow('Unsupported');
});

it('migrates older preferences and validates ignored repositories', () => {
  for (const schemaVersion of [1, 2]) {
    const { ignoredRepositories: _, ...legacy } = defaultState();
    expect(
      migrateState({
        ...legacy,
        schemaVersion,
        trackedRepositories: ['acme/api'],
        settings: { automaticRefreshMinutes: 0 },
      }),
    ).toMatchObject({
      schemaVersion: 4,
      ignoredRepositories: [],
      trackedRepositories: ['acme/api'],
      settings: { automaticRefreshMinutes: schemaVersion === 1 ? 5 : 0 },
    });
  }
  expect(
    migrateState({ ...defaultState(), ignoredRepositories: [' Acme/API ', 'acme/api'] })
      .ignoredRepositories,
  ).toEqual(['acme/api']);
  for (const ignoredRepositories of [
    undefined,
    null,
    'acme/api',
    [42],
    ['invalid'],
    ['acme/api is:closed'],
  ])
    expect(() => migrateState({ ...defaultState(), ignoredRepositories })).toThrow();
});

it('migrates snooze options and refuses to overwrite an invalid saved list', () => {
  const stored: SnoozeOption[] = [{ kind: 'next', day: 'monday', hour: 9 }];
  expect(
    migrateState({
      ...defaultState(),
      settings: { automaticRefreshMinutes: 5, snoozeOptions: stored },
    }).settings.snoozeOptions,
  ).toEqual(stored);
  // Removing every option is a real choice, so an empty list must survive the round trip.
  expect(
    migrateState({ ...defaultState(), settings: { automaticRefreshMinutes: 5, snoozeOptions: [] } })
      .settings.snoozeOptions,
  ).toEqual([]);
  // Pre-v4 files predate the setting and start from the defaults.
  for (const schemaVersion of [1, 2, 3])
    expect(migrateState({ ...defaultState(), schemaVersion }).settings.snoozeOptions).toEqual(
      defaultSnoozeOptions(),
    );
  for (const snoozeOptions of [null, 'weekly', [{ kind: 'duration', amount: 0, unit: 'hours' }]])
    expect(() =>
      migrateState({ ...defaultState(), settings: { automaticRefreshMinutes: 5, snoozeOptions } }),
    ).toThrow('Invalid preferences file');
});
