import type { PullRequest } from '../pr/types';

export type PRActionKind = 'close-stale' | 'merge' | 'approve-merge' | 'update-branch';

export interface QueuedAction {
  key: number;
  kind: PRActionKind;
  pr: PullRequest;
  method: string;
  status: 'queued' | 'running' | 'failed';
  detail: string;
  error: string;
}
