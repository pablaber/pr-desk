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
    accounts: { me: { trackingSince: 5, achievements: { century: {} } } },
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
        achievements: { century: {} },
      },
    },
  });
  expect(readHistoryFile({ version: 1 })).toEqual({ version: 1, accounts: {} });
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
  ])
    expect(() => readHistoryFile(value)).toThrow('Invalid history file');
});
