import { describe, expect, it } from 'vitest';
import { buildDebugInfo, type DebugInfoInput } from './debug-info';
import { defaultState } from '../store/app-state';
import { pr } from '../../test/fixtures';

const now = Date.parse('2026-09-30T12:00:00Z');
function input(overrides: Partial<DebugInfoInput> = {}): DebugInfoInput {
  return {
    version: '1.4.0',
    login: 'me',
    now,
    filter: 'all',
    preferences: defaultState(),
    snapshot: {
      prs: [],
      sources: {},
      warnings: [],
      staleIds: [],
      discoveryComplete: true,
    },
    cliInfo: null,
    errors: [],
    ...overrides,
  };
}

describe('debug info', () => {
  it('explains the column, matched rules and signals of each PR', () => {
    const ready = pr({ reviewDecision: 'APPROVED', checks: [{ name: 'CI', state: 'passing' }] });
    const info = buildDebugInfo(
      input({ snapshot: { ...input().snapshot, prs: [ready], staleIds: [ready.id] } }),
    );
    expect(info.generatedAt).toBe('2026-09-30T12:00:00.000Z');
    expect(info.board).toEqual({ readyToMerge: 1, needsAttention: 0, waiting: 0, hidden: 0 });
    expect(info.pullRequests[0]).toMatchObject({
      pr: ready,
      column: 'ready-to-merge',
      hidden: null,
      primary: 'Ready to merge',
      canMerge: true,
      matchedRules: ['ready', 'waiting'],
      stale: true,
      signals: { owned: true, ready: true, checksPassing: true, pr: undefined },
    });
  });

  it('reports why a PR is hidden and which ignore rules match', () => {
    const preferences = defaultState();
    preferences.ignoreRules = [
      { kind: 'repository', value: 'acme/*' },
      { kind: 'author', value: 'someone-else' },
    ];
    preferences.snoozedPullRequests = { 'acme/web#2': { until: '2026-10-01T00:00:00Z' } };
    const prs = [
      pr(),
      pr({ id: 'acme/web#2', repository: 'other/web' }),
      pr({ id: 'other/api#3', repository: 'other/api', author: 'other', draft: true }),
      pr({ id: 'other/api#4', repository: 'other/api', state: 'MERGED' }),
    ];
    const info = buildDebugInfo(input({ preferences, snapshot: { ...input().snapshot, prs } }));
    expect(info.pullRequests.map((p) => [p.column, p.hidden])).toEqual([
      [null, 'ignore-rule'],
      [null, 'snoozed'],
      [null, 'others-draft'],
      [null, 'not-open'],
    ]);
    expect(info.pullRequests[0].matchedIgnoreRules).toEqual([
      { kind: 'repository', value: 'acme/*' },
    ]);
    expect(info.pullRequests[1].snoozedUntil).toBe('2026-10-01T00:00:00Z');
    expect(info.board.hidden).toBe(4);
  });

  it('limits the PR list to one PR while keeping the board context', () => {
    const prs = [pr(), pr({ id: 'acme/api#2', directReviewers: ['me'] })];
    const info = buildDebugInfo(input({ snapshot: { ...input().snapshot, prs } }), 'acme/api#2');
    expect(info.pullRequests.map((p) => p.pr.id)).toEqual(['acme/api#2']);
    expect(info.board).toMatchObject({ needsAttention: 1, waiting: 1 });
  });

  it('includes the errors seen this session', () => {
    const errors = [
      {
        source: 'refresh' as const,
        message: 'Error: offline',
        firstAt: '2026-09-30T11:00:00.000Z',
        lastAt: '2026-09-30T11:30:00.000Z',
        count: 3,
      },
    ];
    expect(buildDebugInfo(input({ errors })).errors).toEqual(errors);
    expect(buildDebugInfo(input({ errors }), 'acme/api#1').errors).toEqual(errors);
  });

  it('serializes to JSON', () => {
    const info = buildDebugInfo(input({ snapshot: { ...input().snapshot, prs: [pr()] } }));
    expect(JSON.parse(JSON.stringify(info)).pullRequests[0].signals).not.toHaveProperty('pr');
  });
});
