import Flag from '@lucide/svelte/icons/flag';
import { expect, it } from 'vitest';
import { achievementProgress, romanNumeral } from './format';
import type { AchievementView } from './types';

it('writes levels as roman numerals', () => {
  expect([1, 2, 3, 4, 5, 9, 14, 40].map(romanNumeral)).toEqual([
    'I',
    'II',
    'III',
    'IV',
    'V',
    'IX',
    'XIV',
    'XL',
  ]);
});

it('shows progress towards the next threshold, or when the top one was reached', () => {
  const view: AchievementView = {
    achievement: {
      id: 'x',
      title: 'X',
      description: '',
      icon: Flag,
      unit: 'approvals',
      tiers: [10, 200],
      retroactive: true,
      progress: () => [],
    },
    count: 64,
    level: 1,
    next: 200,
    pips: [],
    completedAt: null,
    note: null,
  };
  expect(achievementProgress(view)).toBe('64 / 200 approvals');
  const done = { ...view, next: null, completedAt: new Date(2026, 8, 1, 15).getTime() };
  expect(achievementProgress(done)).toBe('Complete · Sep 1');
});
