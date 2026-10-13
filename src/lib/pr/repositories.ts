interface RepositoryCount {
  repository: string;
  count: number;
}
// Each PR counts, so a stack adds all of its layers just as the columns do. The selected
// repository stays listed at zero so the menu still shows what the board is filtered to.
export function repositoryCounts(
  items: { pr: { repository: string } }[],
  selected: string | null,
): RepositoryCount[] {
  const counts = new Map<string, number>();
  if (selected) counts.set(selected, 0);
  for (const { pr } of items) counts.set(pr.repository, (counts.get(pr.repository) ?? 0) + 1);
  return [...counts]
    .map(([repository, count]) => ({ repository, count }))
    .sort((a, b) => a.repository.localeCompare(b.repository));
}
