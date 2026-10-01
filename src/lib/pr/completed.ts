import type { CompletedPR } from './types';

export interface CompletedGroup {
  key: string;
  label: string;
  prs: CompletedPR[];
}

const dayKey = (time: number) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

// Newest merge first, grouped by local calendar day so "Today" matches the user's clock.
export function completedGroups(prs: CompletedPR[], now: number): CompletedGroup[] {
  const groups: CompletedGroup[] = [];
  const sorted = [...prs].sort(
    (a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt) || a.id.localeCompare(b.id),
  );
  for (const pr of sorted) {
    const time = Date.parse(pr.mergedAt);
    const key = dayKey(time);
    let group = groups.find((g) => g.key === key);
    if (!group) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      groups.push(
        (group = {
          key,
          label:
            key === dayKey(now)
              ? 'Today'
              : key === dayKey(yesterday.getTime())
                ? 'Yesterday'
                : new Date(time).toLocaleDateString([], {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  }),
          prs: [],
        }),
      );
    }
    group.prs.push(pr);
  }
  return groups;
}
