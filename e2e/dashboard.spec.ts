import { expect, test, type Page } from '@playwright/test';

// Collapsed by default: expand a Settings accordion section by its heading text before
// interacting with controls inside it.
async function expandSettingsSection(page: Page, heading: string) {
  await page.getByRole('button', { name: heading }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __TAURI_INTERNALS__: unknown;
      isTauri: boolean;
      opened: string[];
      refreshCount: number;
    };
    w.opened = [];
    w.refreshCount = 0;
    w.isTauri = true;
    const connection = (nodes: unknown[]) => ({
      nodes,
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    w.__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: Record<string, any>) => {
        if (command === 'plugin:store|load') return 1;
        if (command === 'plugin:store|get') {
          const value = localStorage.getItem('prefs');
          return [value ? JSON.parse(value) : null, !!value];
        }
        if (command === 'plugin:store|set') {
          localStorage.setItem('prefs', JSON.stringify(args.value));
          return;
        }
        if (command === 'plugin:store|save') return;
        if (command === 'plugin:opener|open_url') {
          w.opened.push(args.url);
          return;
        }
        if (command === 'close_stale_pr') {
          const calls = JSON.parse(localStorage.getItem('closeCalls') ?? '[]');
          calls.push(args.url);
          localStorage.setItem('closeCalls', JSON.stringify(calls));
          if (localStorage.getItem('closeFailure')) throw new Error('Repository access denied');
          return;
        }
        if (command !== 'github') throw new Error(`Unexpected command ${command}`);
        if (args.operation === 'auth') return null;
        const query = args.query as string;
        if (query.includes('DeskViewer')) return { viewer: { login: 'alex' } };
        if (query.includes('author:@me')) w.refreshCount++;
        if (query.includes('DeskSearch'))
          return {
            search: {
              issueCount: 3,
              ...connection(
                (query.includes('author:@me') ? [1, 2, 3] : [4]).map((n) => ({
                  url: `https://github.com/acme/platform/pull/${n}`,
                })),
              ),
            },
          };
        if (query.includes('DeskRepository'))
          return {
            repository: {
              nameWithOwner: 'acme/platform',
              pullRequests: connection(
                [1, 2, 3, 4].map((n) => ({ url: `https://github.com/acme/platform/pull/${n}` })),
              ),
            },
          };
        const number = Number(query.match(/pullRequest\(number: (\d+)/)?.[1]);
        return {
          repository: {
            pullRequest: {
              number,
              url: `https://github.com/acme/platform/pull/${number}`,
              title:
                [
                  'Reduce cache lookup latency',
                  'Refresh session token handling',
                  'Add audit event retention',
                  'Simplify deployment configuration',
                ][number - 1] ?? 'A watched pull request',
              repository: { nameWithOwner: 'acme/platform' },
              author: { login: number === 4 ? 'sam' : 'alex' },
              state: 'OPEN',
              isDraft: false,
              // Days since the last update, chosen to produce one card per staleness level.
              updatedAt: new Date(
                Date.now() - ([1 / 24, 10, 20, 30][number - 1] ?? 1 / 24) * 86400000,
              ).toISOString(),
              reviewDecision: number === 1 ? 'APPROVED' : number === 2 ? 'CHANGES_REQUESTED' : null,
              mergeable: 'MERGEABLE',
              mergeStateStatus: 'CLEAN',
              reviewRequests: connection(
                number === 4 ? [{ requestedReviewer: { __typename: 'User', login: 'alex' } }] : [],
              ),
              reviewThreads: connection(
                number === 2
                  ? Array.from({ length: 3 }, () => ({ isResolved: false, isOutdated: false }))
                  : [],
              ),
              commits: {
                nodes: [
                  {
                    commit: {
                      statusCheckRollup: {
                        contexts: connection([
                          {
                            __typename: 'CheckRun',
                            name: 'CI',
                            status: 'COMPLETED',
                            conclusion: 'SUCCESS',
                            isRequired: true,
                          },
                        ]),
                      },
                    },
                  },
                ],
              },
            },
          },
        };
      },
    };
  });
});

test('dashboard classification, source filters, browser action, and screenshot', async ({
  page,
}) => {
  await page.goto('/');
  const brandMark = page.locator('img.brand-mark');
  await expect(brandMark).toBeVisible();
  await expect(brandMark).toHaveJSProperty('naturalWidth', 1024);
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await expect(page.locator('.column').nth(0).locator('.pr-card')).toHaveCount(1);
  await expect(page.locator('.column').nth(1).locator('.pr-card')).toHaveCount(2);
  await expect(page.locator('.column').nth(2).locator('.pr-card')).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Open Reduce cache lookup latency on GitHub', exact: true })
    .click();
  expect(await page.evaluate(() => (window as any).opened)).toEqual([
    'https://github.com/acme/platform/pull/1',
  ]);
  const summaryCounts = page.locator('.summary b');
  await expect(summaryCounts).toHaveText(['1', '2', '1']);
  await page.getByRole('button', { name: 'Review requests', exact: true }).click();
  await expect(page.locator('.pr-card')).toHaveCount(1);
  // The summary reads the filtered board, so it always matches the column counts below it.
  await expect(summaryCounts).toHaveText(['0', '1', '0']);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(summaryCounts).toHaveText(['1', '2', '1']);
  await page.screenshot({ path: '.context/dashboard.png', fullPage: true });
});

test('cards show the author and the most severe stale badge', async ({ page }) => {
  await page.goto('/');
  const card = (title: string) => page.locator('.pr-card').filter({ hasText: title });
  await expect(card('Reduce cache lookup latency').locator('.author')).toHaveText('alex');
  await expect(card('Simplify deployment configuration').locator('.author')).toHaveText('sam');
  await expect(card('Reduce cache lookup latency').locator('.staleness')).toHaveCount(0);
  for (const [title, level] of [
    ['Refresh session token handling', 'low'],
    ['Add audit event retention', 'medium'],
    ['Simplify deployment configuration', 'high'],
  ]) {
    const badge = card(title).locator('.staleness');
    await expect(badge).toHaveText('Stale');
    await expect(badge).toHaveClass(`badge staleness ${level}`);
  }
  await page.screenshot({ path: '.context/stale-badges.png', fullPage: true });
});

test('cards show green approval and red changes-requested badges', async ({ page }) => {
  await page.goto('/');
  const card = (title: string) => page.locator('.pr-card').filter({ hasText: title });
  const approved = card('Reduce cache lookup latency').locator('.badge.review');
  await expect(approved).toHaveText('Approved');
  await expect(approved).toHaveCSS('color', 'rgb(50, 100, 67)');
  const changes = card('Refresh session token handling').locator('.badge.review');
  await expect(changes).toHaveText('Changes requested');
  await expect(changes).toHaveCSS('color', 'rgb(163, 58, 47)');
  await expect(card('Add audit event retention').locator('.badge.review')).toHaveCount(0);
  await expect(card('Simplify deployment configuration').locator('.badge.review')).toHaveCount(0);
  await page.screenshot({ path: '.context/review-badges.png', fullPage: true });
});

test('snooze, ignore, restore, watch, tracked repositories and persistence', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Actions for Refresh session token handling', exact: true })
    .click();
  await page.getByRole('button', { name: 'Snooze', exact: true }).click();
  await page.getByRole('button', { name: '1 hour', exact: true }).click();
  await expect(page.locator('.pr-card')).toHaveCount(3);
  await page
    .getByRole('button', { name: 'Actions for Add audit event retention', exact: true })
    .click();
  await page.getByRole('button', { name: 'Ignore PR', exact: true }).click();
  await expect(page.locator('.pr-card')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.pr-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Snoozed', exact: true }).click();
  await page.getByRole('button', { name: 'Restore now', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Ignored pull requests');
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expandSettingsSection(page, 'Tracked repositories');
  await page.getByRole('textbox', { name: 'Repository', exact: true }).fill('bad-repository');
  await page.getByRole('button', { name: 'Add repository' }).click();
  await expect(page.getByRole('alert')).toContainText('Use owner/repository');
  await page.getByRole('textbox', { name: 'Repository', exact: true }).fill('acme/platform');
  await page.getByRole('button', { name: 'Add repository' }).click();
  await expect(page.locator('.setting-row').filter({ hasText: 'acme/platform' })).toHaveCount(1);
  await expandSettingsSection(page, 'Watched pull requests');
  await page
    .getByRole('textbox', { name: 'Pull request URL' })
    .fill('https://github.com/acme/platform/pull/5');
  await page.getByRole('button', { name: 'Watch PR', exact: true }).click();
  await expect(page.locator('.setting-row').filter({ hasText: 'acme/platform#5' })).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.pr-card')).toHaveCount(5);
  // Tracking the repository moves its open PRs to Needs attention; the watched PR stays waiting.
  await expect(page.locator('.column').nth(0).locator('.pr-card')).toHaveCount(1);
  await expect(page.locator('.column').nth(1).locator('.pr-card')).toHaveCount(3);
  await expect(page.locator('.column').nth(2).locator('.pr-card')).toHaveCount(1);
  await expect(
    page.locator('.pr-card').filter({ hasText: 'Add audit event retention' }),
  ).toContainText('Open in a tracked repository');
  await page.screenshot({ path: '.context/tracked-repository.png', fullPage: true });
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('prefs')!));
  expect(Object.keys(persisted)).not.toContain('prs');
  expect(persisted.watchedPullRequests).toEqual(['acme/platform#5']);
});

test('the card menu dismisses on an outside click and nests snooze choices', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', {
    name: 'Actions for Refresh session token handling',
    exact: true,
  });
  const actions = page.getByRole('group', { name: 'PR actions' });
  const snoozeOptions = page.getByRole('group', { name: 'Snooze options' });
  const snooze = page.getByRole('button', { name: 'Snooze', exact: true });
  const cardBody = page.getByRole('button', {
    name: 'Open Refresh session token handling on GitHub',
    exact: true,
  });
  // A real click lands on whatever is topmost, so drive the mouse instead of the element.
  const clickOver = async (locator: typeof snooze) => {
    const box = (await locator.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  await trigger.click();
  await expect(actions).toBeVisible();
  await expect(snoozeOptions).toBeHidden();
  await expect(page.getByRole('button', { name: '1 hour', exact: true })).toBeHidden();
  await snooze.click();
  await expect(snoozeOptions).toBeVisible();
  // Clicking inside the popup or its submenu must not dismiss anything.
  await snoozeOptions.getByText('Snooze for').click();
  await expect(snoozeOptions).toBeVisible();
  await snooze.click();
  await expect(snoozeOptions).toBeHidden();
  await expect(actions).toBeVisible();
  await snooze.click();
  // One click outside closes the popup and the submenu, without opening the PR.
  await clickOver(page.getByRole('heading', { name: 'Pull requests', exact: true }));
  await expect(actions).toBeHidden();
  await expect(snoozeOptions).toBeHidden();
  expect(await page.evaluate(() => (window as any).opened)).toEqual([]);
  // A click on the card body behind the popup dismisses it instead of opening GitHub.
  await trigger.click();
  await clickOver(cardBody);
  await expect(actions).toBeHidden();
  expect(await page.evaluate(() => (window as any).opened)).toEqual([]);
  // The submenu does not stay open across reopens.
  await trigger.click();
  await expect(actions).toBeVisible();
  await expect(snoozeOptions).toBeHidden();
  await trigger.click();
  await expect(actions).toBeHidden();
});

test('configured snooze options drive the card menu, capped at five with Custom date last', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Snooze options');
  const limit = page.getByText('Five snooze options is the maximum');
  const add = page.getByRole('button', { name: 'Add snooze option', exact: true });
  await expect(limit).toBeHidden();
  // A fifth option fills the list; the add row is replaced by the limit message.
  await page.getByRole('spinbutton', { name: 'New snooze option amount' }).fill('2');
  await add.click();
  await expect(limit).toBeVisible();
  await expect(add).toBeHidden();
  // Re-adding the same duration is rejected without disturbing the saved list.
  await page.getByRole('button', { name: 'Remove snooze option 2 hours' }).click();
  await page.getByRole('spinbutton', { name: 'New snooze option amount' }).fill('4');
  await add.click();
  await expect(page.getByRole('alert')).toContainText('already configured');
  // Editing in place: the first option becomes an anchored day instead of a duration.
  await page.getByRole('combobox', { name: 'Snooze option 1 kind' }).selectOption('next');
  await page.getByRole('combobox', { name: 'Snooze option 1 day' }).selectOption('monday');
  await page.getByRole('combobox', { name: 'Snooze option 1 hour' }).selectOption('9');
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await expect(
    page.getByRole('button', { name: 'Remove snooze option Until Monday, 9 AM' }),
  ).toBeVisible();
  // The Next row (option 1) and a Duration row (option 2) share a column layout even
  // though their controls differ, so their kind, Save, and Remove columns line up.
  const rows = page.locator('.snooze-option-row');
  const nextKindBox = await rows.nth(0).getByRole('combobox').first().boundingBox();
  const durationKindBox = await rows.nth(1).getByRole('combobox').first().boundingBox();
  expect(nextKindBox!.x).toBeCloseTo(durationKindBox!.x, 0);
  expect(nextKindBox!.width).toBeCloseTo(durationKindBox!.width, 0);
  const nextSaveBox = await rows.nth(0).getByRole('button', { name: 'Save' }).boundingBox();
  const durationSaveBox = await rows.nth(1).getByRole('button', { name: 'Save' }).boundingBox();
  expect(nextSaveBox!.x).toBeCloseTo(durationSaveBox!.x, 0);
  const nextRemoveBox = await rows
    .nth(0)
    .getByRole('button', { name: /Remove/ })
    .boundingBox();
  const durationRemoveBox = await rows
    .nth(1)
    .getByRole('button', { name: /Remove/ })
    .boundingBox();
  expect(nextRemoveBox!.x).toBeCloseTo(durationRemoveBox!.x, 0);
  await page.screenshot({ path: '.context/snooze-options-settings.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: /Dashboard/ }).click();
  await page
    .getByRole('button', { name: 'Actions for Refresh session token handling', exact: true })
    .click();
  await page.getByRole('button', { name: 'Snooze', exact: true }).click();
  const options = page.getByRole('group', { name: 'Snooze options' });
  await expect(options.getByRole('button')).toHaveText([
    'Until Monday, 9 AM',
    '4 hours',
    '1 day',
    '1 week',
    'Snooze until custom date',
  ]);
  await page.screenshot({ path: '.context/snooze-options-menu.png', fullPage: true });
  await options.getByRole('button', { name: '1 week', exact: true }).click();
  await expect(page.locator('.pr-card')).toHaveCount(3);
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('prefs')!));
  expect(persisted.settings.snoozeOptions[0]).toEqual({ kind: 'next', day: 'monday', hour: 9 });
});

test('removing every snooze option leaves Custom date alone in the menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Snooze options');
  for (let remaining = 4; remaining > 0; remaining--)
    await page
      .getByRole('button', { name: /^Remove snooze option/ })
      .first()
      .click();
  await expect(page.getByText('No snooze options configured')).toBeVisible();
  await page.screenshot({ path: '.context/snooze-options-empty.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: /Dashboard/ }).click();
  await page
    .getByRole('button', { name: 'Actions for Refresh session token handling', exact: true })
    .click();
  await page.getByRole('button', { name: 'Snooze', exact: true }).click();
  const options = page.getByRole('group', { name: 'Snooze options' });
  await expect(options.getByText('Snooze for')).toBeHidden();
  await expect(options.getByRole('button')).toHaveText(['Snooze until custom date']);
});

test('auto refresh defaults to five minutes, reschedules, and persists Never', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const count = () => page.evaluate(() => (window as any).refreshCount);
  const refresh = page.getByRole('button', { name: '↻ Refresh', exact: true });
  await expect(refresh).toBeEnabled();
  expect(await count()).toBe(1);
  await page.clock.runFor(299_000);
  expect(await count()).toBe(1);
  await page.clock.runFor(1_000);
  await expect.poll(count).toBe(2);
  await expect(refresh).toBeEnabled();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const interval = page.getByRole('spinbutton', { name: 'Refresh interval in minutes' });
  await expect(interval).toHaveValue('5');
  await interval.fill('1');
  await interval.press('Enter');
  await expect(interval).toBeEnabled();
  await page.clock.runFor(60_000);
  await expect.poll(count).toBe(3);
  await expect(refresh).toBeEnabled();
  await page.clock.runFor(30_000);
  await refresh.click();
  await expect.poll(count).toBe(4);
  await expect(refresh).toBeEnabled();
  await page.clock.runFor(30_000);
  expect(await count()).toBe(4);
  await page.clock.runFor(30_000);
  await expect.poll(count).toBe(5);
  await expect(interval).toBeEnabled();
  await interval.fill('60');
  await interval.press('Enter');
  await expect(interval).toBeEnabled();
  await page.clock.fastForward(59 * 60_000);
  expect(await count()).toBe(5);
  await page.clock.runFor(60_000);
  await expect.poll(count).toBe(6);
  await expect(interval).toBeEnabled();
  await page.getByLabel('Never', { exact: true }).check();
  await expect(interval).toBeDisabled();
  await page.clock.fastForward(2 * 60 * 60_000);
  expect(await count()).toBe(6);
  await page.reload();
  await expect(refresh).toBeEnabled();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Never', { exact: true })).toBeChecked();
  await expect(interval).toBeDisabled();
  await page.clock.fastForward(2 * 60 * 60_000);
  expect(await count()).toBe(1);
  await refresh.click();
  await expect.poll(count).toBe(2);
});

test('automatic refresh does not overlap a slow manual refresh', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const refresh = page.getByRole('button', { name: '↻ Refresh', exact: true });
  await expect(refresh).toBeEnabled();
  await page.evaluate(() => {
    const w = window as any;
    const invoke = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      const result = await invoke(command, args);
      if (args?.query?.includes('author:@me'))
        await new Promise((resolve) => {
          w.releaseRefresh = resolve;
        });
      return result;
    };
  });
  await refresh.click();
  await expect(page.getByRole('button', { name: '↻ Refreshing…' })).toBeDisabled();
  await page.clock.fastForward(10 * 60_000);
  expect(await page.evaluate(() => (window as any).refreshCount)).toBe(2);
  await page.evaluate(() => (window as any).releaseRefresh());
  await expect(refresh).toBeEnabled();
});

test('refresh slider and numeric input stay synchronized and validate exact values', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Refresh interval', exact: true });
  const number = page.getByRole('spinbutton', { name: 'Refresh interval in minutes' });
  await expect(number).toHaveValue('5');
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(number).toHaveValue('6');
  await expect(number).toBeEnabled();
  await number.fill('37');
  await number.press('Enter');
  await expect(slider).toHaveValue('37');
  await expect(number).toBeEnabled();
  for (const invalid of ['61', '0', '1.5', '']) {
    await number.fill(invalid);
    await number.press('Enter');
    await expect(page.getByRole('alert')).toContainText('whole number from 1 to 60');
    await expect(number).toHaveValue('37');
  }
  await page.getByLabel('Never', { exact: true }).check();
  await expect(slider).toBeDisabled();
  await expect(number).toBeDisabled();
  await expect(page.getByLabel('Never', { exact: true })).toBeEnabled();
  await page.getByLabel('Never', { exact: true }).uncheck();
  await expect(number).toBeEnabled();
  await expect(number).toHaveValue('37');
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(number).toHaveValue('37');
  await page.screenshot({ path: '.context/refresh-settings.png', fullPage: true });
});

test('ignored repositories validate, persist, override tracking, and can be removed', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Tracked repositories');
  await page.getByRole('textbox', { name: 'Repository', exact: true }).fill('acme/platform');
  await page.getByRole('button', { name: 'Add repository' }).click();
  await expandSettingsSection(page, 'Watched pull requests');
  await page.getByRole('textbox', { name: 'Pull request URL' }).fill('acme/platform#5');
  await page.getByRole('button', { name: 'Watch PR', exact: true }).click();
  await expandSettingsSection(page, 'Ignored repositories');
  const input = page.getByRole('textbox', { name: 'Ignored repository', exact: true });
  await input.fill('invalid');
  await page.getByRole('button', { name: 'Ignore repository', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Use owner/repository');
  await input.fill(' Acme/Platform ');
  await page.getByRole('button', { name: 'Ignore repository', exact: true }).click();
  const section = page
    .locator('.settings-section')
    .filter({ has: page.getByRole('heading', { name: 'Ignored repositories' }) });
  await expect(section.locator('.setting-row')).toHaveText('acme/platformRemove');
  await input.fill('acme/platform');
  await page.getByRole('button', { name: 'Ignore repository', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect(section.locator('.setting-row')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'Ignored repositories · 1', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: '.context/ignored-repositories.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('button', { name: '↻ Refresh', exact: true })).toBeEnabled();
  await expect(page.locator('.pr-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Ignored repositories');
  await section.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(section.locator('.setting-row')).toHaveCount(0);
  await page.getByRole('button', { name: /Dashboard/ }).click();
  await expect(page.locator('.pr-card')).toHaveCount(5);
});

test('settings sections default to accordion states, expand/collapse by mouse and keyboard, and show item counts', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const section = (name: RegExp | string) =>
    page.locator('.settings-section').filter({ has: page.getByRole('heading', { name }) });
  // Automatic refresh is expanded by default; the management-heavy sections start collapsed.
  await expect(section('Automatic refresh').getByRole('button')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  for (const heading of [
    'Snooze options · 4',
    'Tracked repositories',
    'Ignored repositories',
    'Watched pull requests',
    'Ignored pull requests',
  ]) {
    await expect(section(heading).getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  }
  // Each heading button is a keyboard-operable, accessible disclosure control.
  const trackedSummary = page.getByRole('button', { name: 'Tracked repositories' });
  await trackedSummary.focus();
  await expect(trackedSummary).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(trackedSummary).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('textbox', { name: 'Repository', exact: true }).fill('acme/platform');
  await page.getByRole('button', { name: 'Add repository' }).click();
  await expect(
    section('Tracked repositories').locator('.setting-row').filter({ hasText: 'acme/platform' }),
  ).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Tracked repositories · 1' })).toBeVisible();
  // Collapsing again with the keyboard hides the section body but keeps the heading (and its
  // count) visible.
  await trackedSummary.focus();
  await page.keyboard.press('Space');
  await expect(trackedSummary).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('heading', { name: 'Tracked repositories · 1' })).toBeVisible();
  // Mouse expand/collapse works the same way on a different section.
  const ignoredPrSummary = page.getByRole('button', { name: 'Ignored pull requests' });
  await ignoredPrSummary.click();
  await expect(ignoredPrSummary).toHaveAttribute('aria-expanded', 'true');
  await ignoredPrSummary.click();
  await expect(ignoredPrSummary).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: '.context/settings-accordion.png', fullPage: true });
});

test('hotkeys switch screens and stay out of the way while typing', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await page.keyboard.press('Meta+,');
  await expect(page.getByRole('heading', { name: 'Tracked repositories' })).toBeVisible();
  await page.keyboard.press('Shift+D');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  // A plain-key hotkey must not steal keystrokes from a field.
  await page.keyboard.press('Meta+,');
  await expandSettingsSection(page, 'Tracked repositories');
  const input = page.getByRole('textbox', { name: 'Repository', exact: true });
  await input.fill('');
  await input.press('d');
  await expect(input).toHaveValue('d');
  await input.press('Shift+S');
  await input.press('Shift+D');
  await expect(input).toHaveValue('dSD');
  await expect(page.getByRole('heading', { name: 'Tracked repositories' })).toBeVisible();
  // ⌘, still works from inside a field.
  await page.getByRole('button', { name: /Dashboard/ }).click();
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Repository', exact: true }).press('Meta+,');
  await expect(page.getByRole('heading', { name: 'Tracked repositories' })).toBeVisible();
});

test('the shortcut list opens with ?, lists every hotkey, and closes again', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeHidden();
  await page.keyboard.press('?');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.hotkey-row dt')).toHaveText([
    'Refresh pull requests',
    'Open settings',
    'Open the dashboard',
    'Open snoozed pull requests',
    'Show keyboard shortcuts',
  ]);
  // Each key gets its own cap, joined by a plus, and the spelled-out combination is what
  // a screen reader reads.
  await expect(dialog.locator('.hotkey-row .key-combo')).toHaveText([
    '⌘+R',
    '⌘+,',
    '⇧+D',
    '⇧+S',
    '?',
  ]);
  await expect(dialog.locator('.hotkey-row .visually-hidden')).toHaveText([
    'Command plus R',
    'Command plus Comma',
    'Shift plus D',
    'Shift plus S',
    'Question mark',
  ]);
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toHaveAttribute(
    'aria-keyshortcuts',
    'Meta+,',
  );
  // Shortcuts behind the dialog stay inert, so ⌘, cannot navigate out from under it.
  await page.keyboard.press('Meta+,');
  await expect(dialog).toBeVisible();
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await page.screenshot({ path: '.context/hotkeys.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // The same list is reachable without the keyboard, and ? toggles it shut.
  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('?');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close keyboard shortcuts' }).click();
  await expect(dialog).toBeHidden();
});

test('snoozed rows sort by return date, reschedule, persist, restore, and expire', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  for (const [title, duration] of [
    ['Refresh session token handling', '1 hour'],
    ['Reduce cache lookup latency', '4 hours'],
  ]) {
    await page.getByRole('button', { name: `Actions for ${title}`, exact: true }).click();
    await page.getByRole('button', { name: 'Snooze', exact: true }).click();
    await page.getByRole('button', { name: duration, exact: true }).click();
  }
  await page.keyboard.press('Shift+S');
  const rows = page.locator('.snoozed-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Refresh session token handling');
  await expect(rows.first()).toContainText('Changes requested');
  await expect(rows.first().locator('time')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toHaveText(
    '▦ Dashboard ⇧D',
  );
  await rows
    .first()
    .getByRole('button', { name: /Change snooze/ })
    .click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Snooze options' })).toBeHidden();
  await rows
    .first()
    .getByRole('button', { name: /Change snooze/ })
    .click();
  await page.getByRole('button', { name: '1 day', exact: true }).click();
  await expect(rows.first()).toContainText('Reduce cache lookup latency');
  await page.reload();
  await page.keyboard.press('Shift+S');
  await expect(rows.first()).toContainText('Reduce cache lookup latency');
  await page.screenshot({ path: '.context/snoozed-page.png', fullPage: true });
  await rows
    .first()
    .getByRole('button', { name: /Open .* on GitHub/ })
    .click();
  expect(await page.evaluate(() => (window as any).opened)).toEqual([
    'https://github.com/acme/platform/pull/1',
  ]);
  await rows.first().getByRole('button', { name: 'Restore now' }).click();
  await expect(rows).toHaveCount(1);
  await page.clock.fastForward(24 * 60 * 60_000);
  await expect(rows).toHaveCount(0);
  await expect(page.getByText('Nothing snoozed', { exact: true })).toBeVisible();
  await page.keyboard.press('Shift+D');
  await expect(page.locator('.pr-card')).toHaveCount(4);
});

test('unavailable snoozed PRs retain restore and custom rescheduling controls', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await page
    .getByRole('button', { name: 'Actions for Reduce cache lookup latency', exact: true })
    .click();
  await page.getByRole('button', { name: 'Snooze', exact: true }).click();
  await page.getByRole('button', { name: '1 hour', exact: true }).click();
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem('prefs')!);
    prefs.snoozedPullRequests['acme/platform#99'] = {
      until: new Date(Date.now() + 30 * 60_000).toISOString(),
    };
    localStorage.setItem('prefs', JSON.stringify(prefs));
  });
  await page.reload();
  await page.keyboard.press('Shift+S');
  const row = page.locator('.snoozed-row').filter({ hasText: 'acme/platform#99' });
  await expect(row).toContainText('Pull request details unavailable');
  await row.getByRole('button', { name: /Change snooze/ }).click();
  await page.getByLabel('Custom date', { exact: true }).fill('2099-10-01T09:00');
  await page.getByRole('button', { name: 'Snooze until custom date', exact: true }).click();
  await expect(page.locator('.snoozed-row').last()).toContainText('acme/platform#99');
  await expect(row.locator('time')).toContainText('2099');
  await row.getByRole('button', { name: /Open .* on GitHub/ }).click();
  expect(await page.evaluate(() => (window as any).opened)).toEqual([
    'https://github.com/acme/platform/pull/99',
  ]);
  await row.getByRole('button', { name: 'Restore now' }).click();
  await expect(row).toHaveCount(0);
});

test('close as stale requires confirmation, supports Escape and Enter, and removes the card', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Actions for Refresh session token handling' }).click();
  await expect(page.getByRole('button', { name: 'Close as stale…', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  const actions = page.getByRole('button', {
    name: 'Actions for Simplify deployment configuration',
  });
  await actions.click();
  await page.getByRole('button', { name: 'Close as stale…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Close as stale?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("hasn't been updated in 30 days.");
  await expect(dialog.getByRole('button', { name: 'Close as stale', exact: true })).toBeFocused();
  await page.screenshot({ path: '.context/close-stale.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('closeCalls'))).toBeNull();
  await actions.click();
  await page.getByRole('button', { name: 'Close as stale…', exact: true }).click();
  await page.keyboard.press('Enter');
  await expect(dialog).not.toBeVisible();
  await expect(actions).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('closeCalls')!))).toEqual([
    'https://github.com/acme/platform/pull/4',
  ]);
});

test('close as stale keeps the PR and displays failures', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('closeFailure', 'true'));
  const actions = page.getByRole('button', {
    name: 'Actions for Simplify deployment configuration',
  });
  await actions.click();
  await page.getByRole('button', { name: 'Close as stale…', exact: true }).click();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Close as stale?' });
  await expect(dialog.getByRole('alert')).toContainText('Repository access denied');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(actions).toBeVisible();
});
for (const manualTrigger of ['button', 'shortcut', 'none'] as const) {
  test(`background refresh with manual trigger: ${manualTrigger}`, async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    const refresh = page.getByRole('button', { name: '↻ Refresh', exact: true });
    await expect(refresh).toBeEnabled();
    await expect(refresh).toContainText('⌘R');
    await expect(refresh).toHaveAttribute('aria-keyshortcuts', 'Meta+R');
    await page.getByRole('button', { name: 'Watching', exact: true }).click();
    await expect(page.locator('.empty-column')).toHaveCount(3);
    const emptyText = await page.locator('.empty-column').allTextContents();
    await page.evaluate(() => {
      const w = window as any;
      const invoke = w.__TAURI_INTERNALS__.invoke;
      w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
        const result = await invoke(command, args);
        if (args?.query?.includes('author:@me'))
          await new Promise((resolve) => {
            w.releaseRefresh = resolve;
          });
        if (args?.query?.includes('pullRequest(number: 1)'))
          result.repository.pullRequest.title = 'Updated pull request title';
        return result;
      };
    });
    await page.clock.runFor(300_000);
    await expect.poll(() => page.evaluate(() => (window as any).refreshCount)).toBe(2);
    await expect(refresh).toBeEnabled();
    await expect(page.locator('.board')).toHaveAttribute('aria-busy', 'false');
    expect(await page.locator('.empty-column').allTextContents()).toEqual(emptyText);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.locator('.menu-trigger').first()).toHaveCSS('opacity', '1');
    await expect(page.getByText('Reduce cache lookup latency', { exact: true })).toBeVisible();
    await expect(page.getByText('Updated pull request title', { exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Watching', exact: true }).click();
    await page.clock.fastForward(600_000);
    expect(await page.evaluate(() => (window as any).refreshCount)).toBe(2);
    if (manualTrigger !== 'none') {
      if (manualTrigger === 'button') await refresh.click();
      else await page.keyboard.press('Meta+r');
      await expect(page.getByRole('button', { name: '↻ Refreshing…', exact: true })).toBeDisabled();
      await expect(page.getByText('Loading pull requests…')).toHaveCount(3);
      await page.keyboard.press('Meta+r');
      expect(await page.evaluate(() => (window as any).refreshCount)).toBe(2);
    }
    await page.evaluate(() => (window as any).releaseRefresh());
    await expect(refresh).toBeEnabled();
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByText('Updated pull request title', { exact: true })).toBeVisible();
    if (manualTrigger === 'none') return;
    // A manual refresh from idle starts a new request with loading indicators too.
    if (manualTrigger === 'button') await refresh.click();
    else await page.keyboard.press('Meta+r');
    await expect(page.locator('.board')).toHaveAttribute('aria-busy', 'true');
    await expect.poll(() => page.evaluate(() => (window as any).refreshCount)).toBe(3);
    await page.evaluate(() => (window as any).releaseRefresh());
    await expect(refresh).toBeEnabled();
  });
}
