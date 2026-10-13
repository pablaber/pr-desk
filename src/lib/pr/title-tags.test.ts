import { expect, it } from 'vitest';
import { parseTitleTagRule } from '../store/app-state';
import { SUGGESTED_TITLE_TAG_RULES, titleTagColor, titleTags } from './title-tags';

const [ticketAfterPrefix, ticketAnywhere, commitType, bracketed] = SUGGESTED_TITLE_TAG_RULES;
const names = (title: string, rules: { pattern: string }[]) =>
  titleTags(title, rules).map((tag) => tag.name);

it('extracts the ticket key after a conventional-commit prefix', () => {
  expect(names('fix: BACK-1234 description', [ticketAfterPrefix])).toEqual(['BACK-1234']);
  expect(names('feat (main): CCR-123 other', [ticketAfterPrefix])).toEqual(['CCR-123']);
  expect(names('feat(api)!: OPS-9 breaking', [ticketAfterPrefix])).toEqual(['OPS-9']);
  expect(names('fix: describe BACK-1234 later', [ticketAfterPrefix])).toEqual([]);
});

it('uses the whole match without a capture group', () => {
  expect(names('chore: bump deps for BACK-77', [{ pattern: 'BACK-\\d+' }])).toEqual(['BACK-77']);
});

it('counts every match and dedupes in first-seen order', () => {
  expect(names('BACK-2 / BACK-1 / BACK-2', [ticketAnywhere])).toEqual(['BACK-2', 'BACK-1']);
});

it('skips empty captures and falls back to later groups', () => {
  expect(names('x', [{ pattern: '()' }])).toEqual([]);
  expect(names('  ', [{ pattern: '\\s+' }])).toEqual([]);
  expect(names('id: 42', [{ pattern: '(ref)?id: (\\d+)' }])).toEqual(['42']);
});

it('truncates tags to the label name limit', () => {
  const [tag] = names(`[${'x'.repeat(40)}] title`, [bracketed]);
  expect(tag).toBe('x'.repeat(32));
});

it('orders tags by rule, then by match', () => {
  expect(names('[WIP] fix: BACK-1 thing', [bracketed, ticketAnywhere, commitType])).toEqual([
    'WIP',
    'BACK-1',
  ]);
  expect(names('fix: BACK-1 thing', [commitType, ticketAnywhere])).toEqual(['fix', 'BACK-1']);
});

it('skips a pattern that does not compile', () => {
  expect(names('BACK-1', [{ pattern: '(' }, ticketAnywhere])).toEqual(['BACK-1']);
});

it('colours a tag by its full text', () => {
  expect(titleTagColor('BACK-1234')).toBe(titleTagColor('BACK-1234'));
  expect(titleTagColor('BACK-1234')).not.toBe(titleTagColor('BACK-1235'));
  expect(titleTagColor('BACK-1234')).toMatch(/^#[0-9a-f]{6}$/);
  expect(titleTags('BACK-1234', [ticketAnywhere])[0].color).toBe(titleTagColor('BACK-1234'));
});

it('offers suggestions that validate and match their examples', () => {
  for (const suggestion of SUGGESTED_TITLE_TAG_RULES) {
    expect(parseTitleTagRule(suggestion.pattern).pattern).toBe(suggestion.pattern);
    expect(names(suggestion.example, [suggestion])).toHaveLength(1);
  }
});
