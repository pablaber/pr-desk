import type { ClassifiedPR } from './classify';
import type { TrackingReason } from './types';
export const sourceLabels: Record<TrackingReason, string> = {
  owned: 'Mine',
  'direct-review-request': 'Review request',
  'tracked-repository': 'Tracked repo',
  watched: 'Watching',
};
export type StalenessLevel = 'low' | 'medium' | 'high';
const stalenessThresholds: [days: number, level: StalenessLevel][] = [
  [28, 'high'],
  [14, 'medium'],
  [7, 'low'],
];
// Ordered most severe first, so the first threshold the PR is past is the only badge shown.
export function stalenessLevel(updatedAt: string, now: number): StalenessLevel | null {
  const days = (now - Date.parse(updatedAt)) / 86400000;
  return stalenessThresholds.find(([threshold]) => days > threshold)?.[1] ?? null;
}
export function cardViewModel(item: ClassifiedPR, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(item.pr.updatedAt)) / 60000));
  const age =
    minutes < 1
      ? 'just now'
      : minutes < 60
        ? `${minutes}m ago`
        : minutes < 1440
          ? `${Math.floor(minutes / 60)}h ago`
          : `${Math.floor(minutes / 1440)}d ago`;
  const checks = item.pr.checks;
  const secondary = [
    ...item.statuses.filter((s) => s !== item.primary),
    ...(checks.some((c) => c.state === 'failed') &&
    item.primary !== 'Checks failed' &&
    !item.statuses.includes('Checks failed')
      ? ['Checks failed']
      : []),
    ...(item.pr.outdatedUnresolvedThreads
      ? [`${item.pr.outdatedUnresolvedThreads} outdated threads`]
      : []),
  ];
  return {
    ...item,
    badges: item.pr.reasons.map((r) => sourceLabels[r]),
    reviewBadge:
      item.pr.reviewDecision === 'APPROVED'
        ? { label: 'Approved', tone: 'approved' }
        : item.pr.reviewDecision === 'CHANGES_REQUESTED'
          ? { label: 'Changes requested', tone: 'changes-requested' }
          : null,
    staleness: stalenessLevel(item.pr.updatedAt, now),
    age,
    secondary: secondary.join(' · '),
  };
}
