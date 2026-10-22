import { afterEach, describe, expect, it } from 'vitest';
import { recordError, requestSummary, sessionErrors } from './session-errors.svelte';
import type { GitHubRequestDetails } from '../github/types';

const at = (minute: number) => Date.parse(`2026-09-30T12:${String(minute).padStart(2, '0')}:00Z`);

describe('session errors', () => {
  afterEach(() => {
    sessionErrors.length = 0;
  });

  it('records each error with its source and time', () => {
    recordError('refresh', 'Error: offline', undefined, at(0));
    recordError('clipboard', 'Could not copy', undefined, at(1));
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
    recordError('refresh', 'Error: offline', undefined, at(0));
    recordError('clipboard', 'Could not copy', undefined, at(1));
    recordError('refresh', 'Error: offline', undefined, at(5));
    expect(sessionErrors.map((e) => [e.source, e.count, e.firstAt, e.lastAt])).toEqual([
      ['clipboard', 1, '2026-09-30T12:01:00.000Z', '2026-09-30T12:01:00.000Z'],
      ['refresh', 2, '2026-09-30T12:00:00.000Z', '2026-09-30T12:05:00.000Z'],
    ]);
  });

  it('treats the same message from another source as a separate error', () => {
    recordError('merge', 'Error: denied', undefined, at(0));
    recordError('approve-merge', 'Error: denied', undefined, at(1));
    expect(sessionErrors).toHaveLength(2);
  });

  it('keeps the 50 most recent errors', () => {
    for (let i = 0; i < 55; i++) recordError('uncaught', `error ${i}`, undefined, at(0));
    expect(sessionErrors).toHaveLength(50);
    expect(sessionErrors[0].message).toBe('error 5');
    expect(sessionErrors.at(-1)!.message).toBe('error 54');
  });

  it('keeps the details of the latest gh failure for a repeated error', () => {
    const first = { ...details, requestId: 'A:1' };
    const second = { ...details, requestId: 'B:2' };
    recordError('refresh-warning', 'owned: failed', first, at(0));
    recordError('refresh-warning', 'owned: failed', second, at(1));
    recordError('refresh-warning', 'owned: failed', undefined, at(2));
    expect(sessionErrors).toEqual([expect.objectContaining({ count: 3, details: second })]);
  });
});

const details: GitHubRequestDetails = {
  operation: 'DeskSearch',
  command: 'gh api graphql',
  failure: 'http',
  exitStatus: 1,
  durationMs: 3140,
};

describe('requestSummary', () => {
  it('summarizes an HTTP failure with its rate limit and request ID', () => {
    expect(
      requestSummary({
        ...details,
        httpStatus: 502,
        requestId: 'C582:11C129',
        rateLimit: { resource: 'graphql', limit: 5000, remaining: 4978 },
      }),
    ).toBe(
      'DeskSearch · HTTP 502 · exit 1 · 3.1s · rate limit 4978/5000 left · request C582:11C129',
    );
  });
  it('names GraphQL error types and a retry delay', () => {
    expect(
      requestSummary({
        ...details,
        failure: 'graphql',
        httpStatus: 200,
        retryAfterSeconds: 60,
        graphqlErrors: [{ type: 'RATE_LIMITED' }, { code: 'undefinedField' }, {}],
      }),
    ).toBe(
      'DeskSearch · GraphQL error · RATE_LIMITED, undefinedField · exit 1 · 3.1s · retry after 60s',
    );
  });
  it('describes failures without a response', () => {
    expect(
      requestSummary({ ...details, failure: 'timeout', exitStatus: undefined, durationMs: 45000 }),
    ).toBe('DeskSearch · timed out · 45.0s');
    expect(requestSummary({ ...details, failure: 'exit' })).toBe(
      'DeskSearch · no response from GitHub · exit 1 · 3.1s',
    );
  });
});
