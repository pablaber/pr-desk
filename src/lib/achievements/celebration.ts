import { addDays } from '../history/activity';
import { historyFacts } from '../history/facts';
import { currentStreak } from '../history/stats';
import type { AccountHistory } from '../history/types';
import { ACHIEVEMENTS } from './catalog';
import { romanNumeral } from './format';
import type { AchievementPreferences } from './record';
import type { Unlock } from './types';

export interface CelebrationChip {
  kind: 'today' | 'streak' | 'unlock';
  text: string;
}

const MAX_UNLOCKS = 2;

// "1st", "2nd", "3rd", "4th", "11th", "21st": 11 to 13 take "th" whatever their last digit.
function ordinal(value: number) {
  const teen = value % 100 >= 11 && value % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] ?? 'th');
  return `${value}${suffix}`;
}

// Only achievements with several levels say which one was reached.
function unlockText({ id, title, threshold }: Unlock) {
  const tiers = ACHIEVEMENTS.find((achievement) => achievement.id === id)?.tiers ?? [];
  const level = tiers.indexOf(threshold) + 1;
  return tiers.length > 1 && level > 0
    ? `Unlocked: ${title} ${romanNumeral(level)}`
    : `Unlocked: ${title}`;
}

// What the merge celebration says about the merge that was just recorded, from local history only.
export function celebrationChips(
  account: AccountHistory | null,
  login: string,
  preferences: AchievementPreferences,
  unlocks: Unlock[],
  now: number,
): CelebrationChip[] {
  if (!account) return [];
  const facts = historyFacts(account, login, preferences);
  const chips: CelebrationChip[] = [];
  const startOfToday = addDays(now, 0);
  const endOfToday = addDays(now, 1);
  const today = facts.shipped.filter((fact) => fact.at >= startOfToday && fact.at < endOfToday);
  if (today.length > 0) chips.push({ kind: 'today', text: `${ordinal(today.length)} today` });
  const streak = currentStreak(facts, preferences.settings.streakDays, now);
  if (streak > 0) chips.push({ kind: 'streak', text: `${streak}-day streak` });
  for (const unlock of unlocks.slice(0, MAX_UNLOCKS))
    chips.push({ kind: 'unlock', text: unlockText(unlock) });
  if (unlocks.length > MAX_UNLOCKS)
    chips.push({ kind: 'unlock', text: `+${unlocks.length - MAX_UNLOCKS} more` });
  return chips;
}
