import type Flag from '@lucide/svelte/icons/flag';
import type { HistoryFacts } from '../history/facts';

export interface AchievementContext {
  goal: number;
  streakDays: number[];
  now: number;
}

// The times the count went up, ascending, so tier N is reached at element N-1.
export type Progress = (facts: HistoryFacts, context: AchievementContext) => number[];

export interface Achievement {
  // Permanent: stored levels are keyed by it.
  id: string;
  title: string;
  description: string;
  icon: typeof Flag;
  unit: string;
  // Ascending thresholds, one per level.
  tiers: number[];
  // False counts only what happened after the account first saw the achievement.
  retroactive: boolean;
  // Counts only actions taken in PR Desk, which a sync cannot find.
  appOnly?: boolean;
  appOnlyNote?: string;
  progress: Progress;
}

export interface AchievementPip {
  threshold: number;
  unlocked: boolean;
  // When the level was reached; null while locked.
  at: number | null;
  // How much of the way from the previous threshold the count has come, 0 to 1.
  fill: number;
}

export interface AchievementView {
  achievement: Achievement;
  count: number;
  level: number;
  // Null once every level is unlocked.
  next: number | null;
  pips: AchievementPip[];
  completedAt: number | null;
  note: string | null;
}

export interface Unlock {
  id: string;
  title: string;
  threshold: number;
}
