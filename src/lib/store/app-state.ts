import { load } from '@tauri-apps/plugin-store';
export type SnoozeUnit = 'minutes' | 'hours' | 'days' | 'weeks';
export type SnoozeDay =
  'tomorrow' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type SnoozeOption =
  | { kind: 'duration'; amount: number; unit: SnoozeUnit }
  | { kind: 'next'; day: SnoozeDay; hour: number };
export type IgnoreRuleKind = 'repository' | 'author' | 'title';
export interface IgnoreRule {
  kind: IgnoreRuleKind;
  value: string;
}
export interface AppState {
  schemaVersion: 5;
  trackedRepositories: string[];
  ignoreRules: IgnoreRule[];
  watchedPullRequests: string[];
  ignoredPullRequests: Record<string, { ignoredAt: string }>;
  snoozedPullRequests: Record<string, { until: string }>;
  settings: { automaticRefreshMinutes: number; snoozeOptions: SnoozeOption[] };
}
export const MAX_SNOOZE_OPTIONS = 5;
export const defaultSnoozeOptions = (): SnoozeOption[] => [
  { kind: 'duration', amount: 1, unit: 'hours' },
  { kind: 'duration', amount: 4, unit: 'hours' },
  { kind: 'duration', amount: 1, unit: 'days' },
  { kind: 'duration', amount: 1, unit: 'weeks' },
];
export const defaultState = (): AppState => ({
  schemaVersion: 5,
  trackedRepositories: [],
  ignoreRules: [],
  watchedPullRequests: [],
  ignoredPullRequests: {},
  snoozedPullRequests: {},
  settings: { automaticRefreshMinutes: 5, snoozeOptions: defaultSnoozeOptions() },
});
export async function loadState(): Promise<AppState> {
  const store = await load('preferences.json', { autoSave: false, defaults: {} });
  const value = await store.get<AppState>('state');
  return migrateState(value);
}

export function migrateState(value: unknown): AppState {
  if (!value) return defaultState();
  const stored = value as Omit<AppState, 'schemaVersion'> & {
    schemaVersion: number;
    ignoredRepositories?: string[];
  };
  if (![1, 2, 3, 4, 5].includes(stored.schemaVersion))
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
    stored.schemaVersion >= 3 &&
    stored.schemaVersion <= 4 &&
    (!Array.isArray(stored.ignoredRepositories) ||
      stored.ignoredRepositories.some((repo) => typeof repo !== 'string'))
  )
    throw new Error('Invalid preferences file. Your saved configuration has been left intact.');
  // Version 1 reserved zero before polling existed; it was not a user choice of Never.
  const minutes = stored.settings?.automaticRefreshMinutes;
  return {
    ...defaultState(),
    trackedRepositories: stored.trackedRepositories,
    watchedPullRequests: stored.watchedPullRequests,
    ignoredPullRequests: stored.ignoredPullRequests,
    snoozedPullRequests: stored.snoozedPullRequests,
    schemaVersion: 5,
    ignoreRules: readStoredIgnoreRules(stored),
    settings: {
      automaticRefreshMinutes:
        stored.schemaVersion !== 1 && isRefreshInterval(minutes) ? minutes : 5,
      snoozeOptions:
        stored.schemaVersion >= 4
          ? readStoredSnoozeOptions(stored.settings?.snoozeOptions)
          : defaultSnoozeOptions(),
    },
  };
}
// A saved file that no longer validates must never be silently rewritten with defaults. An
// absent list is different from an empty one: only the empty list means "the user removed them".
function readStoredSnoozeOptions(value: unknown): SnoozeOption[] {
  if (value === undefined) return defaultSnoozeOptions();
  try {
    return parseSnoozeOptions(value);
  } catch {
    throw new Error('Invalid preferences file. Your saved configuration has been left intact.');
  }
}
export function isRefreshInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 60;
}
const SNOOZE_UNITS: SnoozeUnit[] = ['minutes', 'hours', 'days', 'weeks'];
const SNOOZE_DAYS: SnoozeDay[] = [
  'tomorrow',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];
export function parseSnoozeOptions(value: unknown): SnoozeOption[] {
  if (!Array.isArray(value)) throw new Error('Invalid snooze option.');
  if (value.length > MAX_SNOOZE_OPTIONS) throw new Error('Keep at most five snooze options.');
  const options = value.map(parseSnoozeOption);
  if (new Set(options.map(snoozeOptionKey)).size !== options.length)
    throw new Error('That snooze option is already configured.');
  return options;
}
function parseSnoozeOption(value: unknown): SnoozeOption {
  const option = value as Partial<SnoozeOption> | null;
  if (option?.kind === 'duration') {
    const { amount, unit } = option as { amount: unknown; unit: unknown };
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > 999)
      throw new Error('Enter a whole number from 1 to 999.');
    if (!SNOOZE_UNITS.includes(unit as SnoozeUnit)) throw new Error('Invalid snooze option.');
    return { kind: 'duration', amount, unit: unit as SnoozeUnit };
  }
  if (option?.kind === 'next') {
    const { day, hour } = option as { day: unknown; hour: unknown };
    if (!SNOOZE_DAYS.includes(day as SnoozeDay)) throw new Error('Invalid snooze option.');
    if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23)
      throw new Error('Invalid snooze option.');
    return { kind: 'next', day: day as SnoozeDay, hour };
  }
  throw new Error('Invalid snooze option.');
}
export function snoozeOptionKey(option: SnoozeOption): string {
  return option.kind === 'duration'
    ? `duration:${option.amount}:${option.unit}`
    : `next:${option.day}:${option.hour}`;
}
export function snoozeOptionLabel(option: SnoozeOption): string {
  if (option.kind === 'duration') {
    const unit = option.amount === 1 ? option.unit.slice(0, -1) : option.unit;
    return `${option.amount} ${unit}`;
  }
  const day = option.day === 'tomorrow' ? 'tomorrow' : capitalize(option.day);
  return `Until ${day}, ${formatHour(option.hour)}`;
}
function capitalize(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}
function formatHour(hour: number): string {
  return `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
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
const MINUTES_PER_UNIT: Record<SnoozeUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 60 * 24,
  weeks: 60 * 24 * 7,
};
export function snoozeUntil(option: SnoozeOption, now = new Date()): string {
  const date = new Date(now);
  if (option.kind === 'duration') {
    date.setMinutes(date.getMinutes() + option.amount * MINUTES_PER_UNIT[option.unit]);
    return date.toISOString();
  }
  // A weekday that is today means the next one, matching how "Until Monday" reads on a Monday.
  const target = SNOOZE_DAYS.indexOf(option.day) % 7;
  date.setDate(
    date.getDate() + (option.day === 'tomorrow' ? 1 : (target - date.getDay() + 7) % 7 || 7),
  );
  date.setHours(option.hour, 0, 0, 0);
  return date.toISOString();
}

export function parseRepositoryPattern(input: string): string {
  const value = input.trim().toLowerCase();
  if (!value.includes('*') && !value.includes('?')) return parseRepository(value);
  if (!/^[a-z0-9*?][a-z0-9*?-]*\/[a-z0-9_.*?-]+$/.test(value))
    throw new Error('Use owner/repository or a pattern such as acme/*, */docs, or acme/service-?.');
  return value;
}
export function parseIgnoreRule(kind: IgnoreRuleKind, input: string): IgnoreRule {
  if (typeof input !== 'string') throw new Error('Enter an ignore rule.');
  const value = input.trim().toLowerCase();
  if (kind === 'repository') return { kind, value: parseRepositoryPattern(value) };
  if (kind === 'author') {
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\[bot\])?$/.test(value))
      throw new Error(
        'Enter an exact GitHub login, such as octocat or dependabot[bot], without @.',
      );
    return { kind, value };
  }
  if (kind === 'title') {
    if (!value || /[\u0000-\u001f\u007f]/.test(value))
      throw new Error('Enter a single-line title pattern, such as *dependenc* or chore:*.');
    return { kind, value };
  }
  throw new Error('Choose Repository, PR author, or PR title.');
}
export function ignoreRuleKey(rule: IgnoreRule): string {
  return `${rule.kind}:${rule.value}`;
}
function readStoredIgnoreRules(stored: {
  schemaVersion: number;
  ignoreRules?: unknown;
  ignoredRepositories?: string[];
}): IgnoreRule[] {
  try {
    const rules =
      stored.schemaVersion === 5
        ? stored.ignoreRules
        : (stored.schemaVersion >= 3 ? stored.ignoredRepositories! : []).map((repo) => ({
            kind: 'repository',
            value: parseRepository(repo),
          }));
    if (!Array.isArray(rules)) throw new Error('Invalid rules');
    const parsed = rules.map((rule) => parseIgnoreRule(rule?.kind, rule?.value));
    return [...new Map(parsed.map((rule) => [ignoreRuleKey(rule), rule])).values()];
  } catch {
    throw new Error('Invalid preferences file. Your saved configuration has been left intact.');
  }
}

// The Settings screen edits these three lists locally and only writes them back on Save, so
// every other part of the preferences file — snoozes, individual ignores, refresh settings —
// stays free to change underneath an unsaved draft.
export type PreferenceDraft = Pick<
  AppState,
  'trackedRepositories' | 'ignoreRules' | 'watchedPullRequests'
>;
export function preferenceDraft(state: AppState): PreferenceDraft {
  return {
    trackedRepositories: [...state.trackedRepositories],
    ignoreRules: state.ignoreRules.map((rule) => ({ ...rule })),
    watchedPullRequests: [...state.watchedPullRequests],
  };
}
export function draftDiffers(draft: PreferenceDraft, state: AppState): boolean {
  const same = (a: string[], b: string[]) =>
    a.length === b.length && a.every((value, index) => value === b[index]);
  return !(
    same(draft.trackedRepositories, state.trackedRepositories) &&
    same(draft.watchedPullRequests, state.watchedPullRequests) &&
    same(draft.ignoreRules.map(ignoreRuleKey), state.ignoreRules.map(ignoreRuleKey))
  );
}
