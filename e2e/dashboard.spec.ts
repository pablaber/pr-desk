import { expect, test, type Page } from '@playwright/test';

// Collapsed by default: expand a Settings accordion section by its heading text before
// interacting with controls inside it.
async function expandSettingsSection(page: Page, heading: string) {
  await page.getByRole('button', { name: new RegExp(`^${heading}( · [0-9]+)?$`) }).click();
}

// Tracked repositories, ignore rules and watched PRs are drafts until the Save bar is used; no
// GitHub refresh happens before that.
async function saveSettings(page: Page) {
  const save = page.getByRole('button', { name: 'Save changes', exact: true });
  await expect(save).toBeVisible();
  await save.click();
  await expect(save).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __TAURI_INTERNALS__: unknown;
      isTauri: boolean;
      opened: string[];
      refreshCount: number;
      badges: (number | null)[];
      zooms: number[];
    };
    w.opened = [];
    w.badges = [];
    w.zooms = [];
    w.refreshCount = 0;
    w.isTauri = true;
    const connection = (nodes: unknown[]) => ({
      nodes,
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    const raw = (number: number) => ({
      number,
      url: `https://github.com/acme/platform/pull/${number}`,
      title:
        [
          'Reduce cache lookup latency',
          'Refresh session token handling',
          'Add audit event retention',
          'Simplify deployment configuration',
        ][number - 1] ?? (number === 6 ? 'Document the retry policy' : 'A watched pull request'),
      repository: { nameWithOwner: 'acme/platform' },
      author: { login: number === 4 ? 'sam' : number === 6 ? 'jordan' : 'alex' },
      state: (JSON.parse(localStorage.getItem('mergedPrs') ?? '[]') as number[]).includes(number)
        ? 'MERGED'
        : 'OPEN',
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
              oid: 'a'.repeat(40),
              statusCheckRollup: {
                contexts: connection([
                  {
                    __typename: 'CheckRun',
                    name: 'CI',
                    status: 'COMPLETED',
                    conclusion: 'SUCCESS',
                  },
                ]),
              },
            },
          },
        ],
      },
    });
    w.__TAURI_INTERNALS__ = {
      // getCurrentWindow() reads its label from this metadata.
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { windowLabel: 'main', label: 'main' },
      },
      invoke: async (command: string, args: Record<string, any>) => {
        if (command === 'plugin:window|set_badge_count') {
          w.badges.push(args.value ?? null);
          return;
        }
        if (command === 'plugin:webview|set_webview_zoom') {
          w.zooms.push(args.value);
          return;
        }
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
        if (command === 'merge_pr') {
          const calls = JSON.parse(localStorage.getItem('mergeCalls') ?? '[]');
          calls.push(args);
          localStorage.setItem('mergeCalls', JSON.stringify(calls));
          if (localStorage.getItem('mergeFailure'))
            throw new Error('Merge rejected by repository rules');
          await new Promise((resolve) => setTimeout(resolve, 200));
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
        if (args.operation === 'info') return { version: '2.80.0', path: '/opt/homebrew/bin/gh' };
        const query = args.query as string;
        if (query.includes('DeskViewer'))
          return {
            viewer: { login: 'alex', avatarUrl: 'https://avatars.githubusercontent.com/u/1' },
          };
        if (query.includes('DeskMergedSearch'))
          return {
            search: {
              nodes: query.includes('author:@me')
                ? [
                    {
                      ...raw(1),
                      mergedAt: new Date(Date.now() - 3600000).toISOString(),
                      mergedBy: { login: 'sam' },
                    },
                  ]
                : [],
            },
          };
        if (query.includes('author:@me')) w.refreshCount++;
        if (query.includes('DeskSearch'))
          return {
            search: {
              issueCount: 3,
              ...connection(
                (query.includes('author:@me') ? [1, 2, 3] : [4])
                  .filter(
                    (n) =>
                      !(JSON.parse(localStorage.getItem('hiddenPrs') ?? '[]') as number[]).includes(
                        n,
                      ),
                  )
                  .map(raw),
              ),
            },
          };
        if (query.includes('DeskRepository'))
          return {
            repository: {
              nameWithOwner: 'acme/platform',
              pullRequests: connection([1, 2, 3, 4, 6].map(raw)),
            },
          };
        const number = Number(query.match(/pullRequest\(number: (\d+)/)?.[1]);
        return { repository: { pullRequest: raw(number) } };
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

test('the Completed view lists recently merged pull requests and opens them', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await page.getByRole('button', { name: /^Completed/ }).click();
  await expect(page.getByRole('heading', { name: 'Completed' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByText('1 merged pull request', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Open Reduce cache lookup latency on GitHub', exact: true })
    .click();
  expect(await page.evaluate(() => (window as any).opened)).toEqual([
    'https://github.com/acme/platform/pull/1',
  ]);
  await page.keyboard.press('Shift+D');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await page.keyboard.press('Shift+C');
  await expect(page.getByRole('heading', { name: 'Completed' })).toBeVisible();
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
  await expandSettingsSection(page, 'Ignored');
  await page.getByRole('button', { name: 'Ignored pull requests · 1' }).click();
  await page.getByRole('button', { name: /^Unignore / }).click();
  await page.getByRole('button', { name: 'Back to settings' }).click();
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
  // Both additions are still only a draft, so nothing has been written yet.
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('prefs')!).trackedRepositories),
  ).toEqual([]);
  await saveSettings(page);
  await page.reload();
  await expect(page.locator('.pr-card')).toHaveCount(6);
  // Tracking the repository moves others' open PRs to Needs attention; owned and watched PRs
  // keep their own placement.
  await expect(page.locator('.column').nth(0).locator('.pr-card')).toHaveCount(1);
  await expect(page.locator('.column').nth(1).locator('.pr-card')).toHaveCount(3);
  await expect(page.locator('.column').nth(2).locator('.pr-card')).toHaveCount(2);
  await expect(
    page.locator('.pr-card').filter({ hasText: 'Document the retry policy' }),
  ).toContainText('Open in a tracked repository');
  await expect(
    page.locator('.pr-card').filter({ hasText: 'Add audit event retention' }),
  ).not.toContainText('Open in a tracked repository');
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

test('right-clicking a card opens its menu at the cursor and keeps it in the window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/');
  const actions = page.getByRole('group', { name: 'PR actions' });
  const snoozeOptions = page.getByRole('group', { name: 'Snooze options' });
  const inView = async (locator: typeof actions) => {
    const box = (await locator.boundingBox())!;
    const { width, height } = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
  };
  const cardBody = page.getByRole('button', {
    name: 'Open Refresh session token handling on GitHub',
    exact: true,
  });
  await cardBody.click({ button: 'right', position: { x: 40, y: 20 } });
  await expect(actions).toBeVisible();
  const card = (await cardBody.boundingBox())!;
  const menu = (await actions.boundingBox())!;
  expect(Math.abs(menu.x - (card.x + 40))).toBeLessThan(1);
  expect(Math.abs(menu.y - (card.y + 20))).toBeLessThan(1);
  expect(await page.evaluate(() => (window as any).opened)).toEqual([]);
  // Right-clicking the backdrop dismisses, and Escape does too.
  await page.mouse.click(card.x - 4, card.y + 20, { button: 'right' });
  await expect(actions).toBeHidden();
  await cardBody.click({ button: 'right', position: { x: 40, y: 20 } });
  await page.keyboard.press('Escape');
  await expect(actions).toBeHidden();
  // Near the card's far edge the menu is pulled back inside the window.
  await cardBody.click({ button: 'right', position: { x: card.width - 4, y: card.height - 4 } });
  await expect(actions).toBeVisible();
  await inView(actions);
  await page.keyboard.press('Escape');
  // The first card in the leftmost column still shows its submenu on screen.
  const first = page.locator('.column').first().locator('.pr-card .card-main').first();
  await first.click({ button: 'right', position: { x: 20, y: 20 } });
  await page.getByRole('button', { name: 'Snooze', exact: true }).click();
  await expect(snoozeOptions).toBeVisible();
  await inView(snoozeOptions);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // Menu actions still work from the right-click menu.
  await cardBody.click({ button: 'right', position: { x: 40, y: 20 } });
  await page.getByRole('button', { name: 'Copy PR URL' }).click();
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
  const refresh = page.getByRole('button', { name: 'Refresh', exact: true });
  await expect(refresh).toBeEnabled();
  expect(await count()).toBe(1);
  await page.clock.runFor(299_000);
  expect(await count()).toBe(1);
  await page.clock.runFor(1_000);
  await expect.poll(count).toBe(2);
  await expect(refresh).toBeEnabled();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Automatic refresh');
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
  await expandSettingsSection(page, 'Automatic refresh');
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
  const refresh = page.getByRole('button', { name: 'Refresh', exact: true });
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
  const refreshing = page.getByRole('button', { name: 'Refreshing…' });
  await expect(refreshing).toBeDisabled();
  await expect(refreshing).toHaveClass(/refreshing/);
  await page.clock.fastForward(10 * 60_000);
  expect(await page.evaluate(() => (window as any).refreshCount)).toBe(2);
  await page.evaluate(() => (window as any).releaseRefresh());
  await expect(refresh).toBeEnabled();
  await expect(refresh).not.toHaveClass(/refreshing/);
});

test('refresh slider and numeric input stay synchronized and validate exact values', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Automatic refresh');
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
  await expandSettingsSection(page, 'Automatic refresh');
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
  await expandSettingsSection(page, 'Ignored');
  const input = page.getByRole('textbox', { name: 'Ignore rule', exact: true });
  await input.fill('invalid');
  await page.getByRole('button', { name: 'Add ignore rule', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Use owner/repository');
  await input.fill(' Acme/Platform ');
  await page.getByRole('button', { name: 'Add ignore rule', exact: true }).click();
  const section = page
    .locator('.settings-section')
    .filter({ has: page.getByRole('heading', { name: /^Ignored( · [0-9]+)?$/ }) });
  await expect(section.locator('.setting-row')).toHaveText('Repository: acme/platformRemove');
  await input.fill('acme/platform');
  await page.getByRole('button', { name: 'Add ignore rule', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already configured');
  await expect(section.locator('.setting-row')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Ignored · 1', exact: true })).toBeVisible();
  await page.screenshot({ path: '.context/ignored-repositories.png', fullPage: true });
  await saveSettings(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await expect(page.locator('.pr-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Ignored');
  await section.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(section.locator('.setting-row')).toHaveCount(0);
  await saveSettings(page);
  await page.getByRole('button', { name: /Dashboard/ }).click();
  await expect(page.locator('.pr-card')).toHaveCount(6);
});

test('settings sections default to accordion states, expand/collapse by mouse and keyboard, and show item counts', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const section = (name: RegExp | string) =>
    page.locator('.settings-section').filter({
      has: page.getByRole('heading', {
        name: typeof name === 'string' ? new RegExp(`^${name}( · [0-9]+)?$`) : name,
      }),
    });
  // All editable settings start collapsed beneath the connection metadata.
  await expect(page.getByRole('spinbutton', { name: 'Refresh interval in minutes' })).toBeHidden();
  for (const heading of [
    'Automatic refresh',
    'Dock badge',
    'Snooze options · 4',
    'Tracked repositories',
    'Ignored',
    'Watched pull requests',
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
  const ignoredSummary = page.getByRole('button', { name: 'Ignored', exact: true });
  await ignoredSummary.click();
  await expect(ignoredSummary).toHaveAttribute('aria-expanded', 'true');
  await ignoredSummary.click();
  await expect(ignoredSummary).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: '.context/settings-accordion.png', fullPage: true });
});

test('the dock badge follows the chosen mode and persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.column').nth(0).locator('.pr-card')).toHaveCount(1);
  await expect(page.locator('.column').nth(1).locator('.pr-card')).toHaveCount(2);
  const lastBadge = () => page.evaluate(() => (window as any).badges.at(-1) ?? null);
  await expect.poll(lastBadge).toBe(3);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Dock badge');
  const expected = {
    'Ready to merge': 1,
    'Needs attention': 2,
    Off: null,
    Both: 3,
  };
  for (const [label, value] of Object.entries(expected)) {
    await page.getByRole('radio', { name: label, exact: true }).check();
    await expect.poll(lastBadge).toBe(value);
  }
  await page.getByRole('radio', { name: 'Off', exact: true }).check();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('prefs')!).settings.dockBadge))
    .toBe('off');
});

test('the interface size follows the chosen step and the zoom shortcuts', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  const lastZoom = () => page.evaluate(() => (window as any).zooms.at(-1) ?? null);
  const savedScale = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('prefs')!).settings.interfaceScale);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Interface size');
  await page.getByRole('radio', { name: 'Large (115%)', exact: true }).check();
  await expect.poll(lastZoom).toBe(1.15);
  await expect.poll(savedScale).toBe(115);
  await page.keyboard.press('Meta+=');
  await expect(page.getByText('Interface size 130%')).toBeVisible();
  await expect.poll(lastZoom).toBe(1.3);
  await expect.poll(savedScale).toBe(130);
  await page.keyboard.press('Meta+0');
  // Quick successive changes replace the toast instead of stacking.
  await expect(page.getByText('Interface size 100%')).toBeVisible();
  await expect(page.getByText('Interface size 130%')).toHaveCount(0);
  await expect.poll(lastZoom).toBe(1);
  await expect.poll(savedScale).toBe(100);
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
  await expandSettingsSection(page, 'Tracked repositories');
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
  await expect(dialog.locator('h3')).toHaveText(['Navigation', 'PR actions', 'Other']);
  await expect(dialog.locator('.hotkey-row dt')).toHaveText([
    'Open settings',
    'Open the dashboard',
    'Open snoozed pull requests',
    'Open recently merged pull requests',
    'Open labels',
    'Open the hovered PR on GitHub',
    'Copy the hovered PR URL',
    'Snooze the hovered PR',
    'Ignore the hovered PR',
    'Label the hovered PR',
    'Refresh pull requests',
    'Increase interface size',
    'Decrease interface size',
    'Reset interface size',
    'Show keyboard shortcuts',
  ]);
  // Each key gets its own cap, joined by a plus, and the spelled-out combination is what
  // a screen reader reads.
  await expect(dialog.locator('.hotkey-row .key-combo')).toHaveText([
    '⌘+,',
    '⇧+D',
    '⇧+S',
    '⇧+C',
    '⇧+L',
    'O',
    'Enter',
    'C',
    'S',
    'I',
    'L',
    '⌘+R',
    '⌘+=',
    '⌘+-',
    '⌘+0',
    '?',
  ]);
  await expect(dialog.locator('.hotkey-row .visually-hidden')).toHaveText([
    'Command plus Comma',
    'Shift plus D',
    'Shift plus S',
    'Shift plus C',
    'Shift plus L',
    'O or Enter',
    'C',
    'S',
    'I',
    'L',
    'Command plus R',
    'Command plus =',
    'Command plus -',
    'Command plus 0',
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

test('hovering a card and pressing a letter acts on it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  const card = page.locator('.pr-card').first();

  // With nothing hovered, the keys do nothing.
  await page.mouse.move(0, 0);
  await page.keyboard.press('i');
  await expect(page.locator('.pr-card')).toHaveCount(4);

  await card.hover();
  await page.keyboard.press('s');
  await expect(page.getByRole('group', { name: 'Snooze options' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'PR actions' })).toBeHidden();

  await card.hover();
  await page.keyboard.press('l');
  await expect(page.getByRole('group', { name: 'Labels' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await card.hover();
  await page.keyboard.press('o');
  expect(await page.evaluate(() => (window as any).opened)).toEqual([
    'https://github.com/acme/platform/pull/1',
  ]);

  await card.hover();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as any).opened)).toEqual([
    'https://github.com/acme/platform/pull/1',
    'https://github.com/acme/platform/pull/1',
  ]);

  await page.evaluate(() => {
    (window as any).copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => (window as any).copied.push(text) },
    });
  });
  await card.hover();
  await page.keyboard.press('c');
  expect(await page.evaluate(() => (window as any).copied)).toEqual([
    'https://github.com/acme/platform/pull/1',
  ]);
  await expect(
    page.getByRole('status').filter({ hasText: 'PR acme/platform#1 URL copied to clipboard' }),
  ).toBeVisible();

  await card.hover();
  await page.keyboard.press('i');
  await expect(page.locator('.pr-card')).toHaveCount(3);
});

test('copying a PR URL from the card menu shows a toast', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} },
    });
  });
  const card = page.locator('.pr-card').first();
  await card.getByRole('button', { name: /^Actions for/ }).click();
  await page.getByRole('button', { name: /Copy PR URL/ }).click();
  const toast = page.getByRole('status').filter({ hasText: 'URL copied to clipboard' });
  await expect(toast).toBeVisible();
  await expect(toast.locator('.toast')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: '.context/copy-toast.png' });
});

async function captureClipboard(page: Page) {
  await page.evaluate(() => {
    (window as any).copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => (window as any).copied.push(text) },
    });
  });
  return async () => JSON.parse((await page.evaluate(() => (window as any).copied))[0]);
}

test('copies debug info for the whole board from Settings', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  const copied = await captureClipboard(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Troubleshooting');
  await page.getByRole('button', { name: 'Copy debug info' }).click();
  await page.screenshot({ path: '.context/debug-settings.png' });
  await expect(page.getByRole('status').filter({ hasText: 'Debug info copied' })).toBeVisible();
  const info = await copied();
  expect(info).toMatchObject({ login: 'alex', refresh: { discoveryComplete: true } });
  expect(info.pullRequests).toHaveLength(4);
  expect(info.pullRequests.find((p: any) => p.pr.number === 1)).toMatchObject({
    column: 'ready-to-merge',
    matchedRules: expect.arrayContaining(['ready']),
  });
});

test('copies debug info for one PR from the card menu', async ({ page }) => {
  await page.goto('/');
  const copied = await captureClipboard(page);
  const card = page.locator('.pr-card[data-pr-id="acme/platform#2"]');
  await card.getByRole('button', { name: /^Actions for/ }).click();
  await page.getByRole('button', { name: /Copy debug info/ }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Debug info for acme/platform#2 copied' }),
  ).toBeVisible();
  const info = await copied();
  expect(info.pullRequests).toHaveLength(1);
  expect(info.pullRequests[0]).toMatchObject({
    column: 'needs-attention',
    primary: '3 unresolved threads',
    signals: { activeThreads: 3, changesRequested: true },
  });
});

test('the card menu shows the hover hotkeys', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('.pr-card')
    .first()
    .getByRole('button', { name: /^Actions for/ })
    .click();
  const menu = page.getByRole('group', { name: 'PR actions' });
  await expect(menu.locator('.menu-hotkey')).toHaveText(['O', 'C', 'S', 'L', 'I']);
  await page.screenshot({ path: '.context/card-menu-hotkeys.png' });
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
    'Dashboard ⇧D',
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
    const refresh = page.getByRole('button', { name: 'Refresh', exact: true });
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
        if (args?.query?.includes('author:@me'))
          result.search.nodes[0].title = 'Updated pull request title';
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
      await expect(page.getByRole('button', { name: 'Refreshing…', exact: true })).toBeDisabled();
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

test('interface icons render as bundled Lucide SVG and stay out of accessible names', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  // Every nav entry carries an icon, and the label alone still names the button.
  for (const [name, icon] of [
    ['Dashboard', 'layout-grid'],
    ['Snoozed', 'clock'],
    ['Labels', 'tag'],
    ['Settings', 'settings'],
  ]) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button.locator(`svg.lucide-${icon}`)).toHaveAttribute('aria-hidden', 'true');
  }
  // Icon-only controls name themselves through aria-label instead.
  const actions = page.getByRole('button', { name: /^Actions for / }).first();
  await expect(actions.locator('svg.lucide-ellipsis')).toBeVisible();
  await actions.click();
  await expect(
    page.getByRole('button', { name: 'Open on GitHub', exact: true }).locator('svg'),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  // The brand mark stays the project's own artwork.
  await expect(page.locator('img.brand-mark')).toHaveAttribute('src', /source/);
  // Icons are inline SVG markup rather than <img> or <use> references to a sprite or an
  // icon service, so they need no network access at runtime.
  expect(await page.locator('svg.lucide').count()).toBeGreaterThan(10);
  expect(await page.locator('svg.lucide use, svg.lucide image').count()).toBe(0);
  // Each empty column gets its own icon from the same set.
  await page.getByRole('button', { name: 'Watching', exact: true }).click();
  await expect(page.locator('.empty-column')).toHaveCount(3);
  await expect(page.locator('.empty-column svg.lucide')).toHaveCount(3);
  await page.screenshot({ path: '.context/empty-columns.png', fullPage: true });
});

for (const [kind, value, remaining] of [
  ['repository', 'ACME/*', 0],
  ['author', 'SAM', 3],
  ['title', '*SESSION*', 3],
] as const) {
  test(`${kind} ignore rules hide matching PRs, persist, and restore on removal`, async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.pr-card')).toHaveCount(4);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expandSettingsSection(page, 'Ignored');
    await page.getByLabel('Ignore rule type').selectOption(kind);
    await page.getByRole('textbox', { name: 'Ignore rule', exact: true }).fill(value);
    await page.getByRole('button', { name: 'Add ignore rule', exact: true }).click();
    const section = page.locator('#settings-section-ignored-rules');
    await expect(section.locator('.setting-row')).toContainText(value.toLowerCase());
    if (kind === 'title')
      await page.screenshot({ path: '.context/ignore-rules.png', fullPage: true });
    await saveSettings(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
    await expect(page.locator('.pr-card')).toHaveCount(remaining);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expandSettingsSection(page, 'Ignored');
    await section.getByRole('button', { name: 'Remove', exact: true }).click();
    await saveSettings(page);
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await expect(page.locator('.pr-card')).toHaveCount(4);
  });
}

test('broad rules stay effective on failed refreshes and do not erase individual ignores', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await page.getByRole('button', { name: 'Actions for Add audit event retention' }).click();
  await page.getByRole('button', { name: 'Ignore PR', exact: true }).click();
  await page.evaluate(() => {
    const w = window as any;
    const invoke = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === 'github' && args?.operation === 'graphql') throw new Error('offline');
      return invoke(command, args);
    };
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Ignored');
  await page.getByLabel('Ignore rule type').selectOption('author');
  await page.getByRole('textbox', { name: 'Ignore rule', exact: true }).fill('ALEX');
  await page.getByRole('button', { name: 'Add ignore rule', exact: true }).click();
  await expect(page.locator('#settings-section-ignored-rules .setting-row')).toHaveCount(1);
  await saveSettings(page);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('.pr-card')).toHaveCount(1);
  await expect(page.locator('.pr-card')).toContainText('Simplify deployment');
  await expect(page.getByText(/refresh issues/)).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Ignored');
  await page
    .locator('#settings-section-ignored-rules')
    .getByRole('button', { name: 'Remove' })
    .click();
  await saveSettings(page);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('.pr-card')).toHaveCount(3);
  await expect(page.getByText('Add audit event retention', { exact: true })).toBeHidden();
});

test('the ignored pull requests screen opens from Settings, lists, and unignores', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  // The screen is reachable only from the Settings Ignored section, and starts empty.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Ignored');
  const link = page.getByRole('button', { name: /^Ignored pull requests/ });
  await expect(link).toHaveText('Ignored pull requests');
  await link.click();
  await expect(page.getByRole('heading', { name: 'Ignored pull requests' })).toBeVisible();
  await expect(page.locator('.toolbar')).toContainText('Settings / Ignored pull requests');
  await expect(page.getByText('Nothing individually ignored', { exact: true })).toBeVisible();
  await page.screenshot({ path: '.context/ignored-empty.png', fullPage: true });
  // Ignore two PRs, one of which also matches a broad author rule.
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  for (const title of ['Add audit event retention', 'Simplify deployment configuration']) {
    await page.getByRole('button', { name: `Actions for ${title}`, exact: true }).click();
    await page.getByRole('button', { name: 'Ignore PR', exact: true }).click();
  }
  await expect(page.locator('.pr-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Ignored');
  await page.getByLabel('Ignore rule type').selectOption('author');
  await page.getByRole('textbox', { name: 'Ignore rule', exact: true }).fill('sam');
  await page.getByRole('button', { name: 'Add ignore rule', exact: true }).click();
  await saveSettings(page);
  // The count rides along with the button, and Enter opens the screen from the keyboard.
  const counted = page.getByRole('button', { name: 'Ignored pull requests · 2' });
  await counted.focus();
  await expect(counted).toBeFocused();
  await page.keyboard.press('Enter');
  const rows = page.locator('.ignored-row');
  await expect(rows).toHaveCount(2);
  // Most recently ignored first, identified by repository, number, title and author.
  await expect(rows.first()).toContainText('Simplify deployment configuration');
  await expect(rows.first().locator('.repo')).toContainText('acme/platform');
  await expect(rows.first().locator('.number')).toHaveText('#4');
  await expect(rows.first().locator('.author')).toHaveText('sam');
  await expect(rows.first().locator('time')).toBeVisible();
  await page.screenshot({ path: '.context/ignored-screen.png', fullPage: true });
  await rows
    .first()
    .getByRole('button', { name: /Open .* on GitHub/ })
    .click();
  expect(await page.evaluate(() => (window as any).opened)).toEqual([
    'https://github.com/acme/platform/pull/4',
  ]);
  // Unignore is the only PR-level action, next to the row's own open button.
  await expect(rows.first().getByRole('button')).toHaveCount(2);
  await rows
    .first()
    .getByRole('button', { name: 'Unignore Simplify deployment configuration' })
    .click();
  await expect(rows).toHaveCount(1);
  // The broad author rule still hides the PR that was just unignored.
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('.pr-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Ignored');
  await page
    .locator('#settings-section-ignored-rules')
    .getByRole('button', { name: 'Remove', exact: true })
    .click();
  await saveSettings(page);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('.pr-card')).toHaveCount(3);
  await expect(page.getByText('Add audit event retention', { exact: true })).toBeHidden();
  // The remaining individual ignore survives a reload and Back returns to Settings.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Ignored');
  await page.getByRole('button', { name: 'Ignored pull requests · 1' }).click();
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: 'Back to settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expandSettingsSection(page, 'Ignored');
  await page.getByRole('button', { name: 'Ignored pull requests · 1' }).click();
  await page.getByRole('button', { name: 'Unignore Add audit event retention' }).click();
  await expect(page.getByText('Nothing individually ignored', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('.pr-card')).toHaveCount(4);
});

test('ignored PRs without fetched details stay identifiable and unignorable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await page.getByRole('button', { name: 'Actions for Add audit event retention' }).click();
  await page.getByRole('button', { name: 'Ignore PR', exact: true }).click();
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem('prefs')!);
    prefs.ignoredPullRequests['acme/platform#99'] = { ignoredAt: new Date().toISOString() };
    localStorage.setItem('prefs', JSON.stringify(prefs));
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Ignored');
  await page.getByRole('button', { name: 'Ignored pull requests · 2' }).click();
  // The saved identifier alone still names the repository and number on the row.
  const row = page.locator('.ignored-row').filter({ hasText: '#99' });
  await expect(row).toContainText('acme/platform');
  await expect(row).toContainText('Pull request details unavailable');
  await page.screenshot({ path: '.context/ignored-unavailable.png', fullPage: true });
  await row.getByRole('button', { name: /Open .* on GitHub/ }).click();
  expect(await page.evaluate(() => (window as any).opened)).toEqual([
    'https://github.com/acme/platform/pull/99',
  ]);
  await row.getByRole('button', { name: 'Unignore acme/platform#99' }).click();
  await expect(row).toHaveCount(0);
  await expect(page.locator('.ignored-row')).toHaveCount(1);
});

test('legacy repository ignores migrate and future preferences are never overwritten', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await page.evaluate(() =>
    localStorage.setItem(
      'prefs',
      JSON.stringify({
        schemaVersion: 4,
        trackedRepositories: ['acme/platform'],
        ignoredRepositories: ['Acme/Platform'],
        watchedPullRequests: [],
        ignoredPullRequests: { 'acme/platform#2': { ignoredAt: '2026-01-01' } },
        snoozedPullRequests: {},
        settings: { automaticRefreshMinutes: 0, snoozeOptions: [] },
      }),
    ),
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await expect(page.locator('.pr-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Ignored');
  await page
    .locator('#settings-section-ignored-rules')
    .getByRole('button', { name: 'Remove' })
    .click();
  await saveSettings(page);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('prefs')!));
  expect(saved.schemaVersion).toBe(10);
  expect(saved.ignoreRules).toEqual([]);
  expect(saved.ignoredPullRequests).toHaveProperty('acme/platform#2');
  expect(saved.settings.snoozeOptions).toEqual([]);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('prefs')!);
    saved.schemaVersion = 999;
    localStorage.setItem('prefs', JSON.stringify(saved));
  });
  const before = await page.evaluate(() => localStorage.getItem('prefs'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Unsupported preferences version');
  expect(await page.evaluate(() => localStorage.getItem('prefs'))).toBe(before);
});

test('settings edits stay a draft until saved, and leaving with unsaved changes asks first', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  const refreshes = () => page.evaluate(() => (window as any).refreshCount);
  const before = await refreshes();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Tracked repositories');
  const save = page.getByRole('button', { name: 'Save changes', exact: true });
  await expect(save).toBeHidden();
  // Adding a repository checks it on GitHub, keeps the field usable, and only drafts the value.
  // Hold that check open long enough to see the in-field progress indicator.
  await page.evaluate(() => {
    const w = window as any;
    const invoke = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === 'github' && (args?.query as string)?.includes('DeskRepository'))
        await new Promise((resolve) => setTimeout(resolve, 400));
      return invoke(command, args);
    };
  });
  const repository = page.getByRole('textbox', { name: 'Repository', exact: true });
  await repository.fill('acme/platform');
  await page.getByRole('button', { name: 'Add repository' }).click();
  await expect(page.getByRole('status', { name: 'Checking repository on GitHub' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add repository' })).toBeDisabled();
  await page.screenshot({ path: '.context/settings-checking.png', fullPage: true });
  await expect(page.locator('.setting-row').filter({ hasText: 'acme/platform' })).toHaveCount(1);
  await expect(repository).toHaveValue('');
  await expect(repository).toBeEnabled();
  await expect(save).toBeVisible();
  expect(await refreshes()).toBe(before);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('prefs')!)?.trackedRepositories ?? [],
    ),
  ).toEqual([]);
  await page.screenshot({ path: '.context/settings-unsaved.png', fullPage: true });
  // Leaving is blocked by a dialog. Keep editing returns to Settings with the draft intact.
  const dialog = page.getByRole('dialog', { name: 'Save your settings?' });
  await page.getByRole('button', { name: /Dashboard/ }).click();
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: '.context/settings-unsaved-dialog.png', fullPage: true });
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(save).toBeVisible();
  // Discarding restores the last saved settings and leaves.
  await page.keyboard.press('Shift+D');
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.locator('.pr-card')).toHaveCount(4);
  expect(await refreshes()).toBe(before);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Tracked repositories');
  await expect(page.getByText('No repositories tracked yet.')).toBeVisible();
  // Removing a drafted value again leaves nothing to save.
  await repository.fill('acme/platform');
  await page.getByRole('button', { name: 'Add repository' }).click();
  await expect(save).toBeVisible();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(save).toBeHidden();
  // The Ignored sub-screen is part of Settings, so it does not ask and keeps the draft.
  await repository.fill('acme/platform');
  await page.getByRole('button', { name: 'Add repository' }).click();
  await expandSettingsSection(page, 'Ignored');
  await page.getByRole('button', { name: /^Ignored pull requests/ }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Back to settings' }).click();
  await expect(save).toBeVisible();
  // Saving from the dialog writes the draft, refreshes in the background, and completes the move.
  await page.getByRole('button', { name: /Dashboard/ }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await expect
    .poll(async () =>
      page.evaluate(() => JSON.parse(localStorage.getItem('prefs')!).trackedRepositories),
    )
    .toEqual(['acme/platform']);
  // Tracking the repository moves its open PRs to Needs attention once the refresh lands.
  await expect(page.locator('.column').nth(1).locator('.pr-card')).toHaveCount(3);
});

test('ordinary discovery needs no detail calls and all failed or pending checks affect placement', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any,
      invoke = w.__TAURI_INTERNALS__.invoke;
    w.detailCalls = 0;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (args?.query?.includes('DeskPullRequest')) w.detailCalls++;
      const result = await invoke(command, args);
      for (const pr of result?.search?.nodes ?? []) {
        if (pr.number === 1)
          pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0].conclusion = 'FAILURE';
        if (pr.number === 3)
          pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0].status = 'IN_PROGRESS';
      }
      return result;
    };
  });
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  const failed = page.locator('.pr-card').filter({ hasText: 'Reduce cache lookup latency' });
  const pending = page.locator('.pr-card').filter({ hasText: 'Add audit event retention' });
  await expect(failed).toContainText('Checks failed');
  await expect(pending).toContainText('Checks running');
  await expect(page.locator('.column').nth(0).locator('.pr-card')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).detailCalls)).toBe(0);
});

test('non-blocking check rules move an approved PR to Ready without a Merge button', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any,
      invoke = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      const result = await invoke(command, args);
      for (const pr of result?.search?.nodes ?? []) {
        if (pr.number !== 1) continue;
        pr.mergeStateStatus = 'BLOCKED';
        pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.push({
          __typename: 'CheckRun',
          name: 'policy-bot',
          status: 'IN_PROGRESS',
          conclusion: null,
        });
      }
      return result;
    };
  });
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  const card = page.locator('.pr-card').filter({ hasText: 'Reduce cache lookup latency' });
  await expect(page.locator('.column').nth(0).locator('.pr-card')).toHaveCount(0);
  await expect(card).toContainText('Checks running');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Non-blocking checks');
  await page.getByRole('textbox', { name: 'Check rule repository' }).fill('acme/*');
  await page.getByRole('textbox', { name: 'Check rule check name' }).fill('policy-bot');
  await page.getByRole('button', { name: 'Add check rule', exact: true }).click();
  await expect(page.locator('#settings-section-check-rules .setting-row')).toContainText('acme/*');
  await saveSettings(page);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('.column').nth(0).locator('.pr-card')).toHaveCount(1);
  await expect(card).toContainText('Ready · policy-bot pending');
  await expect(card.getByRole('button', { name: /^Merge / })).toHaveCount(0);
});

test('a queued approved PR waits with its queue position and no Merge button', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any,
      invoke = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      const result = await invoke(command, args);
      for (const pr of result?.search?.nodes ?? []) {
        if (pr.number === 1) pr.mergeQueueEntry = { state: 'QUEUED', position: 2 };
      }
      return result;
    };
  });
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await expect(page.locator('.column').nth(0).locator('.pr-card')).toHaveCount(0);
  const card = page.locator('.pr-card').filter({ hasText: 'Reduce cache lookup latency' });
  await expect(card).toContainText('Queued to merge · #2');
  await expect(card.getByRole('button', { name: /^Merge / })).toHaveCount(0);
});

test('check continuation gates the initial snapshot and preserves cards during refresh', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any,
      invoke = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (args?.query?.includes('DeskPullRequest')) {
        await new Promise((resolve) => {
          w.releaseContinuation = resolve;
        });
        return {
          repository: {
            pullRequest: {
              commits: {
                nodes: [
                  {
                    commit: {
                      oid: 'a'.repeat(40),
                      statusCheckRollup: {
                        contexts: {
                          nodes: [
                            {
                              __typename: 'CheckRun',
                              name: 'Additional check',
                              status: 'COMPLETED',
                              conclusion: w.refreshCount === 1 ? 'FAILURE' : 'SUCCESS',
                            },
                          ],
                          pageInfo: { hasNextPage: false, endCursor: null },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        };
      }
      const result = await invoke(command, args);
      for (const pr of result?.search?.nodes ?? [])
        if (pr.number === 1) {
          pr.commits.nodes[0].commit.statusCheckRollup.contexts.pageInfo = {
            hasNextPage: true,
            endCursor: 'more-checks',
          };
          if (w.refreshCount > 1) pr.title = 'Updated after complete refresh';
        }
      return result;
    };
  });
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).releaseContinuation))
    .toBe('function');
  await expect(page.locator('.pr-card')).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).releaseContinuation();
    (window as any).releaseContinuation = null;
  });
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await expect(
    page.locator('.pr-card').filter({ hasText: 'Reduce cache lookup latency' }),
  ).toContainText('Checks failed');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).releaseContinuation))
    .toBe('function');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await expect(page.getByText('Reduce cache lookup latency', { exact: true })).toBeVisible();
  await expect(page.getByText('Updated after complete refresh', { exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as any).releaseContinuation());
  await expect(page.locator('.column').nth(0)).toContainText('Updated after complete refresh');
});

test('repository validation errors stay beside the input and allow correction', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await page.evaluate(() => {
    const w = window as any;
    const invoke = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (args?.query?.includes('DeskRepository') && args.query.includes('missing-repo'))
        throw 'GITHUB_REPOSITORY_NOT_FOUND';
      return invoke(command, args);
    };
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expandSettingsSection(page, 'Tracked repositories');
  const repository = page.getByRole('textbox', { name: 'Repository', exact: true });
  const add = page.getByRole('button', { name: 'Add repository' });
  const alert = page.locator('#settings-section-tracked').getByRole('alert');
  await repository.fill('octocat/missing-repo');
  await add.click();
  await expect(alert).toContainText('We couldn’t find that repository');
  await expect(alert).toContainText('your GitHub account doesn’t have access');
  await expect(repository).toHaveAttribute('aria-describedby', 'repository-error');
  await expect(repository).toHaveAttribute('aria-invalid', 'true');
  await expect(repository).toHaveValue('octocat/missing-repo');
  await expect(page.locator('.alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeHidden();
  await page.screenshot({ path: '.context/settings-repository-error.png', fullPage: true });
  await repository.fill('invalid');
  await expect(alert).toBeHidden();
  await add.click();
  await expect(alert).toBeVisible();
  await expect(alert).not.toContainText('We couldn’t find');
  await repository.fill('acme/platform');
  await add.click();
  await expect(repository).toHaveValue('');
  await expect(alert).toBeHidden();
  await expect(repository).not.toHaveAttribute('aria-invalid');
  await saveSettings(page);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('prefs')!).trackedRepositories),
  ).toEqual(['acme/platform']);
});

test('settings shows read-only GitHub connection details and handles CLI lookup failure', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  await settings.click();
  const info = page.getByRole('region', { name: 'GitHub connection' });
  await expect(info).toContainText('@alex');
  await expect(info).toContainText('github.com');
  await expect(info).toContainText('2.80.0');
  await expect(info).toContainText('/opt/homebrew/bin/gh');
  await expect(info.locator('input, button, select')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeHidden();
  await page.screenshot({ path: '.context/settings-github-info.png', fullPage: true });
  await page.evaluate(() => {
    const w = window as any;
    const invoke = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === 'github' && args?.operation === 'info') throw new Error('unavailable');
      return invoke(command, args);
    };
  });
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await settings.click();
  await expect(info).toContainText('Unavailable');
  await expect(info).toContainText('@alex');
  await expect(info.getByRole('status')).toContainText('Reopen Settings');
  await expect(page.getByRole('button', { name: 'Automatic refresh', exact: true })).toBeEnabled();
});

test('ready PRs merge only after confirmation with the selected method', async ({ page }) => {
  await page.goto('/');
  const merge = page.getByRole('button', {
    name: 'Merge Reduce cache lookup latency',
    exact: true,
  });
  await expect(page.locator('.merge-button')).toHaveCount(1);
  await merge.click();
  const dialog = page.getByRole('dialog', { name: 'Merge pull request?' });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: '.context/merge-confirmation.png', fullPage: true });
  expect(await page.evaluate(() => localStorage.getItem('mergeCalls'))).toBeNull();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await merge.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await merge.click();
  await dialog.getByLabel('Merge method').selectOption('rebase');
  await dialog.getByRole('button', { name: 'Confirm merge', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Merging…' })).toBeDisabled();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mergeCalls') ?? '[]'))).toEqual(
    [{ url: 'https://github.com/acme/platform/pull/1', headOid: 'a'.repeat(40), method: 'rebase' }],
  );
  await expect(page.locator('.pr-card')).toHaveCount(3);
  expect(await page.evaluate(() => (window as any).opened)).toEqual([]);
});

test('merge failures keep the dialog and card available', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('mergeFailure', '1'));
  await page
    .getByRole('button', { name: 'Merge Reduce cache lookup latency', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Merge pull request?' });
  await dialog.getByRole('button', { name: 'Confirm merge', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Merge rejected by repository rules');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
});

test('merge rechecks reject a changed commit or newly pending checks', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const w = window as any;
    const original = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      const result = await original(command, args);
      if (command === 'github' && args.query?.includes('DeskPullRequest')) {
        const commit = result.repository.pullRequest.commits.nodes[0].commit;
        if (localStorage.getItem('changedHead')) commit.oid = 'b'.repeat(40);
        else commit.statusCheckRollup.contexts.nodes[0].status = 'IN_PROGRESS';
      }
      return result;
    };
  });
  for (const changedHead of [true, false]) {
    await page.evaluate(
      (changed) =>
        changed ? localStorage.setItem('changedHead', '1') : localStorage.removeItem('changedHead'),
      changedHead,
    );
    await page
      .getByRole('button', { name: 'Merge Reduce cache lookup latency', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Merge pull request?' });
    await dialog.getByRole('button', { name: 'Confirm merge', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('changed or is no longer ready');
    expect(await page.evaluate(() => localStorage.getItem('mergeCalls'))).toBeNull();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
});

test('an all-clear message replaces the columns only when nothing is tracked', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __TAURI_INTERNALS__: { invoke: (c: string, a: Record<string, any>) => Promise<unknown> };
    };
    const invoke = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command, args) => {
      const query = (args?.query ?? '') as string;
      if (command === 'github' && query.includes('DeskSearch'))
        return {
          search: { issueCount: 0, nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        };
      if (command === 'github' && query.includes('DeskRepository')) return { repository: null };
      return invoke(command, args);
    };
  });
  await page.goto('/');
  const clear = page.getByRole('status').filter({ hasText: 'Nothing to do' });
  await expect(clear).toBeVisible();
  await expect(page.locator('.column')).toHaveCount(0);
  await page.screenshot({ path: '.context/all-clear.png', fullPage: true });
  // A source filter that matches nothing is not "nothing to do": the columns and their
  // filter hint come back.
  await page.getByRole('button', { name: 'Watching', exact: true }).click();
  await expect(clear).toBeHidden();
  await expect(page.locator('.column')).toHaveCount(3);
});

// The sidebar has a Labels button too, so the card menu's is found through its group.
const cardMenuLabels = (page: Page) =>
  page
    .getByRole('group', { name: 'PR actions' })
    .getByRole('button', { name: 'Labels', exact: true });
const sidebarLabels = (page: Page) =>
  page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Labels' });

async function createCardLabel(page: Page, title: string, name: string) {
  await page.getByRole('button', { name: `Actions for ${title}`, exact: true }).click();
  await cardMenuLabels(page).click();
  await page.getByRole('textbox', { name: 'New label' }).fill(name);
  await page.getByRole('textbox', { name: 'New label' }).press('Enter');
}

test('labels are created from the card menu, badge the card, and persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  const card = page.locator('.pr-card').filter({ hasText: 'Reduce cache lookup latency' });
  await createCardLabel(page, 'Reduce cache lookup latency', 'Backend');
  await expect(card.locator('.badge.label')).toHaveText('Backend');
  await expect(page.getByRole('menuitemcheckbox', { name: 'Backend' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // Duplicates and empty names are rejected inline.
  await page.getByRole('textbox', { name: 'New label' }).fill('backend');
  await page.getByRole('textbox', { name: 'New label' }).press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'exists' })).toBeVisible();
  await page.getByRole('menuitemcheckbox', { name: 'Backend' }).click();
  await expect(card.locator('.badge.label')).toHaveCount(0);
  await page.getByRole('menuitemcheckbox', { name: 'Backend' }).click();
  await expect(card.locator('.badge.label')).toHaveText('Backend');
  await page.screenshot({ path: '.context/label-badges.png', fullPage: true });
  await page.reload();
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await expect(card.locator('.badge.label')).toHaveText('Backend');
});

test('the Labels screen lists counts, opens a label, and removes it from a PR', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await createCardLabel(page, 'Reduce cache lookup latency', 'Backend');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+L');
  await expect(page.getByRole('heading', { name: 'Labels', exact: true })).toBeVisible();
  const row = page.locator('.label-row').filter({ hasText: 'Backend' });
  await expect(row).toContainText('1 pull request');
  await page.screenshot({ path: '.context/labels-screen.png', fullPage: true });
  await row.getByRole('button', { name: /^Backend/ }).click();
  await expect(page.locator('.labeled-row')).toHaveCount(1);
  await expect(page.locator('.snoozed-summary')).toContainText('1 pull request');
  await page.screenshot({ path: '.context/label-list.png', fullPage: true });
  await page.getByRole('button', { name: /^Remove Backend from/ }).click();
  await expect(page.locator('.labeled-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to labels' }).click();
  await expect(row).toContainText('0 pull requests');
});

test('labels can be renamed, recolored and deleted from the Labels screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await createCardLabel(page, 'Reduce cache lookup latency', 'Backend');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const card = page.locator('.pr-card').filter({ hasText: 'Reduce cache lookup latency' });
  await sidebarLabels(page).click();
  await page.getByRole('textbox', { name: 'New label name' }).fill('Empty');
  await page.getByRole('button', { name: 'Create label' }).click();
  await expect(page.locator('.label-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Rename Backend', exact: true }).click();
  await page.getByRole('textbox', { name: 'Rename Backend' }).fill('API');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Color for API', exact: true }).click();
  await page.getByRole('button', { name: '#8a5cc7', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Color for API' })).toHaveText('#8a5cc7');
  // Custom hex colors apply on Enter; invalid ones stay in the field unapplied.
  const emptyColor = page.getByRole('button', { name: 'Color for Empty', exact: true });
  await emptyColor.click();
  const hex = page.getByRole('textbox', { name: 'Hex color' });
  await hex.fill('#12345');
  await hex.press('Enter');
  await expect(hex).toHaveAttribute('aria-invalid', 'true');
  await hex.fill('1A2B3C');
  await hex.press('Enter');
  await expect(emptyColor).toHaveText('#1a2b3c');
  await page.getByRole('button', { name: 'Random color' }).click();
  await expect(emptyColor).not.toHaveText('#1a2b3c');
  await expect(emptyColor).toHaveText(/^#[0-9a-f]{6}$/);
  await page.screenshot({ path: '.context/label-color-picker.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(card.locator('.badge.label')).toHaveText('API');
  await expect(card.locator('.badge.label .label-dot')).toHaveCSS(
    'background-color',
    'rgb(138, 92, 199)',
  );
  await sidebarLabels(page).click();
  await page.getByRole('button', { name: 'Delete API', exact: true }).click();
  await expect(page.getByText('Delete label?')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.label-row').filter({ hasText: 'API' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete API', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(card.locator('.badge.label')).toHaveCount(0);
});

test('a refresh unwatches and unlabels merged PRs and unlabels ones no longer discovered', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await createCardLabel(page, 'Reduce cache lookup latency', 'Backend');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Actions for Refresh session token handling' }).click();
  await cardMenuLabels(page).click();
  await page.getByRole('menuitemcheckbox', { name: 'Backend' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Actions for Refresh session token handling' }).click();
  await page.getByRole('button', { name: 'Watch PR', exact: true }).click();
  const stored = () =>
    page.evaluate(() => {
      const prefs = JSON.parse(localStorage.getItem('prefs')!);
      return [prefs.watchedPullRequests, Object.keys(prefs.labeledPullRequests)];
    });
  await expect.poll(stored).toEqual([['acme/platform#2'], ['acme/platform#1', 'acme/platform#2']]);
  // PR 2 is merged and PR 1 drops out of search, but PR 1 is still watched-free and untracked.
  await page.evaluate(() => {
    localStorage.setItem('mergedPrs', '[2]');
    localStorage.setItem('hiddenPrs', '[1]');
  });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(stored).toEqual([[], []]);
});
