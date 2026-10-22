import { expect, it } from 'vitest';
import { filterCounts } from './board-filters';

const repositories = ['acme/web', 'acme/platform', 'acme/web', 'Acme/api'].map((r) => [r]);

it('counts each PR by value in name order', () => {
  expect(filterCounts(repositories, null)).toEqual([
    { value: 'Acme/api', count: 1 },
    { value: 'acme/platform', count: 1 },
    { value: 'acme/web', count: 2 },
  ]);
});
it('counts a PR under each of its values once, in numeric order', () => {
  expect(filterCounts([['BACK-12', 'fix'], ['BACK-9'], [], ['fix', 'fix']], null)).toEqual([
    { value: 'BACK-9', count: 1 },
    { value: 'BACK-12', count: 1 },
    { value: 'fix', count: 2 },
  ]);
});
it('keeps the selected value listed when nothing on the board has it', () => {
  expect(filterCounts(repositories, 'acme/billing')).toContainEqual({
    value: 'acme/billing',
    count: 0,
  });
  expect(filterCounts([], 'acme/web')).toEqual([{ value: 'acme/web', count: 0 }]);
});
it('lists nothing for an empty board', () => {
  expect(filterCounts([], null)).toEqual([]);
});
