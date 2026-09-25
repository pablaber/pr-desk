import type { ClassifiedPR } from './classify';
import type { TrackingReason } from './types';
export const sourceLabels: Record<TrackingReason, string> = {
  owned: 'Mine',
  'direct-review-request': 'Review request',
  'tracked-repository': 'Tracked repo',
  watched: 'Watching',
};
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
    ...(checks.some((c) => !c.required && c.state === 'failed') ? ['Optional checks failed'] : []),
    ...(item.pr.outdatedUnresolvedThreads
      ? [`${item.pr.outdatedUnresolvedThreads} outdated threads`]
      : []),
  ];
  return {
    ...item,
    badges: item.pr.reasons.map((r) => sourceLabels[r]),
    age,
    secondary: secondary.join(' · '),
  };
}
