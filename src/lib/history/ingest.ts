import type { AccountHistory, HistoryAction, HistoryEntry, HistoryEvent } from './types';

const DAY = 86_400_000;

function localMidnight(now: number) {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

export function newAccount(now: number): AccountHistory {
  return {
    trackingSince: localMidnight(now),
    syncedThrough: null,
    entries: {},
    events: [],
    achievements: {},
    achievementsSeenAt: 0,
  };
}

// GitHub search takes a day, not a time. The UTC day of an instant never starts after it, so the
// window always covers the instant whatever the local time zone; extra results are deduplicated.
export function syncDate(account: AccountHistory) {
  const from = Math.max(account.trackingSince, (account.syncedThrough ?? -Infinity) - DAY);
  return new Date(from).toISOString().slice(0, 10);
}

const same = (a: string | null, login: string) => a?.toLowerCase() === login.toLowerCase();

// The times at which the PR counts for you: your merged PR, a merge by you, your first approval.
function countedTimes(entry: HistoryEntry, login: string) {
  return [
    same(entry.author, login) ? entry.mergedAt : null,
    same(entry.mergedBy, login) ? entry.mergedAt : null,
    entry.approvedAt,
  ]
    .filter((time) => time !== null)
    .map(Date.parse);
}

const earliest = (a: string | null, b: string | null) =>
  a === null ? b : b === null ? a : Date.parse(b) < Date.parse(a) ? b : a;

// Facts already recorded stay put: missing ones are filled, the first approval wins, and nothing
// is ever removed.
function upsert(existing: HistoryEntry | undefined, incoming: HistoryEntry): HistoryEntry {
  if (!existing) return incoming;
  return {
    ...incoming,
    ...existing,
    createdAt: existing.createdAt || incoming.createdAt,
    mergedAt: existing.mergedAt ?? incoming.mergedAt,
    mergedBy: existing.mergedBy ?? incoming.mergedBy,
    approvedAt: earliest(existing.approvedAt, incoming.approvedAt),
  };
}

export function ingest(
  account: AccountHistory,
  login: string,
  found: HistoryEntry[],
  syncedThrough: number | null = null,
): AccountHistory {
  const entries = { ...account.entries };
  for (const entry of found) {
    const next = upsert(entries[entry.id], entry);
    if (countedTimes(next, login).some((time) => time >= account.trackingSince))
      entries[entry.id] = next;
  }
  return {
    ...account,
    entries,
    syncedThrough:
      syncedThrough === null
        ? account.syncedThrough
        : Math.max(syncedThrough, account.syncedThrough ?? syncedThrough),
  };
}

const sameLocalDay = (a: number, b: number) => localMidnight(a) === localMidnight(b);

function appendEvent(account: AccountHistory, event: HistoryEvent): AccountHistory {
  if (
    event.kind === 'attention-clear' &&
    account.events.some((e) => e.kind === 'attention-clear' && sameLocalDay(e.at, event.at))
  )
    return account;
  return { ...account, events: [...account.events, event] };
}

// In-app actions are recorded straight away rather than waiting for the next sync to find them.
export function applyAction(
  account: AccountHistory,
  action: HistoryAction,
  login: string,
  now: number,
): AccountHistory {
  if (action.kind === 'attention-clear')
    return appendEvent(account, { kind: action.kind, at: now });
  const { pr } = action;
  if (action.kind === 'close-stale')
    return appendEvent(account, { kind: 'stale-closed', at: now, pr: pr.id });
  if (action.kind === 'update-branch')
    return appendEvent(account, { kind: 'branch-updated', at: now, pr: pr.id });
  const at = new Date(now).toISOString();
  return ingest(account, login, [
    {
      id: pr.id,
      url: pr.url,
      repository: pr.repository,
      number: pr.number,
      title: pr.title,
      author: pr.author,
      authorIsApp: pr.authorIsBot,
      createdAt: '',
      mergedAt: at,
      mergedBy: login,
      approvedAt: action.kind === 'approve-merge' ? at : null,
    },
  ]);
}
