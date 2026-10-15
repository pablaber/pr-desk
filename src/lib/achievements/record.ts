import { historyFacts, type HistoryFacts } from '../history/facts';
import type { AccountHistory } from '../history/types';
import type { AppState } from '../store/app-state';
import { ACHIEVEMENTS } from './catalog';
import { evaluateAchievements, type AchievementEvaluation } from './evaluate';
import type { Unlock } from './types';

export type AchievementPreferences = Pick<AppState, 'knownBots' | 'ignoreRules'> & {
  settings: Pick<AppState['settings'], 'weeklyGoal' | 'streakDays'>;
};

export function achievements(
  account: AccountHistory,
  facts: HistoryFacts,
  preferences: AchievementPreferences,
  now: number,
): AchievementEvaluation {
  const { weeklyGoal: goal, streakDays } = preferences.settings;
  return evaluateAchievements(ACHIEVEMENTS, account.achievements, facts, {
    goal,
    streakDays,
    now,
  });
}

// Folds new levels and first sightings into the account; the same account comes back when
// nothing changed, so the caller can skip the write.
export function recordAchievements(
  account: AccountHistory,
  login: string,
  preferences: AchievementPreferences,
  now: number,
): { account: AccountHistory; unlocked: Unlock[] } {
  const result = achievements(account, historyFacts(account, login, preferences), preferences, now);
  return {
    account: result.changed ? { ...account, achievements: result.stored } : account,
    unlocked: result.newlyUnlocked,
  };
}

export const hasUnseenAchievements = (account: AccountHistory) =>
  ACHIEVEMENTS.some((achievement) =>
    account.achievements[achievement.id]?.levels.some(
      (level) => level.recordedAt > account.achievementsSeenAt,
    ),
  );
