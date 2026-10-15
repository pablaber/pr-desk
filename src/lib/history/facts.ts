import { isKnownBot } from '../pr/bots';
import { ignoresPullRequest } from '../pr/ignore';
import type { AppState } from '../store/app-state';
import type { AccountHistory, HistoryEvent } from './types';

export interface Fact {
  id: string;
  repository: string;
  at: number;
  // Null until a sync has seen the PR: in-app merges are recorded without a creation time.
  createdAt: number | null;
  author: string;
  authorIsBot: boolean;
}

export interface HistoryFacts {
  trackingSince: number;
  // Your PRs that merged, by merge time.
  authoredMerges: Fact[];
  // PRs you merged yourself, by merge time.
  mergesByYou: Fact[];
  // First approval of a PR written by a person, not a bot.
  approvals: Fact[];
  // Each PR once, at the earliest time any of the three counted.
  shipped: Fact[];
  events: HistoryEvent[];
}

const sameLogin = (a: string | null, b: string) => a?.toLowerCase() === b.toLowerCase();

function parse(time: string | null) {
  const at = time === null ? NaN : Date.parse(time);
  return Number.isNaN(at) ? null : at;
}

// Bot status and ignore rules are decided here, not at ingest, so editing either in Settings
// changes past numbers too. Facts stored before tracking began are dropped for the same reason.
export function historyFacts(
  account: AccountHistory,
  login: string,
  preferences: Pick<AppState, 'knownBots' | 'ignoreRules'>,
): HistoryFacts {
  const { trackingSince } = account;
  const facts: HistoryFacts = {
    trackingSince,
    authoredMerges: [],
    mergesByYou: [],
    approvals: [],
    shipped: [],
    events: account.events.filter((event) => event.at >= trackingSince).sort((a, b) => a.at - b.at),
  };
  for (const entry of Object.values(account.entries)) {
    if (ignoresPullRequest(entry, preferences.ignoreRules)) continue;
    const authorIsBot =
      entry.authorIsApp ||
      isKnownBot({ author: entry.author, authorIsBot: entry.authorIsApp }, preferences.knownBots);
    const fact = (at: number): Fact => ({
      id: entry.id,
      repository: entry.repository,
      at,
      createdAt: parse(entry.createdAt),
      author: entry.author,
      authorIsBot,
    });
    const merged = parse(entry.mergedAt);
    const approved = authorIsBot ? null : parse(entry.approvedAt);
    const times = {
      authored: sameLogin(entry.author, login) ? merged : null,
      byYou: sameLogin(entry.mergedBy, login) ? merged : null,
      approved,
    };
    const counted = (at: number | null): at is number => at !== null && at >= trackingSince;
    if (counted(times.authored)) facts.authoredMerges.push(fact(times.authored));
    if (counted(times.byYou)) facts.mergesByYou.push(fact(times.byYou));
    if (counted(times.approved)) facts.approvals.push(fact(times.approved));
    const qualifying = Object.values(times).filter(counted);
    if (qualifying.length > 0) facts.shipped.push(fact(Math.min(...qualifying)));
  }
  for (const list of [facts.authoredMerges, facts.mergesByYou, facts.approvals, facts.shipped])
    list.sort((a, b) => a.at - b.at);
  return facts;
}
