import { load } from '@tauri-apps/plugin-store';
import type { AccountHistory, HistoryFile } from './types';

// Kept apart from preferences.json so history never travels with a settings export.
const FILE = 'history.json';

export async function loadHistoryFile(): Promise<HistoryFile> {
  const store = await load(FILE, { autoSave: false, defaults: {} });
  return readHistoryFile(await store.get('history'));
}

export async function saveHistoryFile(file: HistoryFile) {
  const store = await load(FILE, { autoSave: false, defaults: {} });
  await store.set('history', file);
  await store.save();
}

const invalid = () =>
  new Error(
    'Invalid history file. Your saved history has been left intact and will not be updated.',
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Fields added later are optional and default here, so adding one needs no version bump. Anything
// unrecognised throws, and the caller then stops writing so the file is never overwritten.
export function readHistoryFile(value: unknown): HistoryFile {
  if (value === null || value === undefined) return { version: 1, accounts: {} };
  if (!isRecord(value)) throw invalid();
  if (value.version !== 1)
    throw new Error(
      'Unsupported history version. Your saved history has been left intact and will not be updated.',
    );
  if (value.accounts !== undefined && !isRecord(value.accounts)) throw invalid();
  const accounts: Record<string, AccountHistory> = {};
  for (const [login, stored] of Object.entries(value.accounts ?? {})) {
    if (!isRecord(stored) || !Number.isFinite(stored.trackingSince)) throw invalid();
    const { syncedThrough = null, entries = {}, events = [] } = stored;
    if (syncedThrough !== null && !Number.isFinite(syncedThrough)) throw invalid();
    if (!isRecord(entries) || !Array.isArray(events)) throw invalid();
    accounts[login] = { ...stored, syncedThrough, entries, events } as AccountHistory;
  }
  return { ...value, version: 1, accounts };
}
