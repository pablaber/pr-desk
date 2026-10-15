import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { historyEntry, pr } from '../../test/fixtures';
import { HistoryLog, SYNC_INTERVAL_MS, type HistoryDeps } from './history.svelte';
import type { HistoryFile, HistorySyncResult } from './types';

const start = new Date(2026, 9, 15, 9, 0).getTime();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

function setup(file: HistoryFile | Error = { version: 1, accounts: {} }) {
  const saved: HistoryFile[] = [];
  const deps = {
    load: vi.fn(async () => {
      if (file instanceof Error) throw file;
      return file;
    }),
    save: vi.fn<HistoryDeps['save']>(async (next) => void saved.push(structuredClone(next))),
    fetch: vi.fn<HistoryDeps['fetch']>(async () => ({ entries: [], warnings: [], complete: true })),
    onWarning: vi.fn(),
    now: () => Date.now(),
  };
  return { deps, saved, log: new HistoryLog(deps) };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe('HistoryLog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(start);
  });
  afterEach(() => vi.useRealTimers());

  it('creates and saves an account the first time a login is seen', async () => {
    const { log, saved } = setup();
    await log.open('me');
    await flush();
    expect(log.account?.trackingSince).toBe(new Date(2026, 9, 15).getTime());
    expect(saved).toHaveLength(1);
    expect(saved[0].accounts.me.trackingSince).toBe(log.account?.trackingSince);
  });

  it('keeps an existing account and other accounts untouched', async () => {
    const other = { trackingSince: 1, syncedThrough: null, entries: {}, events: [] };
    const mine = { ...other, trackingSince: 2 };
    const { log, saved } = setup({ version: 1, accounts: { other, me: mine } });
    await log.open('me');
    expect(log.account).toEqual(mine);
    log.record({ kind: 'attention-clear' });
    await flush();
    expect(saved).toHaveLength(1);
    expect(saved[0].accounts.other).toEqual(other);
  });

  it('records nothing and writes nothing when the file cannot be read', async () => {
    const { log, deps } = setup(new Error('Unsupported history version.'));
    await log.open('me');
    log.record({ kind: 'attention-clear' });
    log.start();
    await flush();
    expect(log.account).toBeNull();
    expect(deps.save).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(deps.onWarning).toHaveBeenCalledWith('Error: Unsupported history version.');
  });

  it('records in-app actions straight away and serializes the writes', async () => {
    const { log, deps, saved } = setup();
    await log.open('me');
    const first = deferred<void>();
    deps.save.mockImplementationOnce(() => first.promise);
    log.record({ kind: 'merge', pr: pr() });
    log.record({ kind: 'close-stale', pr: pr() });
    expect(log.account?.entries['acme/api#1']).toMatchObject({ mergedBy: 'me' });
    expect(log.account?.events).toHaveLength(1);
    await flush();
    expect(log.busy).toBe(true);
    // The account's creation was saved on open; the merge's write holds back the stale close's.
    expect(deps.save).toHaveBeenCalledTimes(2);
    first.resolve();
    await flush();
    expect(log.busy).toBe(false);
    expect(deps.save).toHaveBeenCalledTimes(3);
    expect(saved.at(-1)?.accounts.me.events).toHaveLength(1);
  });

  it('reports a failed write and keeps writing later changes', async () => {
    const { log, deps } = setup();
    await log.open('me');
    deps.save.mockRejectedValueOnce(new Error('disk full'));
    log.record({ kind: 'attention-clear' });
    await flush();
    expect(deps.onWarning).toHaveBeenCalledWith('Could not save history: Error: disk full');
    expect(log.busy).toBe(false);
  });

  it('syncs once when started, then hourly, and ignores further starts', async () => {
    const { log, deps } = setup();
    void log.open('me');
    log.start();
    log.start();
    await flush();
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(deps.fetch).toHaveBeenCalledWith('me', new Date(2026, 9, 15).toISOString().slice(0, 10));
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS - 1);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
  });

  it('joins a sync already running and restarts the hour after an extra sync', async () => {
    const { log, deps } = setup();
    await log.open('me');
    const pending = deferred<HistorySyncResult>();
    deps.fetch.mockImplementationOnce(() => pending.promise);
    log.start();
    const again = log.sync();
    await flush();
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    pending.resolve({ entries: [], warnings: [], complete: true });
    await again;
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS / 2);
    await log.sync();
    expect(deps.fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS - 1);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.fetch).toHaveBeenCalledTimes(3);
  });

  it('syncs on demand without scheduling until started', async () => {
    const { log, deps } = setup();
    await log.open('me');
    await log.sync();
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 2);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });

  it('advances syncedThrough only when every search succeeded', async () => {
    const { log, deps } = setup();
    await log.open('me');
    const mergedAt = new Date(start + 1000).toISOString();
    deps.fetch.mockResolvedValueOnce({
      entries: [historyEntry({ mergedAt })],
      warnings: ['History sync (repo:a/b): offline'],
      complete: false,
    });
    vi.setSystemTime(start + 5000);
    await log.sync();
    expect(log.account?.entries['acme/api#1']).toMatchObject({ mergedAt });
    expect(log.account?.syncedThrough).toBeNull();
    expect(deps.onWarning).toHaveBeenCalledWith('History sync (repo:a/b): offline');
    await log.sync();
    expect(log.account?.syncedThrough).toBe(start + 5000);
    deps.fetch.mockRejectedValueOnce(new Error('boom'));
    await log.sync();
    expect(log.account?.syncedThrough).toBe(start + 5000);
    expect(deps.onWarning).toHaveBeenCalledWith('History sync failed: Error: boom');
  });

  it('keeps in-app writes made while a sync was running', async () => {
    const { log, deps } = setup();
    await log.open('me');
    const pending = deferred<HistorySyncResult>();
    deps.fetch.mockImplementationOnce(() => pending.promise);
    const sync = log.sync();
    await flush();
    log.record({ kind: 'update-branch', pr: pr() });
    pending.resolve({ entries: [], warnings: [], complete: true });
    await sync;
    expect(log.account?.events).toHaveLength(1);
    expect(log.account?.syncedThrough).toBe(start);
  });

  it('stops the hourly sync when disposed', async () => {
    const { log, deps } = setup();
    await log.open('me');
    log.start();
    await flush();
    log.dispose();
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 2);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });
});
