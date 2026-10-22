import type { SourceWarning } from '../github/types';
import type { PullRequest } from '../pr/types';

export interface HistoryEntry {
  // The canonical `owner/repo#number` id the rest of the app uses. In-app actions only know the PR
  // by that id, so keying by it lets a later sync land on the same entry.
  id: string;
  url: string;
  repository: string;
  number: number;
  title: string;
  author: string;
  authorIsApp: boolean;
  // Empty until a sync sees the PR: the dashboard's own queries do not ask for creation time.
  createdAt: string;
  mergedAt: string | null;
  mergedBy: string | null;
  // The first time you approved the PR.
  approvedAt: string | null;
}

export type HistoryEventKind = 'stale-closed' | 'branch-updated' | 'attention-clear';

export interface HistoryEvent {
  kind: HistoryEventKind;
  at: number;
  pr?: string;
}

export interface AccountHistory {
  // Local midnight of the day history began for this account; nothing earlier ever counts.
  trackingSince: number;
  // When the last sync in which every search succeeded started.
  syncedThrough: number | null;
  entries: Record<string, HistoryEntry>;
  events: HistoryEvent[];
  // Keyed by achievement id. Ids no longer in the catalog stay, so nothing earned is ever lost.
  achievements: Record<string, StoredAchievement>;
  // Levels recorded after this were never shown on Completed, which puts a dot on its nav entry.
  achievementsSeenAt: number;
}

export interface AchievementLevel {
  threshold: number;
  // When the threshold was really reached.
  at: number;
  // When PR Desk stored it.
  recordedAt: number;
}

export interface StoredAchievement {
  // The first time this account was evaluated against the achievement.
  firstSeenAt: number;
  // Only ever grows: its length is the highest level reached, whatever the tiers say now.
  levels: AchievementLevel[];
}

export interface HistoryFile {
  version: 1;
  accounts: Record<string, AccountHistory>;
}

export interface HistorySyncResult {
  entries: HistoryEntry[];
  warnings: SourceWarning[];
  // False when any search failed, so the window must be searched again next time.
  complete: boolean;
}

// What App reports after an in-app action, or after a refresh that left Needs attention empty.
export type HistoryAction =
  | { kind: 'merge' | 'approve-merge' | 'close-stale' | 'update-branch'; pr: PullRequest }
  | { kind: 'attention-clear' };
