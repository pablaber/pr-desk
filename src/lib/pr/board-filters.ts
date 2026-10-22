interface FilterCount {
  value: string;
  count: number;
}
// Each PR counts once under every value it carries, so a stack adds all of its layers just as the
// columns do, and a PR with two title tags counts under both. The selected value stays listed at
// zero so the menu still shows what the board is filtered to.
export function filterCounts(values: string[][], selected: string | null): FilterCount[] {
  const counts = new Map<string, number>();
  if (selected) counts.set(selected, 0);
  for (const value of values.flatMap((v) => [...new Set(v)]))
    counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
}
