import { expect, it } from 'vitest';
import { formatDuration, weekRange } from './format';

const minute = 60_000;

it('formats a duration with its two largest units', () => {
  expect(formatDuration(0)).toBe('1 min');
  expect(formatDuration(29_000)).toBe('1 min');
  expect(formatDuration(6 * minute)).toBe('6 min');
  expect(formatDuration(60 * minute)).toBe('1 h');
  expect(formatDuration(200 * minute)).toBe('3 h 20 min');
  expect(formatDuration(24 * 60 * minute)).toBe('1 d');
  expect(formatDuration((2 * 24 * 60 + 4 * 60 + 30) * minute)).toBe('2 d 4 h');
});

it('writes a Monday to Sunday range, repeating the month only when it changes', () => {
  expect(weekRange(new Date(2026, 9, 5).getTime())).toBe('Oct 5 – 11');
  expect(weekRange(new Date(2026, 8, 28).getTime())).toBe('Sep 28 – Oct 4');
});
