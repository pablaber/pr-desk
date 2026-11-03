import { settledPullRequest } from '../github/mergeability';
import type { GitHubService } from '../github/types';
import { knownBotKey } from '../pr/bots';
import { classify } from '../pr/classify';
import type { AppState } from '../store/app-state';
import type { QueuedAction } from './types';

export const capability = {
  merge: 'canMerge',
  'approve-merge': 'canApproveAndMerge',
  'update-branch': 'canUpdateBranch',
} as const;

export interface ExecuteDeps {
  service: Pick<
    GitHubService,
    | 'getPullRequest'
    | 'closeStalePullRequest'
    | 'mergePullRequest'
    | 'approveAndMergePullRequest'
    | 'updatePullRequestBranch'
  >;
  login: () => string;
  // Read when the action starts, which may be long after it was confirmed.
  preferences: () => AppState;
}

export async function executeAction(
  { kind, pr, method }: QueuedAction,
  report: (detail: string) => void,
  { service, login, preferences }: ExecuteDeps,
) {
  if (kind === 'close-stale') {
    report('Closing and leaving a comment…');
    await service.closeStalePullRequest(pr.id);
    return;
  }
  const updating = kind === 'update-branch';
  report(updating ? 'Checking the PR still needs updating…' : 'Checking the PR is still ready…');
  const fresh = await settledPullRequest(
    () => service.getPullRequest(pr.id),
    () => report('Waiting for GitHub to recheck the PR…'),
  );
  // A single-PR lookup carries no tracking reasons; the card's own reasons decide bot status.
  const result = classify({ ...fresh, reasons: pr.reasons }, login(), preferences(), Date.now());
  if (fresh.headOid !== pr.headOid || !result?.[capability[kind]])
    throw new Error(
      updating
        ? 'This PR changed or no longer needs a branch update. Skip it and check the PR.'
        : fresh.headOid === pr.headOid && result?.canUpdateBranch
          ? 'This PR is now behind its base branch. Skip it and update the branch before merging.'
          : 'This PR changed or is no longer ready to merge. Skip it and check the PR.',
    );
  report('');
  const bot = result.bot ? knownBotKey(fresh) : undefined;
  if (updating) await service.updatePullRequestBranch(pr.id, pr.headOid, bot);
  else if (kind === 'merge') await service.mergePullRequest(pr.id, pr.headOid, method, bot);
  else await service.approveAndMergePullRequest(pr.id, pr.headOid, method, knownBotKey(fresh));
}
