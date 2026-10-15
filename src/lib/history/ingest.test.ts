import { describe, expect, it } from 'vitest';
import { historyEntry, pr } from '../../test/fixtures';
import { applyAction, ingest, newAccount, syncDate } from './ingest';

const now = new Date(2026, 9, 15, 14, 30).getTime();
const midnight = new Date(2026, 9, 15).getTime();
const account = () => newAccount(now);

describe('tracking window', () => {
  it('starts tracking at local midnight of the first day', () => {
    expect(account()).toEqual({
      trackingSince: midnight,
      syncedThrough: null,
      entries: {},
      events: [],
    });
  });

  it('searches from the UTC day containing the later of tracking start and a day before the last sync', () => {
    const day = (t: number) => new Date(t).toISOString().slice(0, 10);
    expect(syncDate(account())).toBe(day(midnight));
    const later = now + 3 * 86_400_000;
    expect(syncDate({ ...account(), syncedThrough: later })).toBe(day(later - 86_400_000));
    expect(syncDate({ ...account(), syncedThrough: now })).toBe(day(midnight));
  });
});

describe('ingest', () => {
  const before = new Date(midnight - 60_000).toISOString();
  const after = new Date(midnight + 60_000).toISOString();

  it('keeps only PRs that count for you on or after tracking began', () => {
    const next = ingest(account(), 'Me', [
      historyEntry({ id: 'a#1', mergedAt: after }),
      historyEntry({ id: 'a#2', author: 'sam', mergedAt: after, mergedBy: 'me' }),
      historyEntry({ id: 'a#3', author: 'sam', approvedAt: after }),
      historyEntry({ id: 'a#4', author: 'sam', mergedAt: after, mergedBy: 'sam' }),
      historyEntry({ id: 'a#5', mergedAt: before, approvedAt: null }),
      historyEntry({ id: 'a#6', author: 'sam', approvedAt: before, mergedAt: after }),
      historyEntry({
        id: 'a#7',
        author: 'sam',
        approvedAt: before,
        mergedBy: 'me',
        mergedAt: after,
      }),
    ]);
    expect(Object.keys(next.entries).sort()).toEqual(['a#1', 'a#2', 'a#3', 'a#7']);
  });

  it('fills missing facts, keeps the first approval and never deletes', () => {
    const first = ingest(account(), 'me', [
      historyEntry({ id: 'a#1', author: 'sam', approvedAt: after, createdAt: '' }),
      historyEntry({ id: 'a#2', mergedAt: after }),
    ]);
    const later = new Date(midnight + 120_000).toISOString();
    const next = ingest(first, 'me', [
      historyEntry({
        id: 'a#1',
        author: 'sam',
        approvedAt: later,
        mergedAt: later,
        mergedBy: 'me',
        title: 'Renamed',
      }),
    ]);
    expect(next.entries['a#1']).toMatchObject({
      approvedAt: after,
      mergedAt: later,
      mergedBy: 'me',
      createdAt: '2026-09-20T10:00:00Z',
      title: 'Improve caching',
    });
    expect(next.entries['a#2']).toEqual(first.entries['a#2']);
    expect(
      ingest(next, 'me', [historyEntry({ id: 'a#1', approvedAt: before })]).entries['a#1'],
    ).toMatchObject({ approvedAt: before });
  });

  it('advances syncedThrough only when given, and never backwards', () => {
    expect(ingest(account(), 'me', []).syncedThrough).toBeNull();
    const synced = ingest(account(), 'me', [], now);
    expect(synced.syncedThrough).toBe(now);
    expect(ingest(synced, 'me', [], now - 1).syncedThrough).toBe(now);
    expect(ingest(synced, 'me', []).syncedThrough).toBe(now);
  });
});

describe('in-app actions', () => {
  const at = new Date(now).toISOString();

  it('records a merge by you, and an approval for approve and merge', () => {
    const bot = pr({ id: 'acme/api#7', number: 7, author: 'renovate', authorIsBot: true });
    const merged = applyAction(account(), { kind: 'merge', pr: bot }, 'me', now);
    expect(merged.entries['acme/api#7']).toEqual({
      id: 'acme/api#7',
      url: bot.url,
      repository: 'acme/api',
      number: 7,
      title: bot.title,
      author: 'renovate',
      authorIsApp: true,
      createdAt: '',
      mergedAt: at,
      mergedBy: 'me',
      approvedAt: null,
    });
    const approved = applyAction(account(), { kind: 'approve-merge', pr: bot }, 'me', now);
    expect(approved.entries['acme/api#7']).toMatchObject({ mergedAt: at, approvedAt: at });
  });

  it('appends stale closes and branch updates', () => {
    let next = applyAction(account(), { kind: 'close-stale', pr: pr() }, 'me', now);
    next = applyAction(next, { kind: 'update-branch', pr: pr() }, 'me', now + 1);
    expect(next.events).toEqual([
      { kind: 'stale-closed', at: now, pr: 'acme/api#1' },
      { kind: 'branch-updated', at: now + 1, pr: 'acme/api#1' },
    ]);
  });

  it('records a clear desk at most once per local day', () => {
    let next = applyAction(account(), { kind: 'attention-clear' }, 'me', now);
    next = applyAction(next, { kind: 'attention-clear' }, 'me', now + 3_600_000);
    const tomorrow = new Date(2026, 9, 16, 0, 5).getTime();
    next = applyAction(next, { kind: 'attention-clear' }, 'me', tomorrow);
    expect(next.events).toEqual([
      { kind: 'attention-clear', at: now },
      { kind: 'attention-clear', at: tomorrow },
    ]);
  });
});
