import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __TAURI_INTERNALS__: unknown;
      isTauri: boolean;
      opened: string[];
    };
    w.opened = [];
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
              updatedAt: new Date(Date.now() - number * 3600000).toISOString(),
              reviewDecision: number === 1 ? 'APPROVED' : null,
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
  await page.getByRole('button', { name: 'Review requests', exact: true }).click();
  await expect(page.locator('.pr-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.screenshot({ path: '.context/dashboard.png', fullPage: true });
});

test('snooze, ignore, restore, watch, tracked repositories and persistence', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Actions for Refresh session token handling', exact: true })
    .click();
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
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('prefs')!));
  expect(Object.keys(persisted)).not.toContain('prs');
  expect(persisted.watchedPullRequests).toEqual(['acme/platform#5']);
});
