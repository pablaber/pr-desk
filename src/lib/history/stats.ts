import { activityPeriod, addDays, periodStart, shiftPeriod, type ActivityDay } from './activity';
import type { Fact, HistoryFacts } from './facts';

// Goals, streaks and records count shipped PRs. A fact stamped a moment after the caller's clock
// (an in-app merge racing the ticking `now`) still belongs to today, so only later days are cut.
function shippedThrough(facts: HistoryFacts, now: number) {
  const end = addDays(now, 1);
  return facts.shipped.filter((fact) => fact.at < end);
}

// The first shipped fact of each local day, which is when that day was done.
function doneDays(shipped: Fact[]) {
  const days = new Map<number, number>();
  for (const fact of shipped) {
    const day = addDays(fact.at, 0);
    if (!days.has(day)) days.set(day, fact.at);
  }
  return days;
}

const isStreakDay = (day: number, streakDays: number[]) =>
  streakDays.includes(new Date(day).getDay());

// Days you did not pick neither break nor extend a streak, and an empty today only means it is
// not over yet, so the streak then runs through the previous streak day.
export function currentStreak(facts: HistoryFacts, streakDays: number[], now: number): number {
  const done = doneDays(shippedThrough(facts, now));
  const today = addDays(now, 0);
  let streak = 0;
  for (let day = today; day >= facts.trackingSince; day = addDays(day, -1)) {
    if (!isStreakDay(day, streakDays)) continue;
    if (done.has(day)) streak++;
    else if (day !== today) break;
  }
  return streak;
}

// Element N-1 is when any streak first reached N days: the time of the first PR shipped on the
// day that completed it. The list length is therefore the longest streak.
export function streakProgress(facts: HistoryFacts, streakDays: number[], now: number): number[] {
  const done = doneDays(shippedThrough(facts, now));
  const today = addDays(now, 0);
  const reached: number[] = [];
  let run = 0;
  for (let day = addDays(facts.trackingSince, 0); day <= today; day = addDays(day, 1)) {
    if (!isStreakDay(day, streakDays)) continue;
    const at = done.get(day);
    if (at === undefined) {
      run = 0;
      continue;
    }
    run++;
    if (run > reached.length) reached.push(at);
  }
  return reached;
}

function shippedByWeek(shipped: Fact[]) {
  const weeks = new Map<number, Fact[]>();
  for (const fact of shipped) {
    const week = periodStart('week', fact.at);
    weeks.set(week, [...(weeks.get(week) ?? []), fact]);
  }
  return weeks;
}

// One time per Monday to Sunday week that reached the goal: when its goal-th PR shipped.
export function weeksMeetingGoal(facts: HistoryFacts, goal: number, now: number): number[] {
  return [...shippedByWeek(shippedThrough(facts, now)).values()]
    .filter((week) => week.length >= goal)
    .map((week) => week[goal - 1].at)
    .sort((a, b) => a - b);
}

export interface PersonalRecords {
  // Local midnight of the day, or of the Monday that starts the week.
  day: { count: number; start: number } | null;
  week: { count: number; start: number } | null;
  // The longest run of streak days.
  streak: number;
  // Your own PR that merged soonest after it was opened. PRs of unknown age are skipped.
  fastest: { duration: number; fact: Fact } | null;
}

function busiest(shipped: Fact[], bucket: (time: number) => number) {
  const counts = new Map<number, number>();
  let best: { count: number; start: number } | null = null;
  for (const fact of shipped) {
    const start = bucket(fact.at);
    const count = (counts.get(start) ?? 0) + 1;
    counts.set(start, count);
    // Strictly greater, so a tie stays with the earlier day or week.
    if (count > (best?.count ?? 0)) best = { count, start };
  }
  return best;
}

export function personalRecords(
  facts: HistoryFacts,
  streakDays: number[],
  now: number,
): PersonalRecords {
  const shipped = shippedThrough(facts, now);
  let fastest: PersonalRecords['fastest'] = null;
  for (const fact of facts.authoredMerges) {
    if (fact.createdAt === null) continue;
    const duration = fact.at - fact.createdAt;
    if (duration >= 0 && (fastest === null || duration < fastest.duration))
      fastest = { duration, fact };
  }
  return {
    day: busiest(shipped, (time) => addDays(time, 0)),
    week: busiest(shipped, (time) => periodStart('week', time)),
    streak: streakProgress(facts, streakDays, now).length,
    fastest,
  };
}

export interface WeekSummary {
  // Monday to Sunday, local midnight to local midnight.
  days: ActivityDay[];
  shipped: number;
  goal: number;
  // How many more it takes to reach the goal; zero once reached.
  remaining: number;
  // Null when no part of last week was tracked.
  lastWeek: number | null;
  streak: number;
  records: PersonalRecords;
  // Tracking began today, so there is nothing to look back on yet.
  firstRun: boolean;
}

export function weekSummary(
  facts: HistoryFacts,
  goal: number,
  streakDays: number[],
  now: number,
): WeekSummary {
  const week = activityPeriod(facts, 'week', now, now);
  const shipped = week.totals.shipped;
  return {
    days: week.days,
    shipped,
    goal,
    remaining: Math.max(0, goal - shipped),
    lastWeek: week.canPrevious
      ? activityPeriod(facts, 'week', shiftPeriod('week', week.start, -1), now).totals.shipped
      : null,
    streak: currentStreak(facts, streakDays, now),
    records: personalRecords(facts, streakDays, now),
    firstRun: facts.trackingSince >= addDays(now, 0),
  };
}
