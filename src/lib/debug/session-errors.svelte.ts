export type ErrorSource =
  | 'setup'
  | 'refresh'
  | 'refresh-warning'
  | 'completed'
  | 'preferences'
  | 'settings'
  | 'close-stale'
  | 'merge'
  | 'approve-merge'
  | 'clipboard'
  | 'open'
  | 'gh-cli'
  | 'dock-badge'
  | 'interface-scale'
  | 'uncaught';

export interface SessionError {
  source: ErrorSource;
  message: string;
  firstAt: string;
  lastAt: string;
  count: number;
}

const MAX_ERRORS = 50;

// Kept in memory only, so a debug report covers this session without anything written to disk.
export const sessionErrors: SessionError[] = $state([]);

// A repeat of the same error, such as an automatic refresh failing every few minutes, moves the
// existing entry to the end and counts it rather than pushing out older, different errors.
export function recordError(source: ErrorSource, message: string, now = Date.now()) {
  const at = new Date(now).toISOString();
  const index = sessionErrors.findIndex((e) => e.source === source && e.message === message);
  const [existing] = index >= 0 ? sessionErrors.splice(index, 1) : [];
  sessionErrors.push(
    existing
      ? { ...existing, lastAt: at, count: existing.count + 1 }
      : { source, message, firstAt: at, lastAt: at, count: 1 },
  );
  if (sessionErrors.length > MAX_ERRORS) sessionErrors.splice(0, sessionErrors.length - MAX_ERRORS);
}
