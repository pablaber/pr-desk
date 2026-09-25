import { expect, test } from '@playwright/test';

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
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Restore now', exact: true }).click();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByRole('textbox', { name: 'Repository', exact: true }).fill('bad-repository');
  await page.getByRole('button', { name: 'Add repository' }).click();
  await expect(page.getByRole('alert')).toContainText('Use owner/repository');
  await page.getByRole('textbox', { name: 'Repository', exact: true }).fill('acme/platform');
  await page.getByRole('button', { name: 'Add repository' }).click();
  await expect(page.locator('.setting-row').filter({ hasText: 'acme/platform' })).toHaveCount(1);
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
  await page.getByRole('textbox', { name: 'Repository', exact: true }).fill('acme/platform');
  await page.getByRole('button', { name: 'Add repository' }).click();
  await page.getByRole('textbox', { name: 'Pull request URL' }).fill('acme/platform#5');
  await page.getByRole('button', { name: 'Watch PR', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Ignored repository', exact: true });
  await input.fill('invalid');
  await page.getByRole('button', { name: 'Ignore repository', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Use owner/repository');
  await input.fill(' Acme/Platform ');
  await page.getByRole('button', { name: 'Ignore repository', exact: true }).click();
  const section = page
    .locator('.settings-section')
    .filter({ has: page.getByRole('heading', { name: 'Ignored repositories', exact: true }) });
  await expect(section.locator('.setting-row')).toHaveText('acme/platformRemove');
  await input.fill('acme/platform');
  await page.getByRole('button', { name: 'Ignore repository', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect(section.locator('.setting-row')).toHaveCount(1);
  await page.screenshot({ path: '.context/ignored-repositories.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('button', { name: '↻ Refresh', exact: true })).toBeEnabled();
  await expect(page.locator('.pr-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await section.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(section.locator('.setting-row')).toHaveCount(0);
  await page.getByRole('button', { name: /Dashboard/ }).click();
  await expect(page.locator('.pr-card')).toHaveCount(5);
});

test('hotkeys switch screens and stay out of the way while typing', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await page.keyboard.press('Meta+,');
  await expect(page.getByRole('heading', { name: 'Tracked repositories' })).toBeVisible();
  await page.keyboard.press('d');
  await expect(page.locator('.pr-card')).toHaveCount(4);
  // A plain-key hotkey must not steal keystrokes from a field.
  await page.keyboard.press('Meta+,');
  const input = page.getByRole('textbox', { name: 'Repository', exact: true });
  await input.fill('');
  await input.press('d');
  await expect(input).toHaveValue('d');
  await expect(page.getByRole('heading', { name: 'Tracked repositories' })).toBeVisible();
  // ⌘, still works from inside a field.
  await page.getByRole('button', { name: /Dashboard/ }).click();
  await expect(page.locator('.pr-card')).toHaveCount(4);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Repository', exact: true }).press('Meta+,');
  await expect(page.getByRole('heading', { name: 'Tracked repositories' })).toBeVisible();
});
