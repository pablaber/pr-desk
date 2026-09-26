import type { IgnoreRule } from '../store/app-state';
import type { PullRequest } from './types';

// Match the whole value. Only * and ? are special; regex punctuation stays literal.
// Remembering the most recent star avoids exponential regex backtracking.
export function matchesGlob(value: string, pattern: string): boolean {
  if (!/[*?]/.test(pattern)) return value.toLowerCase() === pattern.toLowerCase();
  const text = Array.from(value.toLowerCase());
  const glob = Array.from(pattern.toLowerCase());
  let i = 0,
    j = 0,
    star = -1,
    retry = 0;
  while (i < text.length) {
    if (glob[j] === '*') {
      star = j++;
      retry = i;
    } else if (glob[j] === '?' || glob[j] === text[i]) {
      i++;
      j++;
    } else if (star !== -1) {
      j = star + 1;
      i = ++retry;
    } else return false;
  }
  while (glob[j] === '*') j++;
  return j === glob.length;
}

export function ignoresRepository(repository: string, rules: IgnoreRule[]): boolean {
  return rules.some((rule) => rule.kind === 'repository' && matchesGlob(repository, rule.value));
}

export function ignoresPullRequest(pr: PullRequest, rules: IgnoreRule[]): boolean {
  return rules.some((rule) => {
    if (rule.kind === 'author') return pr.author.toLowerCase() === rule.value.toLowerCase();
    return matchesGlob(rule.kind === 'repository' ? pr.repository : pr.title, rule.value);
  });
}

export function exactIgnoredRepositories(rules: IgnoreRule[]): string[] {
  return rules
    .filter((rule) => rule.kind === 'repository' && !/[*?]/.test(rule.value))
    .map((rule) => rule.value);
}
