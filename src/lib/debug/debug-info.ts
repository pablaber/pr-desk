import { describePullRequest, hiddenReason } from '../pr/classify';
import { dashboardRules } from '../pr/dashboard-rules';
import { ignoreRuleMatches } from '../pr/ignore';
import { labelsFor } from '../pr/labels';
import { deriveSignals } from '../pr/signals';
import type { DashboardSnapshot } from '../github/refresh';
import type { GhCliInfo } from '../github/types';
import type { PullRequest } from '../pr/types';
import type { AppState } from '../store/app-state';

export interface DebugInfoInput {
  version: string;
  login: string;
  now: number;
  filter: string;
  preferences: AppState;
  snapshot: DashboardSnapshot;
  cliInfo: GhCliInfo | null;
}

// Everything the board is derived from, plus how each PR was placed, so a pasted report explains
// a surprising column without anyone reproducing the user's GitHub state.
export function buildDebugInfo(input: DebugInfoInput, prId?: string) {
  const { login, now, preferences, snapshot } = input;
  const placements = snapshot.prs.map((pr) => describePlacement(pr, input));
  const count = (column: string) => placements.filter((p) => p.column === column).length;
  return {
    generatedAt: new Date(now).toISOString(),
    app: { version: input.version, gh: input.cliInfo },
    login,
    filter: input.filter,
    board: {
      readyToMerge: count('ready-to-merge'),
      needsAttention: count('needs-attention'),
      waiting: count('waiting'),
      hidden: placements.filter((p) => p.hidden).length,
    },
    refresh: {
      discoveryComplete: snapshot.discoveryComplete,
      warnings: snapshot.warnings,
      staleIds: snapshot.staleIds,
      sources: snapshot.sources,
    },
    preferences,
    pullRequests: placements.filter((p) => prId === undefined || p.pr.id === prId),
  };
}

function describePlacement(pr: PullRequest, input: DebugInfoInput) {
  const { login, now, preferences, snapshot } = input;
  const hidden = hiddenReason(pr, login, preferences, now);
  const described = describePullRequest(pr, login, preferences.checkRules);
  const signals = deriveSignals(pr, login, preferences.checkRules);
  return {
    pr,
    column: hidden ? null : described.state,
    hidden,
    primary: described.primary,
    statuses: described.statuses,
    canMerge: !hidden && described.canMerge,
    matchedRules: dashboardRules.filter((r) => r.matches(signals)).map((r) => r.id),
    matchedIgnoreRules: preferences.ignoreRules.filter((rule) => ignoreRuleMatches(pr, rule)),
    ignoredAt: preferences.ignoredPullRequests[pr.id]?.ignoredAt ?? null,
    snoozedUntil: preferences.snoozedPullRequests[pr.id]?.until ?? null,
    watched: preferences.watchedPullRequests.includes(pr.id),
    stale: snapshot.staleIds.includes(pr.id),
    labels: labelsFor(preferences, pr.id).map((label) => label.name),
    // The PR itself is already listed above.
    signals: { ...signals, pr: undefined },
  };
}
