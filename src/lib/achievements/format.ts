import type { AchievementView } from './types';

const NUMERALS: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function romanNumeral(value: number): string {
  let rest = value;
  let text = '';
  for (const [size, numeral] of NUMERALS) {
    text += numeral.repeat(Math.floor(rest / size));
    rest %= size;
  }
  return text;
}

export const shortDate = (time: number) =>
  new Date(time).toLocaleDateString([], { month: 'short', day: 'numeric' });

// "64 / 200 approvals" on the way, "Complete · Sep 1" at the top.
export function achievementProgress(view: AchievementView): string {
  if (view.next !== null) return `${view.count} / ${view.next} ${view.achievement.unit}`;
  return view.completedAt === null ? 'Complete' : `Complete · ${shortDate(view.completedAt)}`;
}
