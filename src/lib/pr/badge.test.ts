import { expect, it } from 'vitest';
import { badgeCount } from './badge';
import type { DashboardState } from './types';

const items = (
  ['ready-to-merge', 'ready-to-merge', 'needs-attention', 'waiting', 'waiting', 'waiting'] as const
).map((state: DashboardState) => ({ state }));

it.each([
  ['off', 0],
  ['ready-to-merge', 2],
  ['needs-attention', 1],
  ['both', 3],
] as const)('counts %s as %i', (mode, count) => expect(badgeCount(items, mode)).toBe(count));
it('counts nothing for an empty list or only waiting items', () => {
  expect(badgeCount([], 'both')).toBe(0);
  expect(badgeCount([{ state: 'waiting' }], 'both')).toBe(0);
});
