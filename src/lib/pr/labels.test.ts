import { expect, it } from 'vitest';
import { defaultState, type AppState } from '../store/app-state';
import { pr } from '../../test/fixtures';
import {
  applyLabelOp,
  createLabel,
  deleteLabel,
  labeledPullRequests,
  labelsFor,
  labelSummaries,
  recolorLabel,
  renameLabel,
  toggleLabel,
} from './labels';

function withLabels(): AppState {
  const local = defaultState();
  local.labels = [
    { id: 'b', name: 'Backend', color: '#3b82c4' },
    { id: 'a', name: 'alpha', color: '#d1483b' },
  ];
  local.labeledPullRequests = { 'acme/api#1': ['b', 'a'], 'acme/api#2': ['b'] };
  return local;
}

it('returns a PR’s labels in label order', () => {
  expect(labelsFor(withLabels(), 'acme/api#1').map((l) => l.id)).toEqual(['b', 'a']);
  expect(labelsFor(withLabels(), 'acme/api#9')).toEqual([]);
});

it('toggles a label on and off, dropping empty entries', () => {
  const local = withLabels();
  const off = toggleLabel(local, 'acme/api#2', 'b');
  expect(off.labeledPullRequests).toEqual({ 'acme/api#1': ['b', 'a'] });
  expect(toggleLabel(off, 'acme/api#3', 'a').labeledPullRequests['acme/api#3']).toEqual(['a']);
  expect(() => toggleLabel(local, 'acme/api#1', 'nope')).toThrow('Unknown label');
});

it('creates a label, optionally assigning it, and rejects duplicates', () => {
  const local = withLabels();
  const created = createLabel(local, ' Fresh ', undefined, 'acme/api#5');
  const fresh = created.labels.at(-1)!;
  expect(fresh.name).toBe('Fresh');
  expect(fresh.color).toMatch(/^#[0-9a-f]{6}$/);
  expect(created.labeledPullRequests['acme/api#5']).toEqual([fresh.id]);
  expect(createLabel(local, 'Solo', '#D0578F').labels.at(-1)?.color).toBe('#d0578f');
  expect(() => createLabel(local, 'Solo', 'pink')).toThrow('hex color');
  expect(() => createLabel(local, 'BACKEND')).toThrow('exists');
  expect(() => createLabel(local, ' ')).toThrow();
});

it('renames and recolors without touching assignments', () => {
  const local = withLabels();
  const renamed = renameLabel(local, 'b', 'API');
  expect(renamed.labels.find((l) => l.id === 'b')?.name).toBe('API');
  expect(renamed.labeledPullRequests).toEqual(local.labeledPullRequests);
  expect(renameLabel(local, 'b', 'backend').labels[0].name).toBe('backend');
  expect(() => renameLabel(local, 'b', 'ALPHA')).toThrow('exists');
  expect(recolorLabel(local, 'a', '#D0578F').labels[1].color).toBe('#d0578f');
  expect(() => recolorLabel(local, 'a', '#nope')).toThrow('hex color');
});

it('deletes a label together with its assignments', () => {
  const deleted = deleteLabel(withLabels(), 'b');
  expect(deleted.labels.map((l) => l.id)).toEqual(['a']);
  expect(deleted.labeledPullRequests).toEqual({ 'acme/api#1': ['a'] });
});

it('dispatches operations', () => {
  const local = withLabels();
  expect(applyLabelOp(local, { type: 'delete', labelId: 'a' }).labels).toHaveLength(1);
  expect(
    applyLabelOp(local, { type: 'toggle', prId: 'acme/api#2', labelId: 'a' }).labeledPullRequests[
      'acme/api#2'
    ],
  ).toEqual(['b', 'a']);
  expect(applyLabelOp(local, { type: 'create', name: 'New' }).labels).toHaveLength(3);
  expect(applyLabelOp(local, { type: 'rename', labelId: 'a', name: 'z' }).labels[1].name).toBe('z');
  expect(
    applyLabelOp(local, { type: 'recolor', labelId: 'a', color: '#8a9483' }).labels[1].color,
  ).toBe('#8a9483');
});

it('summarizes labels by name with assignment counts', () => {
  expect(labelSummaries(withLabels()).map((s) => [s.label.id, s.count])).toEqual([
    ['a', 1],
    ['b', 2],
  ]);
});

it('lists labeled PRs newest first and keeps unavailable ones', () => {
  const rows = labeledPullRequests(
    withLabels(),
    [
      pr({ id: 'acme/api#1', updatedAt: '2026-09-20T10:00:00Z' }),
      pr({ id: 'acme/api#2', number: 2, updatedAt: '2026-09-21T10:00:00Z' }),
    ],
    'me',
    'b',
  );
  expect(rows.map((r) => r.id)).toEqual(['acme/api#2', 'acme/api#1']);
  const local = withLabels();
  local.labeledPullRequests['acme/web#7'] = ['b'];
  const listed = labeledPullRequests(local, [pr({ id: 'acme/api#1' })], 'me', 'b');
  expect(listed.map((r) => r.id)).toEqual(['acme/api#1', 'acme/api#2', 'acme/web#7']);
  expect(listed[2]).toMatchObject({
    item: null,
    url: 'https://github.com/acme/web/pull/7',
  });
});
