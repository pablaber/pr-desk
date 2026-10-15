import type { HistoryFacts } from '../history/facts';
import type { AchievementLevel, StoredAchievement } from '../history/types';
import type {
  Achievement,
  AchievementContext,
  AchievementPip,
  AchievementView,
  Unlock,
} from './types';

const APP_ONLY_NOTE = 'Only counts what you do in PR Desk';

export interface AchievementEvaluation {
  views: AchievementView[];
  // Levels unlocked and levels there are, across the catalog.
  unlocked: number;
  total: number;
  newlyUnlocked: Unlock[];
  // What to store: the previous map plus first sightings and new levels. Retired ids stay.
  stored: Record<string, StoredAchievement>;
  // Whether `stored` differs from what was passed in.
  changed: boolean;
}

const ascending = (a: number, b: number) => a - b;

// The stored levels only grow, and their count is the level shown, so a level once reached stays
// whatever later happens to the tiers or to the facts (a new ignore rule, a raised goal).
// A level is added only when the facts earn more levels than are stored; if tiers changed, the
// highest earned thresholds not yet stored are the ones added.
function grow(
  achievement: Achievement,
  times: number[],
  levels: AchievementLevel[],
  now: number,
): AchievementLevel[] {
  const earned = achievement.tiers.filter((threshold) => times.length >= threshold);
  const gain = earned.length - levels.length;
  if (gain <= 0) return [];
  return earned
    .filter((threshold) => !levels.some((level) => level.threshold === threshold))
    .slice(-gain)
    .map((threshold) => ({ threshold, at: times[threshold - 1], recordedAt: now }));
}

function view(
  achievement: Achievement,
  times: number[],
  levels: AchievementLevel[],
): AchievementView {
  const { tiers } = achievement;
  const count = times.length;
  const level = Math.min(tiers.length, levels.length);
  // Levels the facts still earn are dated from them; the rest keep the dates they were stored with.
  const storedTimes = levels.map((stored) => stored.at).sort(ascending);
  const reached = (i: number) =>
    count >= tiers[i] ? times[tiers[i] - 1] : (storedTimes[i] ?? null);
  const previous = level > 0 ? tiers[level - 1] : 0;
  const pips: AchievementPip[] = tiers.map((threshold, i) => ({
    threshold,
    unlocked: i < level,
    at: i < level ? reached(i) : null,
    fill:
      i < level
        ? 1
        : i === level
          ? Math.min(1, Math.max(0, (count - previous) / (threshold - previous)))
          : 0,
  }));
  const next = level < tiers.length ? tiers[level] : null;
  return {
    achievement,
    count,
    level,
    next,
    pips,
    completedAt: next === null ? pips[tiers.length - 1].at : null,
    note: achievement.appOnly ? (achievement.appOnlyNote ?? APP_ONLY_NOTE) : null,
  };
}

export function evaluateAchievements(
  catalog: Achievement[],
  stored: Record<string, StoredAchievement>,
  facts: HistoryFacts,
  context: AchievementContext,
): AchievementEvaluation {
  const next = { ...stored };
  const newlyUnlocked: Unlock[] = [];
  const views: AchievementView[] = [];
  let changed = false;
  for (const achievement of catalog) {
    const before = stored[achievement.id];
    const firstSeenAt = before?.firstSeenAt ?? context.now;
    const times = achievement
      .progress(facts, context)
      .filter((time) => achievement.retroactive || time >= firstSeenAt);
    const levels = before?.levels ?? [];
    const added = grow(achievement, times, levels, context.now);
    const all = [...levels, ...added].sort((a, b) => a.threshold - b.threshold);
    if (!before || added.length > 0) {
      next[achievement.id] = { firstSeenAt, levels: all };
      changed = true;
    }
    for (const level of added)
      newlyUnlocked.push({
        id: achievement.id,
        title: achievement.title,
        threshold: level.threshold,
      });
    views.push(view(achievement, times, all));
  }
  return {
    views,
    unlocked: views.reduce((sum, item) => sum + item.level, 0),
    total: catalog.reduce((sum, item) => sum + item.tiers.length, 0),
    newlyUnlocked,
    stored: next,
    changed,
  };
}
