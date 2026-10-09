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
export interface CheckRule {
  repository: string;
  check: string;
}
// A lowercase #rrggbb hex value.
export type LabelColor = string;
export const SUGGESTED_LABEL_COLORS: LabelColor[] = [
  '#8a9483',
  '#3b82c4',
  '#2a9d8f',
  '#3f9b5a',
  '#d1a416',
  '#e0812b',
  '#d1483b',
  '#d0578f',
  '#8a5cc7',
  '#5b5fc7',
];
export interface PRLabel {
  id: string;
  name: string;
  color: LabelColor;
}
export type DockBadgeMode = 'off' | 'ready-to-merge' | 'needs-attention' | 'both';
export type InterfaceScale = 90 | 100 | 115 | 130;
export interface AppState {
  schemaVersion: 13;
  trackedRepositories: string[];
  ignoreRules: IgnoreRule[];
  checkRules: CheckRule[];
  watchedPullRequests: string[];
  knownBots: string[];
  ignoredPullRequests: Record<string, { ignoredAt: string }>;
  snoozedPullRequests: Record<string, { until: string }>;
  labels: PRLabel[];
  labeledPullRequests: Record<string, string[]>;
  settings: {
    automaticRefreshMinutes: number;
    snoozeOptions: SnoozeOption[];
    dockBadge: DockBadgeMode;
    interfaceScale: InterfaceScale;
    sidebarCollapsed: boolean;
  };
}
export const MAX_SNOOZE_OPTIONS = 5;
export const defaultSnoozeOptions = (): SnoozeOption[] => [
  { kind: 'duration', amount: 1, unit: 'hours' },
  { kind: 'duration', amount: 4, unit: 'hours' },
  { kind: 'duration', amount: 1, unit: 'days' },
  { kind: 'duration', amount: 1, unit: 'weeks' },
];
const defaultKnownBots = (): string[] => ['dependabot[bot]', 'renovate[bot]'];
export const defaultState = (): AppState => ({
  schemaVersion: 13,
  trackedRepositories: [],
  ignoreRules: [],
  checkRules: [],
  watchedPullRequests: [],
  knownBots: defaultKnownBots(),
  ignoredPullRequests: {},
  snoozedPullRequests: {},
  labels: [],
  labeledPullRequests: {},
  settings: {
    automaticRefreshMinutes: 5,
    snoozeOptions: defaultSnoozeOptions(),
    dockBadge: 'both',
    interfaceScale: 100,
    sidebarCollapsed: false,
  },
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
    checkRules?: unknown;
    labels?: unknown;
    labeledPullRequests?: unknown;
    knownBots?: unknown;
  };
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].includes(stored.schemaVersion))
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
    schemaVersion: 13,
    knownBots: readStoredKnownBots(stored),
    ignoreRules: readStoredIgnoreRules(stored),
    checkRules: readStoredCheckRules(stored),
    ...readStoredLabels(stored),
    settings: {
      automaticRefreshMinutes:
        stored.schemaVersion !== 1 && isRefreshInterval(minutes) ? minutes : 5,
      snoozeOptions:
        stored.schemaVersion >= 4
          ? readStoredSnoozeOptions(stored.settings?.snoozeOptions)
          : defaultSnoozeOptions(),
      dockBadge: readStoredDockBadge(stored),
      interfaceScale: readStoredInterfaceScale(stored),
      sidebarCollapsed: readStoredSidebarCollapsed(stored),
    },
  };
}
const DOCK_BADGE_MODES: DockBadgeMode[] = ['off', 'ready-to-merge', 'needs-attention', 'both'];
export function isDockBadgeMode(value: unknown): value is DockBadgeMode {
  return DOCK_BADGE_MODES.includes(value as DockBadgeMode);
}
// Like the snooze options, an invalid stored mode stops loading so the file is never overwritten.
function readStoredDockBadge(stored: { schemaVersion: number; settings?: unknown }): DockBadgeMode {
  if (stored.schemaVersion < 7) return 'both';
  const mode = (stored.settings as { dockBadge?: unknown } | undefined)?.dockBadge;
  if (mode === undefined) return 'both';
  if (!isDockBadgeMode(mode))
    throw new Error('Invalid preferences file. Your saved configuration has been left intact.');
  return mode;
}
const INTERFACE_SCALES: InterfaceScale[] = [90, 100, 115, 130];
export function isInterfaceScale(value: unknown): value is InterfaceScale {
  return INTERFACE_SCALES.includes(value as InterfaceScale);
}
export function stepInterfaceScale(current: InterfaceScale, direction: 1 | -1): InterfaceScale {
  const index = INTERFACE_SCALES.indexOf(current) + direction;
  return INTERFACE_SCALES[Math.min(INTERFACE_SCALES.length - 1, Math.max(0, index))];
}
function readStoredInterfaceScale(stored: {
  schemaVersion: number;
  settings?: unknown;
}): InterfaceScale {
  if (stored.schemaVersion < 10) return 100;
  const scale = (stored.settings as { interfaceScale?: unknown } | undefined)?.interfaceScale;
  if (scale === undefined) return 100;
  if (!isInterfaceScale(scale))
    throw new Error('Invalid preferences file. Your saved configuration has been left intact.');
  return scale;
}
function readStoredSidebarCollapsed(stored: { schemaVersion: number; settings?: unknown }) {
  if (stored.schemaVersion < 13) return false;
  const collapsed = (stored.settings as { sidebarCollapsed?: unknown } | undefined)
    ?.sidebarCollapsed;
  if (collapsed === undefined) return false;
  if (typeof collapsed !== 'boolean')
    throw new Error('Invalid preferences file. Your saved configuration has been left intact.');
  return collapsed;
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
      stored.schemaVersion >= 5
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
// A GitHub App is stored as `name[bot]` (gh shows it as `app/name`); a bare login is a machine user.
export function parseKnownBot(input: string): string {
  if (typeof input !== 'string') throw new Error('Enter a bot name.');
  const value = input.trim().toLowerCase();
  const app = /^app\//.test(value) || /\[bot\]$/.test(value);
  const name = value.replace(/^app\//, '').replace(/\[bot\]$/, '');
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name))
    throw new Error(
      'Enter a GitHub App as name[bot], such as renovate[bot], or a machine user by its login.',
    );
  return app ? `${name}[bot]` : name;
}
function readStoredKnownBots(stored: { schemaVersion: number; knownBots?: unknown }): string[] {
  if (stored.schemaVersion < 11) return defaultKnownBots();
  try {
    if (!Array.isArray(stored.knownBots)) throw new Error('Invalid bots');
    // Version 11 only held GitHub Apps and accepted their bare names.
    return [
      ...new Set(
        stored.knownBots.map((input) => {
          const bot = parseKnownBot(input);
          return stored.schemaVersion > 11 || bot.endsWith('[bot]') ? bot : `${bot}[bot]`;
        }),
      ),
    ];
  } catch {
    throw new Error('Invalid preferences file. Your saved configuration has been left intact.');
  }
}
export function parseCheckRule(repository: string, check: string): CheckRule {
  if (typeof check !== 'string') throw new Error('Enter a check name.');
  const name = check.trim().toLowerCase();
  if (!name || /[\u0000-\u001f\u007f]/.test(name))
    throw new Error('Enter a single-line check name, such as policy-bot or atlantis/*.');
  return { repository: parseRepositoryPattern(repository), check: name };
}
export function checkRuleKey(rule: CheckRule): string {
  return `${rule.repository}\u0000${rule.check}`;
}
function readStoredCheckRules(stored: {
  schemaVersion: number;
  checkRules?: unknown;
}): CheckRule[] {
  if (stored.schemaVersion < 6) return [];
  try {
    if (!Array.isArray(stored.checkRules)) throw new Error('Invalid rules');
    const parsed = stored.checkRules.map((rule) => parseCheckRule(rule?.repository, rule?.check));
    return [...new Map(parsed.map((rule) => [checkRuleKey(rule), rule])).values()];
  } catch {
    throw new Error('Invalid preferences file. Your saved configuration has been left intact.');
  }
}

export function parseLabelName(input: string): string {
  if (typeof input !== 'string') throw new Error('Enter a label name.');
  const name = input.trim();
  if (!name || /[\u0000-\u001f\u007f\u2028\u2029]/.test(name) || name.length > 32)
    throw new Error('Enter a single-line label name of 1 to 32 characters.');
  return name;
}
export function parseLabelColor(input: string): LabelColor {
  const match = typeof input === 'string' && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!match) throw new Error('Enter a hex color such as #3b82c4.');
  const hex = match[1].toLowerCase();
  return '#' + (hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex);
}
// Hue is free; saturation and lightness stay in a band that reads as a small dot on white.
export function randomLabelColor(random: () => number = Math.random): LabelColor {
  const h = random() * 360,
    s = 0.5 + random() * 0.25,
    l = 0.42 + random() * 0.14;
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
// Version 8 stored one of eight palette names; version 9 stores any hex color.
const V8_LABEL_COLORS: Record<string, LabelColor> = {
  gray: '#8a9483',
  blue: '#3b82c4',
  green: '#3f9b5a',
  yellow: '#d1a416',
  orange: '#e0812b',
  red: '#d1483b',
  purple: '#8a5cc7',
  pink: '#d0578f',
};
function readStoredLabelColor(schemaVersion: number, value: unknown): LabelColor {
  if (schemaVersion === 8) {
    if (typeof value === 'string' && Object.hasOwn(V8_LABEL_COLORS, value))
      return V8_LABEL_COLORS[value];
  } else if (typeof value === 'string' && /^#[0-9a-f]{6}$/.test(value)) return value;
  throw new Error('Invalid label color');
}
export function labelNameTaken(labels: PRLabel[], name: string, exceptId?: string): boolean {
  const key = name.trim().toLowerCase();
  return labels.some((label) => label.id !== exceptId && label.name.toLowerCase() === key);
}
// Like the ignore rules, malformed label data stops loading so the file is never overwritten.
// Assignments are canonicalized instead: ones pointing at a deleted label carry no information.
function readStoredLabels(stored: {
  schemaVersion: number;
  labels?: unknown;
  labeledPullRequests?: unknown;
}): Pick<AppState, 'labels' | 'labeledPullRequests'> {
  if (stored.schemaVersion < 8) return { labels: [], labeledPullRequests: {} };
  try {
    const { labels, labeledPullRequests } = stored;
    if (!Array.isArray(labels)) throw new Error('Invalid labels');
    if (!labeledPullRequests || typeof labeledPullRequests !== 'object')
      throw new Error('Invalid labels');
    const parsed = labels.map((label: Partial<PRLabel> | null): PRLabel => {
      if (typeof label?.id !== 'string' || !label.id) throw new Error('Invalid label');
      return {
        id: label.id,
        name: parseLabelName(label.name as string),
        color: readStoredLabelColor(stored.schemaVersion, label.color),
      };
    });
    const unique = [...new Map(parsed.map((label) => [label.id, label])).values()];
    if (new Set(unique.map((label) => label.name.toLowerCase())).size !== unique.length)
      throw new Error('Duplicate label');
    const known = new Set(unique.map((label) => label.id));
    const assignments: Record<string, string[]> = {};
    for (const [prId, ids] of Object.entries(labeledPullRequests)) {
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string'))
        throw new Error('Invalid assignments');
      const kept = [...new Set(ids as string[])].filter((id) => known.has(id));
      if (kept.length) assignments[prId] = kept;
    }
    return { labels: unique, labeledPullRequests: assignments };
  } catch {
    throw new Error('Invalid preferences file. Your saved configuration has been left intact.');
  }
}

// The Settings screen edits these lists locally and only writes them back on Save, so
// every other part of the preferences file — snoozes, individual ignores, refresh settings —
// stays free to change underneath an unsaved draft.
export type PreferenceDraft = Pick<
  AppState,
  'trackedRepositories' | 'ignoreRules' | 'checkRules' | 'watchedPullRequests' | 'knownBots'
>;
export function preferenceDraft(state: AppState): PreferenceDraft {
  return {
    trackedRepositories: [...state.trackedRepositories],
    ignoreRules: state.ignoreRules.map((rule) => ({ ...rule })),
    checkRules: state.checkRules.map((rule) => ({ ...rule })),
    watchedPullRequests: [...state.watchedPullRequests],
    knownBots: [...state.knownBots],
  };
}
export function draftDiffers(draft: PreferenceDraft, state: AppState): boolean {
  const same = (a: string[], b: string[]) =>
    a.length === b.length && a.every((value, index) => value === b[index]);
  return !(
    same(draft.trackedRepositories, state.trackedRepositories) &&
    same(draft.watchedPullRequests, state.watchedPullRequests) &&
    same(draft.knownBots, state.knownBots) &&
    same(draft.ignoreRules.map(ignoreRuleKey), state.ignoreRules.map(ignoreRuleKey)) &&
    same(draft.checkRules.map(checkRuleKey), state.checkRules.map(checkRuleKey))
  );
}

// Configuration only: per-PR state (ignored, snoozed, labeled PRs) stays on the Mac it belongs to.
export type SettingsConfig = Pick<
  AppState,
  | 'trackedRepositories'
  | 'watchedPullRequests'
  | 'knownBots'
  | 'ignoreRules'
  | 'checkRules'
  | 'labels'
  | 'settings'
>;
export function exportSettings(state: AppState, now: Date) {
  return {
    app: 'pr-desk',
    kind: 'settings',
    schemaVersion: state.schemaVersion,
    exportedAt: now.toISOString(),
    trackedRepositories: state.trackedRepositories,
    watchedPullRequests: state.watchedPullRequests,
    knownBots: state.knownBots,
    ignoreRules: state.ignoreRules,
    checkRules: state.checkRules,
    labels: state.labels,
    settings: state.settings,
  };
}
const GENERIC_STORED_ERROR =
  'Invalid preferences file. Your saved configuration has been left intact.';
function invalidSettingsExport(error: unknown): Error {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(
    `This settings export is invalid: ${
      reason === GENERIC_STORED_ERROR || error instanceof TypeError
        ? 'a rule, bot, label or setting has an invalid value.'
        : reason.replace(' Your saved configuration has been left intact.', '')
    }`,
  );
}
export function parseSettingsImport(text: string): SettingsConfig {
  let value: Record<string, unknown> | null;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("That isn't valid JSON.");
  }
  if (!value || typeof value !== 'object' || value.app !== 'pr-desk' || value.kind !== 'settings')
    throw new Error("This isn't a PR Desk settings export.");
  const { schemaVersion } = value;
  if (typeof schemaVersion === 'number' && schemaVersion > defaultState().schemaVersion)
    throw new Error('This export is from a newer PR Desk. Update PR Desk to import it.');
  try {
    const state = migrateState({
      schemaVersion,
      trackedRepositories: value.trackedRepositories,
      watchedPullRequests: value.watchedPullRequests,
      knownBots: value.knownBots,
      ignoreRules: value.ignoreRules,
      checkRules: value.checkRules,
      labels: value.labels,
      settings: value.settings,
      ignoredPullRequests: {},
      snoozedPullRequests: {},
      labeledPullRequests: {},
    });
    return {
      trackedRepositories: [...new Set(state.trackedRepositories.map(parseRepository))],
      watchedPullRequests: [...new Set(state.watchedPullRequests.map(parsePullRequest))],
      knownBots: state.knownBots,
      ignoreRules: state.ignoreRules,
      checkRules: state.checkRules,
      labels: state.labels,
      settings: state.settings,
    };
  } catch (error) {
    throw invalidSettingsExport(error);
  }
}
export function applySettingsImport(current: AppState, config: SettingsConfig): AppState {
  const known = new Set(config.labels.map((label) => label.id));
  const labeledPullRequests: Record<string, string[]> = {};
  for (const [id, ids] of Object.entries(current.labeledPullRequests)) {
    const kept = ids.filter((labelId) => known.has(labelId));
    if (kept.length) labeledPullRequests[id] = kept;
  }
  return { ...current, ...config, labeledPullRequests };
}
