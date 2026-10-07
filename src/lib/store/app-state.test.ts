import { expect, it } from 'vitest';
import {
  parsePullRequest,
  parseIgnoreRule,
  parseCheckRule,
  parseRepositoryPattern,
  parseRepository,
  parseKnownBot,
  snoozeUntil,
  defaultState,
  migrateState,
  isRefreshInterval,
  isDockBadgeMode,
  stepInterfaceScale,
  defaultSnoozeOptions,
  parseSnoozeOptions,
  snoozeOptionLabel,
  preferenceDraft,
  draftDiffers,
  parseLabelName,
  parseLabelColor,
  randomLabelColor,
  labelNameTaken,
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
    schemaVersion: 11,
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
  expect(() => migrateState({ ...defaultState(), schemaVersion: 12 })).toThrow('Unsupported');
});

it('migrates older preferences and validates ignored repositories', () => {
  for (const schemaVersion of [1, 2]) {
    const { ignoreRules: _, ...legacy } = defaultState();
    expect(
      migrateState({
        ...legacy,
        schemaVersion,
        trackedRepositories: ['acme/api'],
        settings: { automaticRefreshMinutes: 0 },
      }),
    ).toMatchObject({
      schemaVersion: 11,
      ignoreRules: [],
      trackedRepositories: ['acme/api'],
      settings: { automaticRefreshMinutes: schemaVersion === 1 ? 5 : 0 },
    });
  }
  expect(
    migrateState({
      ...defaultState(),
      schemaVersion: 4,
      ignoredRepositories: [' Acme/API ', 'acme/api'],
    }).ignoreRules,
  ).toEqual([{ kind: 'repository', value: 'acme/api' }]);
  for (const ignoredRepositories of [
    undefined,
    null,
    'acme/api',
    [42],
    ['invalid'],
    ['acme/api is:closed'],
  ])
    expect(() =>
      migrateState({ ...defaultState(), schemaVersion: 4, ignoredRepositories }),
    ).toThrow();
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
    expect(
      migrateState({ ...defaultState(), schemaVersion, ignoredRepositories: [] }).settings
        .snoozeOptions,
    ).toEqual(defaultSnoozeOptions());
  for (const snoozeOptions of [null, 'weekly', [{ kind: 'duration', amount: 0, unit: 'hours' }]])
    expect(() =>
      migrateState({ ...defaultState(), settings: { automaticRefreshMinutes: 5, snoozeOptions } }),
    ).toThrow('Invalid preferences file');
});

it('migrates all supported versions without losing independently saved preferences', () => {
  for (const schemaVersion of [1, 2, 3, 4]) {
    const legacy = {
      ...defaultState(),
      schemaVersion,
      ignoredRepositories: ['Acme/API', 'acme/api'],
      trackedRepositories: ['acme/api'],
      watchedPullRequests: ['acme/api#2'],
      ignoredPullRequests: { 'acme/api#1': { ignoredAt: '2026-01-01' } },
      snoozedPullRequests: { 'acme/api#2': { until: '2027-01-01' } },
      settings: { automaticRefreshMinutes: 12, snoozeOptions: [] },
    };
    const migrated = migrateState(legacy);
    expect(migrated.schemaVersion).toBe(11);
    expect(migrated.checkRules).toEqual([]);
    expect(migrated.ignoreRules).toEqual(
      schemaVersion >= 3 ? [{ kind: 'repository', value: 'acme/api' }] : [],
    );
    for (const key of [
      'trackedRepositories',
      'watchedPullRequests',
      'ignoredPullRequests',
      'snoozedPullRequests',
    ] as const)
      expect(migrated[key]).toEqual(legacy[key]);
    expect(migrated.settings.snoozeOptions).toEqual(
      schemaVersion === 4 ? [] : defaultSnoozeOptions(),
    );
    expect(migrated).not.toHaveProperty('ignoredRepositories');
    expect(migrateState(migrated)).toEqual(migrated);
  }
});

it('validates ignore rules and canonicalizes duplicates on load', () => {
  expect(parseRepositoryPattern(' AcMe/service-? ')).toBe('acme/service-?');
  expect(parseRepositoryPattern('*/docs')).toBe('*/docs');
  expect(parseIgnoreRule('author', ' Dependabot[bot] ')).toEqual({
    kind: 'author',
    value: 'dependabot[bot]',
  });
  expect(parseIgnoreRule('title', ' Chore:* ')).toEqual({ kind: 'title', value: 'chore:*' });
  for (const value of ['*', '/repo', 'acme/', 'acme/*/more', 'acme/[ab]', 'acme/* is:closed'])
    expect(() => parseRepositoryPattern(value)).toThrow();
  for (const value of ['', '@me', 'user*', 'a/b', 'a b', 'a[bot]extra', '-user'])
    expect(() => parseIgnoreRule('author', value)).toThrow();
  for (const value of ['', '   ', 'a\nb', 'a\tb'])
    expect(() => parseIgnoreRule('title', value)).toThrow();
  expect(
    migrateState({
      ...defaultState(),
      ignoreRules: [
        { kind: 'author', value: 'ME' },
        { kind: 'author', value: 'me' },
        { kind: 'title', value: 'ME' },
      ],
    }).ignoreRules,
  ).toEqual([
    { kind: 'author', value: 'me' },
    { kind: 'title', value: 'me' },
  ]);
  for (const ignoreRules of [
    undefined,
    null,
    {},
    [null],
    [{ kind: 'unknown', value: '*' }],
    [{ kind: 'title', value: 4 }],
    [{ kind: 'repository', value: 'invalid' }],
  ])
    expect(() => migrateState({ ...defaultState(), ignoreRules })).toThrow(
      'Invalid preferences file',
    );
});

it('drafts only the Settings lists and reports whether they differ from the saved state', () => {
  const state = {
    ...defaultState(),
    trackedRepositories: ['acme/api'],
    ignoreRules: [{ kind: 'author' as const, value: 'dependabot[bot]' }],
    watchedPullRequests: ['acme/api#1'],
    ignoredPullRequests: { 'acme/api#2': { ignoredAt: '2026-01-01' } },
  };
  const draft = preferenceDraft(state);
  expect(Object.keys(draft).sort()).toEqual([
    'checkRules',
    'ignoreRules',
    'knownBots',
    'trackedRepositories',
    'watchedPullRequests',
  ]);
  expect(draftDiffers(draft, state)).toBe(false);
  // A draft is a copy: editing it never reaches the saved state.
  draft.trackedRepositories.push('acme/web');
  expect(state.trackedRepositories).toEqual(['acme/api']);
  expect(draftDiffers(draft, state)).toBe(true);
  // Removing and re-adding the same values leaves nothing to save.
  expect(draftDiffers(preferenceDraft(state), { ...state, ignoreRules: [] })).toBe(true);
  expect(
    draftDiffers(preferenceDraft(state), {
      ...state,
      ignoredPullRequests: {},
      settings: { ...state.settings, automaticRefreshMinutes: 0, snoozeOptions: [] },
    }),
  ).toBe(false);
  // Order matters, so reordering a list is a change worth saving.
  expect(
    draftDiffers(
      { ...preferenceDraft(state), trackedRepositories: ['acme/web', 'acme/api'] },
      { ...state, trackedRepositories: ['acme/api', 'acme/web'] },
    ),
  ).toBe(true);
  expect(draftDiffers({ ...preferenceDraft(state), watchedPullRequests: [] }, state)).toBe(true);
});

it('validates check rules and canonicalizes them', () => {
  expect(parseCheckRule(' ACME/Terraform-* ', ' Policy-Bot ')).toEqual({
    repository: 'acme/terraform-*',
    check: 'policy-bot',
  });
  expect(parseCheckRule('acme/api', 'atlantis/*').check).toBe('atlantis/*');
  expect(() => parseCheckRule('acme', 'policy-bot')).toThrow('owner/repository');
  expect(() => parseCheckRule('acme/api', '  ')).toThrow('check name');
  expect(() => parseCheckRule('acme/api', 'bad\nname')).toThrow('check name');
});

it('migrates check rules without overwriting an invalid saved list', () => {
  expect(migrateState({ ...defaultState(), schemaVersion: 5 }).checkRules).toEqual([]);
  const rule = { repository: 'acme/*', check: 'policy-bot' };
  const stored = { ...defaultState(), checkRules: [rule, { ...rule, check: 'POLICY-BOT' }] };
  const migrated = migrateState(stored);
  expect(migrated.checkRules).toEqual([rule]);
  expect(migrateState(migrated)).toEqual(migrated);
  for (const checkRules of [undefined, 'x', [{ repository: 'nope', check: 'a' }], [{}]])
    expect(() => migrateState({ ...defaultState(), checkRules })).toThrow('left intact');
});

it('detects check rule edits in the draft', () => {
  const state = defaultState();
  const draft = preferenceDraft(state);
  draft.checkRules.push({ repository: 'acme/*', check: 'policy-bot' });
  expect(draftDiffers(draft, state)).toBe(true);
  expect(draftDiffers(draft, { ...state, checkRules: [...draft.checkRules] })).toBe(false);
});

it('defaults the dock badge to both, for new and pre-v7 preferences', () => {
  expect(defaultState().settings.dockBadge).toBe('both');
  const { dockBadge: _, ...settings } = defaultState().settings;
  for (const schemaVersion of [5, 6])
    expect(migrateState({ ...defaultState(), schemaVersion, settings }).settings.dockBadge).toBe(
      'both',
    );
  expect(migrateState({ ...defaultState(), settings }).settings.dockBadge).toBe('both');
});
it('keeps each valid dock badge mode and rejects an invalid stored one', () => {
  for (const dockBadge of ['off', 'ready-to-merge', 'needs-attention', 'both'])
    expect(
      migrateState({ ...defaultState(), settings: { ...defaultState().settings, dockBadge } })
        .settings.dockBadge,
    ).toBe(dockBadge);
  expect(() =>
    migrateState({
      ...defaultState(),
      settings: { ...defaultState().settings, dockBadge: 'everything' },
    }),
  ).toThrow('Invalid preferences file');
});
it('validates dock badge modes', () => {
  for (const mode of ['off', 'ready-to-merge', 'needs-attention', 'both'])
    expect(isDockBadgeMode(mode)).toBe(true);
  for (const mode of ['', 'Both', null, undefined, 1]) expect(isDockBadgeMode(mode)).toBe(false);
});

const label = (id: string, name: string, color = '#3b82c4') => ({ id, name, color });
it('loads pre-v8 preferences without labels', () => {
  for (const schemaVersion of [1, 5, 7]) {
    const migrated = migrateState({
      ...defaultState(),
      schemaVersion,
      ignoredRepositories: [],
      labels: [label('x', 'Ignored')],
      labeledPullRequests: { 'acme/api#1': ['x'] },
    });
    expect(migrated).toMatchObject({ schemaVersion: 11, labels: [], labeledPullRequests: {} });
  }
});
it('round-trips v8 labels and canonicalizes their assignments', () => {
  const stored = {
    ...defaultState(),
    labels: [label('a', 'Backend'), label('b', 'Urgent', '#d1483b'), label('a', 'Backend')],
    labeledPullRequests: {
      'acme/api#1': ['a', 'a', 'gone', 'b'],
      'acme/api#2': ['gone'],
      'acme/api#3': [],
    },
  };
  const migrated = migrateState(stored);
  expect(migrated.labels.map((l) => l.id)).toEqual(['a', 'b']);
  expect(migrated.labeledPullRequests).toEqual({ 'acme/api#1': ['a', 'b'] });
  expect(migrateState(migrated)).toEqual(migrated);
});
it('converts v8 palette names to hex colors', () => {
  const migrated = migrateState({
    ...defaultState(),
    schemaVersion: 8,
    labels: [label('a', 'Backend', 'blue'), label('b', 'Urgent', 'red')],
  });
  expect(migrated.labels.map((l) => l.color)).toEqual(['#3b82c4', '#d1483b']);
  for (const color of ['teal', '#3b82c4', 'toString'])
    expect(() =>
      migrateState({ ...defaultState(), schemaVersion: 8, labels: [label('a', 'A', color)] }),
    ).toThrow('left intact');
});
it('refuses malformed labels rather than overwriting them', () => {
  const bad: unknown[] = [
    'nope',
    [label('', 'Empty id')],
    [label('a', '')],
    [label('a', 'x'.repeat(33))],
    [label('a', 'Two\nlines')],
    [label('a', 'Odd', 'teal')],
    [label('a', 'Odd', 'blue')],
    [label('a', 'Odd', '#ABCDEF')],
    [label('a', 'Odd', '#abc')],
    [null],
    [label('a', 'Dup'), label('b', 'dup')],
  ];
  for (const labels of bad)
    expect(() => migrateState({ ...defaultState(), labels })).toThrow('left intact');
  for (const labeledPullRequests of [null, 'x', { 'acme/api#1': 'a' }, { 'acme/api#1': [1] }])
    expect(() => migrateState({ ...defaultState(), labeledPullRequests })).toThrow('left intact');
});
it('validates label names, colors and uniqueness', () => {
  expect(parseLabelName('  Backend  ')).toBe('Backend');
  expect(parseLabelName('x'.repeat(32))).toHaveLength(32);
  for (const name of ['', '   ', 'x'.repeat(33), 'a\nb', 'a\tb', 3 as unknown as string])
    expect(() => parseLabelName(name)).toThrow();
  expect(parseLabelColor(' #3B82C4 ')).toBe('#3b82c4');
  expect(parseLabelColor('abc')).toBe('#aabbcc');
  for (const color of ['', '#12345', '#ggg', 'blue', '#1234567', 3 as unknown as string])
    expect(() => parseLabelColor(color)).toThrow('hex color');
  for (const r of [0, 0.25, 0.5, 0.999])
    expect(randomLabelColor(() => r)).toMatch(/^#[0-9a-f]{6}$/);
  expect(randomLabelColor(() => 0)).toBe('#a13636');
  const labels = [label('a', 'Backend')] as never;
  expect(labelNameTaken(labels, ' backend ')).toBe(true);
  expect(labelNameTaken(labels, 'backend', 'a')).toBe(false);
  expect(labelNameTaken(labels, 'Frontend')).toBe(false);
});

it('defaults the interface scale to 100, for new and pre-v10 preferences', () => {
  expect(defaultState().settings.interfaceScale).toBe(100);
  const { interfaceScale: _, ...settings } = defaultState().settings;
  for (const schemaVersion of [9, 10])
    expect(
      migrateState({ ...defaultState(), schemaVersion, settings }).settings.interfaceScale,
    ).toBe(100);
});
it('keeps each valid interface scale and rejects an invalid stored one', () => {
  for (const interfaceScale of [90, 100, 115, 130])
    expect(
      migrateState({ ...defaultState(), settings: { ...defaultState().settings, interfaceScale } })
        .settings.interfaceScale,
    ).toBe(interfaceScale);
  expect(() =>
    migrateState({
      ...defaultState(),
      settings: { ...defaultState().settings, interfaceScale: 120 },
    }),
  ).toThrow('Invalid preferences file');
});
it('steps the interface scale and clamps at both ends', () => {
  expect(stepInterfaceScale(100, 1)).toBe(115);
  expect(stepInterfaceScale(100, -1)).toBe(90);
  expect(stepInterfaceScale(90, -1)).toBe(90);
  expect(stepInterfaceScale(130, 1)).toBe(130);
});

it('canonicalizes known bot names and rejects invalid ones', () => {
  for (const input of ['dependabot', ' Dependabot[bot] ', 'app/dependabot'])
    expect(parseKnownBot(input)).toBe('dependabot[bot]');
  for (const input of ['', 'octo cat', '-bot', 'a/b', '@dependabot'])
    expect(() => parseKnownBot(input)).toThrow();
});

it('seeds known bots when migrating from 10 and validates stored lists', () => {
  const v10 = { ...defaultState(), schemaVersion: 10 } as unknown as Record<string, unknown>;
  delete v10.knownBots;
  expect(migrateState(v10).knownBots).toEqual(['dependabot[bot]', 'renovate[bot]']);
  const v11 = { ...defaultState(), knownBots: ['Foo', 'foo[bot]', 'app/bar'] };
  expect(migrateState(v11).knownBots).toEqual(['foo[bot]', 'bar[bot]']);
  expect(migrateState({ ...defaultState(), knownBots: [] }).knownBots).toEqual([]);
  expect(() => migrateState({ ...defaultState(), knownBots: ['bad name'] })).toThrow(
    'Invalid preferences file',
  );
  expect(() => migrateState({ ...defaultState(), knownBots: undefined })).toThrow(
    'Invalid preferences file',
  );
});

it('detects known bot changes in the draft', () => {
  const state = defaultState();
  expect(draftDiffers({ ...preferenceDraft(state), knownBots: [] }, state)).toBe(true);
});
