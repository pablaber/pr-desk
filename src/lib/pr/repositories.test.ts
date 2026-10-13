import { expect, it } from 'vitest';
import { repositoryCounts } from './repositories';

const items = ['acme/web', 'acme/platform', 'acme/web', 'Acme/api'].map((repository) => ({
  pr: { repository },
}));

it('counts each PR by repository in name order', () => {
  expect(repositoryCounts(items, null)).toEqual([
    { repository: 'Acme/api', count: 1 },
    { repository: 'acme/platform', count: 1 },
    { repository: 'acme/web', count: 2 },
  ]);
});
it('keeps the selected repository listed when nothing on the board is in it', () => {
  expect(repositoryCounts(items, 'acme/billing')).toContainEqual({
    repository: 'acme/billing',
    count: 0,
  });
  expect(repositoryCounts([], 'acme/web')).toEqual([{ repository: 'acme/web', count: 0 }]);
});
it('lists nothing for an empty board', () => {
  expect(repositoryCounts([], null)).toEqual([]);
});
