import { describe, expect, it } from 'vitest';
import { historyEntry } from '../../test/fixtures';
import { historyFacts } from './facts';
import type { AccountHistory, HistoryEntry } from './types';

const trackingSince = new Date(2026, 9, 1).getTime();
const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).toISOString();
const none = { knownBots: [], ignoreRules: [] };

function account(entries: HistoryEntry[], events: AccountHistory['events'] = []): AccountHistory {
  return {
    trackingSince,
    syncedThrough: null,
    entries: Object.fromEntries(entries.map((entry) => [entry.id, entry])),
    events,
    achievements: {},
    achievementsSeenAt: 0,
  };
}

const ids = (facts: { id: string }[]) => facts.map((fact) => fact.id);

describe('historyFacts', () => {
  it('splits authored merges, merges by you and approvals', () => {
    const facts = historyFacts(
      account([
        historyEntry({ id: 'a#1', mergedAt: at(3), mergedBy: 'sam' }),
        historyEntry({ id: 'a#2', author: 'sam', mergedAt: at(4), mergedBy: 'me' }),
        historyEntry({ id: 'a#3', author: 'sam', approvedAt: at(5) }),
        historyEntry({ id: 'a#4', author: 'sam', mergedAt: at(6), mergedBy: 'sam' }),
      ]),
      'me',
      none,
    );
    expect(ids(facts.authoredMerges)).toEqual(['a#1']);
    expect(ids(facts.mergesByYou)).toEqual(['a#2']);
    expect(ids(facts.approvals)).toEqual(['a#3']);
    expect(ids(facts.shipped)).toEqual(['a#1', 'a#2', 'a#3']);
    expect(facts.trackingSince).toBe(trackingSince);
  });

  it('compares logins case-insensitively and carries the creation time', () => {
    const facts = historyFacts(
      account([
        historyEntry({ id: 'a#1', author: 'Me', mergedAt: at(3), mergedBy: 'ME', createdAt: '' }),
        historyEntry({ id: 'a#2', author: 'Me', mergedAt: at(4), createdAt: at(2) }),
      ]),
      'me',
      none,
    );
    expect(ids(facts.mergesByYou)).toEqual(['a#1']);
    expect(facts.authoredMerges.map((fact) => fact.createdAt)).toEqual([null, Date.parse(at(2))]);
    expect(facts.authoredMerges[0]).toMatchObject({
      repository: 'acme/api',
      author: 'Me',
      authorIsBot: false,
      at: Date.parse(at(3)),
    });
  });

  it('counts a PR once as shipped, at its earliest time, even if it counts three ways', () => {
    const facts = historyFacts(
      account([
        historyEntry({
          id: 'a#1',
          author: 'sam',
          approvedAt: at(2),
          mergedAt: at(5),
          mergedBy: 'me',
        }),
        historyEntry({ id: 'a#2', mergedAt: at(7), mergedBy: 'me', approvedAt: at(8) }),
      ]),
      'me',
      none,
    );
    expect(facts.shipped.map((fact) => [fact.id, fact.at])).toEqual([
      ['a#1', Date.parse(at(2))],
      ['a#2', Date.parse(at(7))],
    ]);
    expect(facts.mergesByYou).toHaveLength(2);
  });

  it('leaves out approvals of PRs written by bots, by app or by known bot', () => {
    const facts = historyFacts(
      account([
        historyEntry({ id: 'a#1', author: 'dependabot', authorIsApp: true, approvedAt: at(2) }),
        historyEntry({ id: 'a#2', author: 'Release-User', approvedAt: at(3) }),
        historyEntry({ id: 'a#3', author: 'sam', approvedAt: at(4) }),
      ]),
      'me',
      { knownBots: ['release-user'], ignoreRules: [] },
    );
    expect(ids(facts.approvals)).toEqual(['a#3']);
    expect(ids(facts.shipped)).toEqual(['a#3']);
  });

  it('still counts merging a bot PR, and flags its author', () => {
    const facts = historyFacts(
      account([
        historyEntry({
          id: 'a#1',
          author: 'renovate',
          authorIsApp: true,
          mergedAt: at(3),
          mergedBy: 'me',
          approvedAt: at(2),
        }),
      ]),
      'me',
      none,
    );
    expect(facts.mergesByYou[0].authorIsBot).toBe(true);
    expect(facts.approvals).toEqual([]);
    expect(facts.shipped[0].at).toBe(Date.parse(at(3)));
  });

  it('applies the current ignore rules', () => {
    const entries = [
      historyEntry({ id: 'a#1', repository: 'acme/api', mergedAt: at(3) }),
      historyEntry({ id: 'b#1', repository: 'acme/web', mergedAt: at(3) }),
      historyEntry({ id: 'c#1', repository: 'acme/c', title: 'WIP thing', mergedAt: at(3) }),
      historyEntry({ id: 'd#1', repository: 'acme/d', author: 'sam', approvedAt: at(3) }),
    ];
    const facts = historyFacts(account(entries), 'me', {
      knownBots: [],
      ignoreRules: [
        { kind: 'repository', value: 'acme/web' },
        { kind: 'title', value: 'WIP*' },
        { kind: 'author', value: 'SAM' },
      ],
    });
    expect(ids(facts.authoredMerges)).toEqual(['a#1']);
    expect(ids(facts.shipped)).toEqual(['a#1']);
    expect(facts.approvals).toEqual([]);
  });

  it('drops facts before tracking began, but keeps a later fact of the same PR', () => {
    const facts = historyFacts(
      account(
        [
          historyEntry({ id: 'a#1', mergedAt: at(1, 0) }),
          historyEntry({
            id: 'a#2',
            author: 'sam',
            approvedAt: new Date(trackingSince - 1).toISOString(),
            mergedAt: at(4),
            mergedBy: 'me',
          }),
          historyEntry({ id: 'a#3', mergedAt: new Date(trackingSince - 1).toISOString() }),
        ],
        [
          { kind: 'stale-closed', at: trackingSince - 1 },
          { kind: 'branch-updated', at: trackingSince + 5 },
          { kind: 'attention-clear', at: trackingSince },
        ],
      ),
      'me',
      none,
    );
    expect(ids(facts.authoredMerges)).toEqual(['a#1']);
    expect(ids(facts.approvals)).toEqual([]);
    expect(facts.shipped.map((fact) => [fact.id, fact.at])).toEqual([
      ['a#1', Date.parse(at(1, 0))],
      ['a#2', Date.parse(at(4))],
    ]);
    expect(facts.events.map((event) => event.kind)).toEqual(['attention-clear', 'branch-updated']);
  });

  it('sorts every list by time', () => {
    const facts = historyFacts(
      account([
        historyEntry({ id: 'a#1', mergedAt: at(9), mergedBy: 'me' }),
        historyEntry({ id: 'a#2', mergedAt: at(3), mergedBy: 'me' }),
        historyEntry({ id: 'a#3', author: 'sam', approvedAt: at(6) }),
        historyEntry({ id: 'a#4', author: 'sam', approvedAt: at(2) }),
      ]),
      'me',
      none,
    );
    expect(ids(facts.authoredMerges)).toEqual(['a#2', 'a#1']);
    expect(ids(facts.mergesByYou)).toEqual(['a#2', 'a#1']);
    expect(ids(facts.approvals)).toEqual(['a#4', 'a#3']);
    expect(ids(facts.shipped)).toEqual(['a#4', 'a#2', 'a#3', 'a#1']);
  });
});
