import type { Fact, HistoryFacts } from './facts';

export type ActivityView = 'week' | 'month';

export interface Counts {
  authored: number;
  mergedByYou: number;
  approved: number;
  shipped: number;
}

export interface ActivityDay extends Counts {
  // Local midnight.
  start: number;
  // False for days after today and days before tracking began, which have no data to show.
  tracked: boolean;
  today: boolean;
}

export interface ActivityPeriod {
  view: ActivityView;
  // Local midnight of the Monday or the first of the month, and of the day after the period ends.
  start: number;
  end: number;
  days: ActivityDay[];
  // How many empty cells precede the first day in a Monday-first calendar row.
  lead: number;
  totals: Counts;
  // Shipped now minus shipped over the previous period; null when nothing before it was tracked.
  delta: number | null;
  canPrevious: boolean;
  canNext: boolean;
}

// Dates are built from calendar fields so a day is always local midnight to local midnight, even
// across daylight saving changes.
export function addDays(time: number, days: number) {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
}

const mondayIndex = (time: number) => (new Date(time).getDay() + 6) % 7;

export function periodStart(view: ActivityView, time: number) {
  const date = new Date(time);
  return view === 'week'
    ? addDays(time, -mondayIndex(time))
    : new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

export function shiftPeriod(view: ActivityView, start: number, by: number) {
  const date = new Date(start);
  return view === 'week'
    ? addDays(start, 7 * by)
    : new Date(date.getFullYear(), date.getMonth() + by, 1).getTime();
}

// You cannot move past the current period or before the one that holds the first tracked day.
export function clampPeriodStart(
  view: ActivityView,
  start: number,
  trackingSince: number,
  now: number,
) {
  const earliest = periodStart(view, trackingSince);
  const latest = Math.max(earliest, periodStart(view, now));
  return Math.min(Math.max(periodStart(view, start), earliest), latest);
}

function within(facts: Fact[], from: number, to: number) {
  return facts.filter((fact) => fact.at >= from && fact.at < to).length;
}

function countsBetween(facts: HistoryFacts, from: number, to: number): Counts {
  return {
    authored: within(facts.authoredMerges, from, to),
    mergedByYou: within(facts.mergesByYou, from, to),
    approved: within(facts.approvals, from, to),
    shipped: within(facts.shipped, from, to),
  };
}

export function activityPeriod(
  facts: HistoryFacts,
  view: ActivityView,
  anchor: number,
  now: number,
): ActivityPeriod {
  const { trackingSince } = facts;
  const start = clampPeriodStart(view, anchor, trackingSince, now);
  const end = shiftPeriod(view, start, 1);
  const today = addDays(now, 0);
  const days: ActivityDay[] = [];
  for (let day = start; day < end; day = addDays(day, 1)) {
    days.push({
      ...countsBetween(facts, day, addDays(day, 1)),
      start: day,
      tracked: day >= trackingSince && day <= today,
      today: day === today,
    });
  }
  const totals = countsBetween(facts, start, end);

  // While the period is under way, compare with the same stretch of the one before it.
  const elapsed = today >= start && today < end ? days.findIndex((day) => day.today) + 1 : null;
  const previousStart = shiftPeriod(view, start, -1);
  const previousEnd = elapsed === null ? start : Math.min(addDays(previousStart, elapsed), start);
  const hasPrevious = previousEnd > trackingSince;
  return {
    view,
    start,
    end,
    days,
    lead: view === 'week' ? 0 : mondayIndex(start),
    totals,
    delta: hasPrevious
      ? totals.shipped - countsBetween(facts, previousStart, previousEnd).shipped
      : null,
    canPrevious: start > periodStart(view, trackingSince),
    canNext: start < periodStart(view, now),
  };
}

// Round gridlines for a chart whose tallest bar is `max`: at most four steps from zero.
export function axisTicks(max: number) {
  const top = Math.max(max, 3);
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((s) => Math.ceil(top / s) <= 4) ?? 1;
  return Array.from({ length: Math.ceil(top / step) + 1 }, (_, i) => i * step);
}

// The month calendar's colour step for a day: 0, 1-2, 3-4, 5-6, then 7 or more shipped.
export function heatStep(shipped: number) {
  return shipped === 0 ? 0 : Math.min(4, Math.ceil(shipped / 2));
}
