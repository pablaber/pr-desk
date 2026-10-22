import { describe, expect, it } from 'vitest';
import {
  GitHubRequestError,
  githubErrorMessage,
  githubRequestError,
  requestDetails,
} from './errors';

describe('githubErrorMessage', () => {
  it.each(['GITHUB_REPOSITORY_NOT_FOUND', new Error('GITHUB_REPOSITORY_NOT_FOUND')])(
    'explains missing or inaccessible repositories for %s',
    (error) => {
      expect(githubErrorMessage(error)).toBe(
        'We couldn’t find that repository, or your GitHub account doesn’t have access. Check the owner/repository spelling and make sure you can access it on GitHub.',
      );
    },
  );
  it('preserves validation and other actionable errors without the Error prefix', () => {
    expect(githubErrorMessage(new Error('Use owner/repository.'))).toBe('Use owner/repository.');
    expect(githubErrorMessage('GitHub request timed out. Try refreshing.')).toBe(
      'GitHub request timed out. Try refreshing.',
    );
  });
  it.each([null, undefined, {}, ''])('provides a fallback for %s', (error) => {
    expect(githubErrorMessage(error)).toBe(
      'We couldn’t complete the GitHub request. Please try again.',
    );
  });
});

describe('githubRequestError', () => {
  it('keeps the bridge details and shows the rate limit reset as a time', () => {
    const error = githubRequestError({
      message: 'GITHUB_REPOSITORY_NOT_FOUND',
      details: {
        operation: 'DeskRepository',
        command: 'gh api graphql',
        failure: 'graphql',
        durationMs: 812,
        rateLimit: { limit: 5000, remaining: 4978, reset: 1792680215 },
      },
    });
    expect(error).toBeInstanceOf(GitHubRequestError);
    expect(error.message).toMatch(/couldn’t find that repository/);
    expect(requestDetails(error)).toEqual({
      operation: 'DeskRepository',
      command: 'gh api graphql',
      failure: 'graphql',
      durationMs: 812,
      rateLimit: { limit: 5000, remaining: 4978, resetAt: '2026-10-22T14:43:35.000Z' },
    });
  });
  it.each(['offline', new Error('offline'), { message: 'offline' }])(
    'has no details when %s carries none',
    (rejection) => {
      const error = githubRequestError(rejection);
      expect(error.message).toBe('offline');
      expect(requestDetails(error)).toBeUndefined();
    },
  );
  it('only reads details from GitHub request errors', () => {
    expect(requestDetails(new Error('x'))).toBeUndefined();
  });
});
