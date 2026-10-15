import Archive from '@lucide/svelte/icons/archive';
import Bot from '@lucide/svelte/icons/bot';
import Eye from '@lucide/svelte/icons/eye';
import Flag from '@lucide/svelte/icons/flag';
import Flame from '@lucide/svelte/icons/flame';
import GitPullRequestArrow from '@lucide/svelte/icons/git-pull-request-arrow';
import Inbox from '@lucide/svelte/icons/inbox';
import LockOpen from '@lucide/svelte/icons/lock-open';
import MapIcon from '@lucide/svelte/icons/map';
import Medal from '@lucide/svelte/icons/medal';
import Sun from '@lucide/svelte/icons/sun';
import Target from '@lucide/svelte/icons/target';
import { addDays } from '../history/activity';
import type { Fact } from '../history/facts';
import { streakProgress, weeksMeetingGoal } from '../history/stats';
import { count, distinct, events } from './progress';
import type { Achievement } from './types';

const DAY = 86_400_000;

// An approval made in PR Desk has no creation time until a sync fills it in, so it waits.
const sameDay = (fact: Fact) =>
  fact.createdAt !== null && addDays(fact.at, 0) === addDays(fact.createdAt, 0);
const longOpen = (fact: Fact) => fact.createdAt !== null && fact.at - fact.createdAt >= 5 * DAY;

// Ids are permanent, because stored levels are keyed by them. Titles, descriptions, icons and
// tiers can change after release: evaluation never takes a level back. A new achievement that
// should not count the past is added with retroactive: false.
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'off-the-line',
    title: 'Off the line',
    description: 'Ship your first PR after tracking starts',
    icon: Flag,
    unit: 'PR',
    tiers: [1],
    retroactive: true,
    progress: count((facts) => facts.shipped),
  },
  {
    id: 'on-a-roll',
    title: 'On a roll',
    description: 'Ship something every streak day in a row',
    icon: Flame,
    unit: 'days',
    tiers: [5, 10, 20, 40],
    retroactive: true,
    progress: (facts, { streakDays, now }) => streakProgress(facts, streakDays, now),
  },
  {
    id: 'goal-getter',
    title: 'Goal getter',
    description: 'Hit your weekly goal',
    icon: Target,
    unit: 'weeks',
    tiers: [1, 4, 12, 26],
    retroactive: true,
    progress: (facts, { goal, now }) => weeksMeetingGoal(facts, goal, now),
  },
  {
    id: 'second-pair-of-eyes',
    title: 'Second pair of eyes',
    description: 'Approve PRs by people, not bots',
    icon: Eye,
    unit: 'approvals',
    tiers: [10, 50, 200, 500],
    retroactive: true,
    progress: count((facts) => facts.approvals),
  },
  {
    id: 'same-day-review',
    title: 'Same-day review',
    description: 'Approve a PR on the day it was opened',
    icon: Sun,
    unit: 'PRs',
    tiers: [5, 25, 100],
    retroactive: true,
    progress: count((facts) => facts.approvals.filter(sameDay)),
  },
  {
    id: 'unblocker',
    title: 'Unblocker',
    description: 'Approve a PR that had been open 5+ days',
    icon: LockOpen,
    unit: 'PRs',
    tiers: [3, 10, 25],
    retroactive: true,
    progress: count((facts) => facts.approvals.filter(longOpen)),
  },
  {
    id: 'century',
    title: 'Century',
    description: 'PRs shipped, each counted once',
    icon: Medal,
    unit: 'PRs',
    tiers: [100, 500, 1000],
    retroactive: true,
    progress: count((facts) => facts.shipped),
  },
  {
    id: 'bot-wrangler',
    title: 'Bot wrangler',
    description: 'Merge PRs opened by bots',
    icon: Bot,
    unit: 'bot PRs',
    tiers: [10, 25, 100],
    retroactive: true,
    progress: count((facts) => facts.mergesByYou.filter((fact) => fact.authorIsBot)),
  },
  {
    id: 'spring-cleaning',
    title: 'Spring cleaning',
    description: 'Close stale PRs with Close as stale',
    icon: Archive,
    unit: 'PRs',
    tiers: [5, 25, 100],
    retroactive: true,
    appOnly: true,
    progress: count(events('stale-closed')),
  },
  {
    id: 'clear-desk',
    title: 'Clear desk',
    description: 'A day the dashboard showed nothing in Needs attention',
    icon: Inbox,
    unit: 'days',
    tiers: [5, 25, 100],
    retroactive: true,
    appOnly: true,
    appOnlyNote: 'Only counts days PR Desk was open',
    progress: count(events('attention-clear')),
  },
  {
    id: 'explorer',
    title: 'Explorer',
    description: 'Ship PRs in different repositories',
    icon: MapIcon,
    unit: 'repos',
    tiers: [3, 5, 10, 25],
    retroactive: true,
    progress: distinct(
      (facts) => facts.shipped,
      (fact) => fact.repository.toLowerCase(),
    ),
  },
  {
    id: 'up-to-date',
    title: 'Up to date',
    description: 'Update PR branches with Update branch',
    icon: GitPullRequestArrow,
    unit: 'branches',
    tiers: [5, 25, 100],
    retroactive: true,
    appOnly: true,
    progress: count(events('branch-updated')),
  },
];
