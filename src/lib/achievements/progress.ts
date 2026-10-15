import type { HistoryFacts } from '../history/facts';
import type { HistoryEventKind } from '../history/types';
import type { Progress } from './types';

type Timed = { at: number };

const ascending = (a: number, b: number) => a - b;

// Every selected fact or event counts once.
export const count =
  (select: (facts: HistoryFacts) => Timed[]): Progress =>
  (facts) =>
    select(facts)
      .map((item) => item.at)
      .sort(ascending);

// Counts each key once, at the first time it appeared.
export function distinct<T extends Timed>(
  select: (facts: HistoryFacts) => T[],
  key: (item: T) => string,
): Progress {
  return (facts) => {
    const first = new Map<string, number>();
    for (const item of select(facts)) {
      const seen = first.get(key(item));
      if (seen === undefined || item.at < seen) first.set(key(item), item.at);
    }
    return [...first.values()].sort(ascending);
  };
}

export const events = (kind: HistoryEventKind) => (facts: HistoryFacts) =>
  facts.events.filter((event) => event.kind === kind);
