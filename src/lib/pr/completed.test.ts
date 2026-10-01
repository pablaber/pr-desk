import { expect, it } from 'vitest';
import { completedGroups } from './completed';
import type { CompletedPR } from './types';

const merged = (id: string, mergedAt: string): CompletedPR => ({
  id,
  url: `https://github.com/${id.replace('#', '/pull/')}`,
  repository: id.split('#')[0],
  number: Number(id.split('#')[1]),
  title: id,
  author: 'me',
  mergedAt,
  mergedBy: null,
});

it('groups by local day, newest first, labelling today and yesterday', () => {
  const now = new Date(2026, 9, 1, 15).getTime();
  const at = (day: number, hour: number) =>
    new Date(2026, day > 1 ? 8 : 9, day, hour).toISOString();
  const groups = completedGroups(
    [
      merged('a/b#1', at(29, 9)),
      merged('a/b#2', at(1, 9)),
      merged('a/b#3', at(30, 9)),
      merged('a/b#4', at(1, 12)),
    ],
    now,
  );
  expect(groups.map((g) => g.label.split(',')[0])).toEqual(['Today', 'Yesterday', 'Tuesday']);
  expect(groups[0].prs.map((p) => p.id)).toEqual(['a/b#4', 'a/b#2']);
});

it('returns no groups when nothing merged', () =>
  expect(completedGroups([], Date.now())).toEqual([]));
