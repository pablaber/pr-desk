import type { GitHubRequestDetails } from '../github/types';

export type ErrorSource =
  | 'setup'
  | 'refresh'
  | 'refresh-warning'
  | 'completed'
  | 'history'
  | 'preferences'
  | 'settings'
  | 'close-stale'
  | 'merge'
  | 'approve-merge'
  | 'update-branch'
  | 'clipboard'
  | 'open'
  | 'gh-cli'
  | 'dock-badge'
  | 'interface-scale'
  | 'updates'
  | 'uncaught';

export interface SessionError {
  source: ErrorSource;
  message: string;
  firstAt: string;
  lastAt: string;
  count: number;
  // From the latest occurrence that came from a gh call.
  details?: GitHubRequestDetails;
}

const MAX_ERRORS = 50;

// Kept in memory only, so a debug report covers this session without anything written to disk.
export const sessionErrors: SessionError[] = $state([]);

// A repeat of the same error, such as an automatic refresh failing every few minutes, moves the
// existing entry to the end and counts it rather than pushing out older, different errors.
export function recordError(
  source: ErrorSource,
  message: string,
  details?: GitHubRequestDetails,
  now = Date.now(),
) {
  const at = new Date(now).toISOString();
  const index = sessionErrors.findIndex((e) => e.source === source && e.message === message);
  const [existing] = index >= 0 ? sessionErrors.splice(index, 1) : [];
  sessionErrors.push({
    ...(existing
      ? { ...existing, lastAt: at, count: existing.count + 1 }
      : { source, message, firstAt: at, lastAt: at, count: 1 }),
    ...(details && { details }),
  });
  if (sessionErrors.length > MAX_ERRORS) sessionErrors.splice(0, sessionErrors.length - MAX_ERRORS);
}

const failures: Record<GitHubRequestDetails['failure'], string> = {
  launch: 'gh did not start',
  timeout: 'timed out',
  exit: 'no response from GitHub',
  http: 'HTTP error',
  graphql: 'GraphQL error',
  'invalid-response': 'unreadable response',
};

// One line for the Troubleshooting list; the copied error keeps every field, including the command.
export function requestSummary(details: GitHubRequestDetails) {
  const { rateLimit: limit } = details;
  const errors = (details.graphqlErrors ?? []).map((e) => e.type ?? e.code).filter(Boolean);
  return [
    details.operation,
    details.httpStatus && details.httpStatus >= 400
      ? `HTTP ${details.httpStatus}`
      : failures[details.failure],
    errors.length ? errors.join(', ') : undefined,
    details.exitStatus === undefined ? undefined : `exit ${details.exitStatus}`,
    `${(details.durationMs / 1000).toFixed(1)}s`,
    limit?.remaining === undefined
      ? undefined
      : `rate limit ${limit.remaining}/${limit.limit ?? '?'} left`,
    details.retryAfterSeconds === undefined
      ? undefined
      : `retry after ${details.retryAfterSeconds}s`,
    details.requestId && `request ${details.requestId}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
