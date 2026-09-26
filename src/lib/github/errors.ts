const repositoryNotFound =
  'We couldn’t find that repository, or your GitHub account doesn’t have access. Check the owner/repository spelling and make sure you can access it on GitHub.';

const messages: Record<string, string> = {
  GITHUB_REPOSITORY_NOT_FOUND: repositoryNotFound,
};

export function githubErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return (
    (Object.hasOwn(messages, message) ? messages[message] : message) ||
    'We couldn’t complete the GitHub request. Please try again.'
  );
}
