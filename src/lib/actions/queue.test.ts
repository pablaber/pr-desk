import { describe, expect, it, vi } from 'vitest';
import { pr } from '../../test/fixtures';
import { ActionQueue } from './queue.svelte';
import type { QueuedAction } from './types';

const one = pr({ id: 'acme/api#1', number: 1 });
const two = pr({ id: 'acme/api#2', number: 2 });
const three = pr({ id: 'acme/api#3', number: 3 });

// Each run waits to be settled by the test, so it can look at the queue in between.
function setup() {
  const runs: {
    entry: QueuedAction;
    report: (detail: string) => void;
    finish: () => void;
    fail: (error: unknown) => void;
  }[] = [];
  const onDone = vi.fn();
  const onFailed = vi.fn();
  const onDrained = vi.fn();
  const queue = new ActionQueue({
    run: (entry, report) =>
      new Promise<void>((finish, fail) => runs.push({ entry, report, finish, fail })),
    onDone,
    onFailed,
    onDrained,
  });
  return { queue, runs, onDone, onFailed, onDrained };
}
const settle = () => new Promise((resolve) => setTimeout(resolve));
const statuses = (queue: ActionQueue) => queue.entries.map((e) => e.status);

describe('ActionQueue', () => {
  it('runs one action at a time in the order they were confirmed', async () => {
    const { queue, runs, onDone, onDrained } = setup();
    queue.enqueue('merge', one, 'squash');
    queue.enqueue('update-branch', two, 'squash');
    queue.enqueue('approve-merge', three, 'rebase');
    expect(runs.map((r) => r.entry.pr.number)).toEqual([1]);
    expect(statuses(queue)).toEqual(['running', 'queued', 'queued']);
    expect(queue.position(two.id)).toBe(1);
    expect(queue.position(three.id)).toBe(2);
    expect(queue.position(one.id)).toBe(0);

    runs[0].finish();
    await settle();
    expect(runs.map((r) => r.entry.pr.number)).toEqual([1, 2]);
    expect(queue.done).toBe(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDrained).not.toHaveBeenCalled();

    runs[1].finish();
    await settle();
    expect(runs[2].entry).toMatchObject({ kind: 'approve-merge', method: 'rebase' });
    runs[2].finish();
    await settle();
    expect(queue.entries).toEqual([]);
    expect(queue.done).toBe(0);
    expect(onDone).toHaveBeenCalledTimes(3);
    expect(onDrained).toHaveBeenCalledTimes(1);
  });

  it('has already removed an entry when reporting it done', async () => {
    const seen: number[] = [];
    const queue = new ActionQueue({
      run: async () => {},
      onDone: () => seen.push(queue.entries.length),
      onFailed: () => {},
      onDrained: () => {},
    });
    queue.enqueue('merge', one, 'squash');
    queue.enqueue('merge', two, 'squash');
    await settle();
    expect(seen).toEqual([1, 0]);
  });

  it('refuses a PR that is already in the queue', () => {
    const { queue } = setup();
    queue.enqueue('merge', one, 'squash');
    queue.enqueue('update-branch', one, 'squash');
    expect(queue.entries).toHaveLength(1);
    expect(queue.has(one.id)).toBe(true);
    expect(queue.has(two.id)).toBe(false);
  });

  it('shows the step the running action reports', () => {
    const { queue, runs } = setup();
    queue.enqueue('merge', one, 'squash');
    runs[0].report('Waiting for GitHub to recheck the PR…');
    expect(queue.entry(one.id)?.detail).toBe('Waiting for GitHub to recheck the PR…');
  });

  it('pauses everything behind a failure', async () => {
    const { queue, runs, onDone, onFailed, onDrained } = setup();
    queue.enqueue('merge', one, 'squash');
    queue.enqueue('merge', two, 'squash');
    runs[0].report('Merging');
    runs[0].fail(new Error('Merge rejected'));
    await settle();
    expect(runs).toHaveLength(1);
    expect(statuses(queue)).toEqual(['failed', 'queued']);
    expect(queue.entries[0]).toMatchObject({ error: 'Merge rejected', detail: '' });
    expect(queue.paused).toBe(true);
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(onDrained).not.toHaveBeenCalled();
  });

  it('reports a rejected string as it came from the bridge', async () => {
    const { queue, runs } = setup();
    queue.enqueue('merge', one, 'squash');
    runs[0].fail('Merge rejected by repository rules');
    await settle();
    expect(queue.entries[0].error).toBe('Merge rejected by repository rules');
  });

  it('keeps new actions waiting behind a failure', async () => {
    const { queue, runs } = setup();
    queue.enqueue('merge', one, 'squash');
    runs[0].fail(new Error('Nope'));
    await settle();
    queue.enqueue('merge', two, 'squash');
    await settle();
    expect(runs).toHaveLength(1);
    expect(statuses(queue)).toEqual(['failed', 'queued']);
  });

  it('retries the failed action, then carries on', async () => {
    const { queue, runs } = setup();
    queue.enqueue('merge', one, 'squash');
    queue.enqueue('merge', two, 'squash');
    runs[0].fail(new Error('Nope'));
    await settle();
    queue.retry();
    expect(runs.map((r) => r.entry.pr.number)).toEqual([1, 1]);
    expect(queue.entries[0]).toMatchObject({ status: 'running', error: '' });
    expect(queue.paused).toBe(false);
    runs[1].finish();
    await settle();
    expect(runs.map((r) => r.entry.pr.number)).toEqual([1, 1, 2]);
  });

  it('skips the failed action and resumes the rest', async () => {
    const { queue, runs, onDone } = setup();
    queue.enqueue('merge', one, 'squash');
    queue.enqueue('merge', two, 'squash');
    runs[0].fail(new Error('Nope'));
    await settle();
    queue.skip();
    await settle();
    expect(runs.map((r) => r.entry.pr.number)).toEqual([1, 2]);
    expect(queue.has(one.id)).toBe(false);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('drains when the only action left is skipped', async () => {
    const { queue, runs, onDrained } = setup();
    queue.enqueue('merge', one, 'squash');
    runs[0].fail(new Error('Nope'));
    await settle();
    queue.skip();
    await settle();
    expect(queue.entries).toEqual([]);
    expect(onDrained).toHaveBeenCalledTimes(1);
  });

  it('ignores retry and skip unless paused', async () => {
    const { queue, runs } = setup();
    queue.enqueue('merge', one, 'squash');
    queue.enqueue('merge', two, 'squash');
    queue.retry();
    queue.skip();
    await settle();
    expect(runs).toHaveLength(1);
    expect(statuses(queue)).toEqual(['running', 'queued']);
  });

  it('clears the failed action and everything waiting', async () => {
    const { queue, runs, onDrained } = setup();
    queue.enqueue('merge', one, 'squash');
    queue.enqueue('merge', two, 'squash');
    runs[0].fail(new Error('Nope'));
    await settle();
    queue.clear();
    expect(queue.entries).toEqual([]);
    expect(runs).toHaveLength(1);
    expect(onDrained).toHaveBeenCalledTimes(1);
  });

  it('cannot cancel the running action', async () => {
    const { queue, runs, onDrained } = setup();
    queue.enqueue('merge', one, 'squash');
    queue.enqueue('merge', two, 'squash');
    queue.remove(queue.entries[0].key);
    queue.clear();
    expect(statuses(queue)).toEqual(['running']);
    expect(onDrained).not.toHaveBeenCalled();
    runs[0].finish();
    await settle();
    expect(runs).toHaveLength(1);
    expect(onDrained).toHaveBeenCalledTimes(1);
  });

  it('removes a waiting action only', async () => {
    const { queue, runs } = setup();
    queue.enqueue('merge', one, 'squash');
    queue.enqueue('merge', two, 'squash');
    queue.enqueue('merge', three, 'squash');
    queue.remove(queue.entries[1].key);
    expect(queue.entries.map((e) => e.pr.number)).toEqual([1, 3]);
    runs[0].finish();
    await settle();
    expect(runs.map((r) => r.entry.pr.number)).toEqual([1, 3]);
  });

  it('is busy while anything can still run, but not while paused', async () => {
    const { queue, runs } = setup();
    expect(queue.busy).toBe(false);
    queue.enqueue('merge', one, 'squash');
    queue.enqueue('merge', two, 'squash');
    expect(queue.busy).toBe(true);
    runs[0].fail(new Error('Nope'));
    await settle();
    expect(queue.busy).toBe(false);
    queue.retry();
    expect(queue.busy).toBe(true);
  });

  it('starts counting again for the next batch', async () => {
    const { queue, runs } = setup();
    queue.enqueue('merge', one, 'squash');
    runs[0].finish();
    await settle();
    queue.enqueue('merge', two, 'squash');
    expect(queue.done).toBe(0);
    expect(runs[1].entry.key).toBeGreaterThan(runs[0].entry.key);
  });
});
