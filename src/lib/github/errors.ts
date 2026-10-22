import type { GitHubRequestDetails, SourceWarning } from './types';

const repositoryNotFound =
  'We couldn’t find that repository, or your GitHub account doesn’t have access. Check the owner/repository spelling and make sure you can access it on GitHub.';

const messages: Record<string, string> = {
  GITHUB_REPOSITORY_NOT_FOUND: repositoryNotFound,
};

export class GitHubRequestError extends Error {
  constructor(
    message: string,
    readonly details?: GitHubRequestDetails,
  ) {
    super(message);
  }
}

// The github command rejects with { message, details }; other paths reject with a string or Error.
function rejection(error: unknown): { message: string; details?: GitHubRequestDetails } {
  if (error instanceof GitHubRequestError) return error;
  if (error instanceof Error) return { message: error.message };
  if (typeof error === 'string') return { message: error };
  if (typeof error === 'object' && error !== null) {
    const { message, details } = error as { message?: unknown; details?: unknown };
    return {
      message: typeof message === 'string' ? message : '',
      details: details && typeof details === 'object' ? withResetTime(details) : undefined,
    };
  }
  return { message: '' };
}

// GitHub sends the rate limit reset as epoch seconds; an ISO time reads at a glance in a report.
function withResetTime(details: object): GitHubRequestDetails {
  const { rateLimit, ...rest } = details as GitHubRequestDetails & {
    rateLimit?: { reset?: number };
  };
  if (!rateLimit) return rest;
  const { reset, ...limit } = rateLimit;
  return {
    ...rest,
    rateLimit: {
      ...limit,
      ...(typeof reset === 'number' && { resetAt: new Date(reset * 1000).toISOString() }),
    },
  };
}

export function githubErrorMessage(error: unknown): string {
  const { message } = rejection(error);
  return (
    (Object.hasOwn(messages, message) ? messages[message] : message) ||
    'We couldn’t complete the GitHub request. Please try again.'
  );
}

export function githubRequestError(error: unknown) {
  return new GitHubRequestError(githubErrorMessage(error), rejection(error).details);
}

export function requestDetails(error: unknown) {
  return error instanceof GitHubRequestError ? error.details : undefined;
}

export function sourceWarning(message: string, error: unknown): SourceWarning {
  const details = requestDetails(error);
  return details ? { message, details } : { message };
}
