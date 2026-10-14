import { describe, expect, it, vi } from 'vitest';
import { pr } from '../../test/fixtures';
import { settledPullRequest } from './mergeability';

describe('settledPullRequest', () => {
  it('returns a settled PR without waiting', async () => {
    const load = vi.fn(async () => pr());
    const wait = vi.fn(async () => {});
    expect(await settledPullRequest(load, undefined, wait)).toEqual(pr());
    expect(load).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('reloads while GitHub recomputes mergeability after the base branch moves', async () => {
    const states = [
      pr({ mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' }),
      pr({ mergeStateStatus: 'UNKNOWN' }),
      pr({ mergeStateStatus: 'BLOCKED' }),
    ];
    const load = vi.fn(async () => states.shift()!);
    const onWait = vi.fn();
    const wait = vi.fn(async () => {});
    expect((await settledPullRequest(load, onWait, wait)).mergeStateStatus).toBe('BLOCKED');
    expect(load).toHaveBeenCalledTimes(3);
    expect(onWait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(1000);
  });

  it('gives up and returns the unsettled PR after a bounded number of reads', async () => {
    const load = vi.fn(async () => pr({ mergeable: 'UNKNOWN' }));
    expect((await settledPullRequest(load, undefined, async () => {})).mergeable).toBe('UNKNOWN');
    expect(load).toHaveBeenCalledTimes(15);
  });
});
