import { load } from '@tauri-apps/plugin-store';
export interface AppState {
  schemaVersion: 3;
  trackedRepositories: string[];
  ignoredRepositories: string[];
  watchedPullRequests: string[];
  ignoredPullRequests: Record<string, { ignoredAt: string }>;
  snoozedPullRequests: Record<string, { until: string }>;
  settings: { automaticRefreshMinutes: number };
}
export const defaultState = (): AppState => ({
  schemaVersion: 3,
  trackedRepositories: [],
  ignoredRepositories: [],
  watchedPullRequests: [],
  ignoredPullRequests: {},
  snoozedPullRequests: {},
  settings: { automaticRefreshMinutes: 5 },
});
export async function loadState(): Promise<AppState> {
  const store = await load('preferences.json', { autoSave: false, defaults: {} });
  const value = await store.get<AppState>('state');
  return migrateState(value);
}

export function migrateState(value: unknown): AppState {
  if (!value) return defaultState();
  const stored = value as Omit<AppState, 'schemaVersion'> & { schemaVersion: number };
  if (stored.schemaVersion !== 1 && stored.schemaVersion !== 2 && stored.schemaVersion !== 3)
    throw new Error(
      'Unsupported preferences version. Your saved configuration has been left intact.',
    );
  if (
    !Array.isArray(stored.trackedRepositories) ||
    !Array.isArray(stored.watchedPullRequests) ||
    !stored.ignoredPullRequests ||
    !stored.snoozedPullRequests
  )
    throw new Error('Invalid preferences file. Your saved configuration has been left intact.');
  if (
    stored.schemaVersion === 3 &&
    (!Array.isArray(stored.ignoredRepositories) ||
      stored.ignoredRepositories.some((repo) => typeof repo !== 'string'))
  )
    throw new Error('Invalid preferences file. Your saved configuration has been left intact.');
  // Version 1 reserved zero before polling existed; it was not a user choice of Never.
  const minutes = stored.settings?.automaticRefreshMinutes;
  return {
    ...defaultState(),
    ...stored,
    schemaVersion: 3,
    ignoredRepositories:
      stored.schemaVersion === 3
        ? [...new Set(stored.ignoredRepositories.map(parseRepository))]
        : [],
    settings: {
      automaticRefreshMinutes:
        stored.schemaVersion !== 1 && isRefreshInterval(minutes) ? minutes : 5,
    },
  };
}
export function isRefreshInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 60;
}

export async function saveState(state: AppState) {
  const store = await load('preferences.json', { autoSave: false, defaults: {} });
  await store.set('state', state);
  await store.save();
}
export function parseRepository(input: string): string {
  const repo = input.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\/[a-z0-9_.-]+$/.test(repo))
    throw new Error('Use owner/repository, for example acme/api.');
  return repo;
}
export function parsePullRequest(input: string): string {
  const value = input.trim();
  const match =
    value.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/([1-9]\d*)(?:[/?#].*)?$/i) ??
    value.match(/^([^/#]+\/[^/#]+)#([1-9]\d*)$/);
  if (!match) throw new Error('Enter a GitHub PR URL or owner/repository#123.');
  return `${parseRepository(match[1])}#${Number(match[2])}`;
}
export function snoozeUntil(option: string, now = new Date()): string {
  const date = new Date(now);
  if (option === '1h' || option === '4h')
    date.setHours(date.getHours() + (option === '1h' ? 1 : 4));
  else {
    date.setDate(date.getDate() + (option === 'monday' ? (8 - date.getDay()) % 7 || 7 : 1));
    date.setHours(9, 0, 0, 0);
  }
  return date.toISOString();
}
