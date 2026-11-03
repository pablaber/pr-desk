import { describe, expect, it, vi } from 'vitest';
import { pr } from '../../test/fixtures';
import { defaultState } from '../store/app-state';
import { executeAction, type ExecuteDeps } from './execute';
import type { PRActionKind, QueuedAction } from './types';
import type { PullRequest } from '../pr/types';

const ready = pr({ reviewDecision: 'APPROVED' });
const behind = pr({ reviewDecision: 'APPROVED', mergeStateStatus: 'BEHIND' });
const bot = pr({
  author: 'dependabot',
  authorIsBot: true,
  headAuthor: { login: '', name: 'dependabot[bot]' },
  reasons: ['tracked-repository'],
});
const preferences = { ...defaultState(), knownBots: ['dependabot[bot]'] };

function setup(fresh: PullRequest) {
  const service = {
    getPullRequest: vi.fn(async () => fresh),
    closeStalePullRequest: vi.fn(async () => {}),
    mergePullRequest: vi.fn(async () => {}),
    approveAndMergePullRequest: vi.fn(async () => {}),
    updatePullRequestBranch: vi.fn(async () => {}),
  };
  const deps: ExecuteDeps = { service, login: () => 'me', preferences: () => preferences };
  return { service, deps };
}
const entry = (kind: PRActionKind, confirmed: PullRequest, method = 'squash'): QueuedAction => ({
  key: 1,
  kind,
  pr: confirmed,
  method,
  status: 'running',
  detail: '',
  error: '',
});

describe('executeAction', () => {
  it('merges a PR that is still ready, pinned to the confirmed commit', async () => {
    const { service, deps } = setup(ready);
    const report = vi.fn();
    await executeAction(entry('merge', ready, 'rebase'), report, deps);
    expect(service.mergePullRequest).toHaveBeenCalledWith(
      ready.id,
      ready.headOid,
      'rebase',
      undefined,
    );
    expect(report.mock.calls.map(([detail]) => detail)).toEqual([
      'Checking the PR is still ready…',
      '',
    ]);
  });

  it('refuses a commit that changed after confirmation', async () => {
    const { service, deps } = setup({ ...ready, headOid: 'b'.repeat(40) });
    await expect(executeAction(entry('merge', ready), vi.fn(), deps)).rejects.toThrow(
      'changed or is no longer ready',
    );
    expect(service.mergePullRequest).not.toHaveBeenCalled();
  });

  it('refuses a PR that is no longer ready', async () => {
    const { service, deps } = setup({ ...ready, reviewDecision: 'CHANGES_REQUESTED' });
    await expect(executeAction(entry('merge', ready), vi.fn(), deps)).rejects.toThrow(
      'changed or is no longer ready',
    );
    expect(service.mergePullRequest).not.toHaveBeenCalled();
  });

  it('says so when a sibling merge left the PR behind its base', async () => {
    const { service, deps } = setup(behind);
    await expect(executeAction(entry('merge', ready), vi.fn(), deps)).rejects.toThrow(
      'now behind its base branch',
    );
    expect(service.mergePullRequest).not.toHaveBeenCalled();
  });

  it('updates a branch that is still behind', async () => {
    const { service, deps } = setup(behind);
    await executeAction(entry('update-branch', behind), vi.fn(), deps);
    expect(service.updatePullRequestBranch).toHaveBeenCalledWith(
      behind.id,
      behind.headOid,
      undefined,
    );
  });

  it('refuses to update a branch that no longer needs it', async () => {
    const { service, deps } = setup(ready);
    await expect(executeAction(entry('update-branch', behind), vi.fn(), deps)).rejects.toThrow(
      'no longer needs a branch update',
    );
    expect(service.updatePullRequestBranch).not.toHaveBeenCalled();
  });

  it('approves and merges a known bot PR with the bot declared', async () => {
    const { service, deps } = setup(bot);
    await executeAction(entry('approve-merge', bot, 'merge'), vi.fn(), deps);
    expect(service.approveAndMergePullRequest).toHaveBeenCalledWith(
      bot.id,
      bot.headOid,
      'merge',
      'dependabot[bot]',
    );
    expect(service.mergePullRequest).not.toHaveBeenCalled();
  });

  it('closes a stale PR without rechecking it', async () => {
    const { service, deps } = setup(ready);
    const report = vi.fn();
    await executeAction(entry('close-stale', ready), report, deps);
    expect(service.closeStalePullRequest).toHaveBeenCalledWith(ready.id);
    expect(service.getPullRequest).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith('Closing and leaving a comment…');
  });

  it('reports the wait while GitHub recomputes mergeability', async () => {
    const { service, deps } = setup(ready);
    service.getPullRequest.mockResolvedValueOnce({ ...ready, mergeable: 'UNKNOWN' });
    const report = vi.fn();
    await executeAction(entry('merge', ready), report, deps);
    expect(report).toHaveBeenCalledWith('Waiting for GitHub to recheck the PR…');
    expect(service.mergePullRequest).toHaveBeenCalled();
  });
});
