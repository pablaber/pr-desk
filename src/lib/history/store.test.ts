import { expect, it } from 'vitest';
import { readHistoryFile } from './store';

it('starts empty when there is no history file yet', () => {
  expect(readHistoryFile(null)).toEqual({ version: 1, accounts: {} });
  expect(readHistoryFile(undefined)).toEqual({ version: 1, accounts: {} });
});

it('refuses a version it does not know rather than overwriting it', () => {
  expect(() => readHistoryFile({ version: 2, accounts: {} })).toThrow(
    'Unsupported history version',
  );
  expect(() => readHistoryFile({ accounts: {} })).toThrow('Unsupported history version');
});

it('defaults missing optional fields and keeps fields it does not know', () => {
  const file = readHistoryFile({
    version: 1,
    note: 'kept',
    accounts: { me: { trackingSince: 5, extra: 'kept' } },
  });
  expect(file).toEqual({
    version: 1,
    note: 'kept',
    accounts: {
      me: {
        trackingSince: 5,
        syncedThrough: null,
        entries: {},
        events: [],
        achievements: {},
        achievementsSeenAt: 0,
        extra: 'kept',
      },
    },
  });
  expect(readHistoryFile({ version: 1 })).toEqual({ version: 1, accounts: {} });
});

it('keeps stored achievements, including ones the catalog no longer has', () => {
  const achievements = {
    century: { firstSeenAt: 1, levels: [{ threshold: 100, at: 2, recordedAt: 3 }] },
    retired: { firstSeenAt: 1, levels: [] },
  };
  const file = readHistoryFile({
    version: 1,
    accounts: { me: { trackingSince: 1, achievements, achievementsSeenAt: 3 } },
  });
  expect(file.accounts.me).toMatchObject({ achievements, achievementsSeenAt: 3 });
});

it('rejects malformed accounts', () => {
  for (const value of [
    [],
    'history',
    { version: 1, accounts: [] },
    { version: 1, accounts: { me: {} } },
    { version: 1, accounts: { me: { trackingSince: 'today' } } },
    { version: 1, accounts: { me: { trackingSince: 1, syncedThrough: 'x' } } },
    { version: 1, accounts: { me: { trackingSince: 1, entries: [] } } },
    { version: 1, accounts: { me: { trackingSince: 1, events: {} } } },
    { version: 1, accounts: { me: { trackingSince: 1, achievements: [] } } },
    { version: 1, accounts: { me: { trackingSince: 1, achievements: { century: {} } } } },
    {
      version: 1,
      accounts: {
        me: {
          trackingSince: 1,
          achievements: { century: { firstSeenAt: 1, levels: [{ threshold: 100, at: 2 }] } },
        },
      },
    },
    { version: 1, accounts: { me: { trackingSince: 1, achievementsSeenAt: 'never' } } },
  ])
    expect(() => readHistoryFile(value)).toThrow('Invalid history file');
});
