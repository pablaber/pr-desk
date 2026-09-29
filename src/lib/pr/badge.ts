import type { DockBadgeMode } from '../store/app-state';
import type { DashboardState } from './types';

const COUNTED: Record<DockBadgeMode, DashboardState[]> = {
  off: [],
  'ready-to-merge': ['ready-to-merge'],
  'needs-attention': ['needs-attention'],
  both: ['ready-to-merge', 'needs-attention'],
};

export function badgeCount(items: { state: DashboardState }[], mode: DockBadgeMode): number {
  const counted = COUNTED[mode];
  return items.filter((item) => counted.includes(item.state)).length;
}
