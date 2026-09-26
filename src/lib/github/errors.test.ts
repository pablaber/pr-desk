import { describe, expect, it } from 'vitest';
import { githubErrorMessage } from './errors';

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
