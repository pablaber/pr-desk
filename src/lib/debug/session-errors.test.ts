import { afterEach, describe, expect, it } from 'vitest';
import { recordError, sessionErrors } from './session-errors.svelte';

const at = (minute: number) => Date.parse(`2026-09-30T12:${String(minute).padStart(2, '0')}:00Z`);

describe('session errors', () => {
  afterEach(() => {
    sessionErrors.length = 0;
  });

  it('records each error with its source and time', () => {
    recordError('refresh', 'Error: offline', at(0));
    recordError('clipboard', 'Could not copy', at(1));
    expect(sessionErrors).toEqual([
      {
        source: 'refresh',
        message: 'Error: offline',
        firstAt: '2026-09-30T12:00:00.000Z',
        lastAt: '2026-09-30T12:00:00.000Z',
        count: 1,
      },
      {
        source: 'clipboard',
        message: 'Could not copy',
        firstAt: '2026-09-30T12:01:00.000Z',
        lastAt: '2026-09-30T12:01:00.000Z',
        count: 1,
      },
    ]);
  });

  it('counts a repeated error and moves it to the end', () => {
    recordError('refresh', 'Error: offline', at(0));
    recordError('clipboard', 'Could not copy', at(1));
    recordError('refresh', 'Error: offline', at(5));
    expect(sessionErrors.map((e) => [e.source, e.count, e.firstAt, e.lastAt])).toEqual([
      ['clipboard', 1, '2026-09-30T12:01:00.000Z', '2026-09-30T12:01:00.000Z'],
      ['refresh', 2, '2026-09-30T12:00:00.000Z', '2026-09-30T12:05:00.000Z'],
    ]);
  });

  it('treats the same message from another source as a separate error', () => {
    recordError('merge', 'Error: denied', at(0));
    recordError('approve-merge', 'Error: denied', at(1));
    expect(sessionErrors).toHaveLength(2);
  });

  it('keeps the 50 most recent errors', () => {
    for (let i = 0; i < 55; i++) recordError('uncaught', `error ${i}`, at(0));
    expect(sessionErrors).toHaveLength(50);
    expect(sessionErrors[0].message).toBe('error 5');
    expect(sessionErrors.at(-1)!.message).toBe('error 54');
  });
});
