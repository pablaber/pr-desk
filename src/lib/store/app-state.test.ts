import { expect, it } from 'vitest';
import { parsePullRequest, parseRepository, snoozeUntil } from './app-state';
it('validates and canonicalizes input', () => {
  expect(parseRepository(' Acme/API ')).toBe('acme/api');
  expect(parsePullRequest('https://github.com/Acme/API/pull/123/files')).toBe('acme/api#123');
  expect(parsePullRequest('Acme/API#123')).toBe('acme/api#123');
  for (const value of [
    'https://evil.test/acme/api/pull/1',
    'https://github.com/acme/api/issues/1',
    'acme/api#0',
  ])
    expect(() => parsePullRequest(value)).toThrow();
  expect(() => parseRepository('no-owner')).toThrow();
});
it('snoozes tomorrow and the next Monday at local 9 AM', () => {
  const monday = new Date(2026, 8, 21, 13);
  const tomorrow = new Date(snoozeUntil('tomorrow', monday));
  expect(tomorrow.getDate()).toBe(22);
  expect(tomorrow.getHours()).toBe(9);
  expect(new Date(snoozeUntil('monday', monday)).getDate()).toBe(28);
  expect(Date.parse(snoozeUntil('1h', monday)) - monday.getTime()).toBe(3600000);
});
