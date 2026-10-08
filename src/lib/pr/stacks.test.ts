import { describe, expect, it } from 'vitest';
import { classify } from './classify';
import { boardEntries } from './stacks';
import { defaultState } from '../store/app-state';
import { pr } from '../../test/fixtures';
import type { PullRequest } from './types';
const local = defaultState();
function layer(number: number, base: string, overrides: Partial<PullRequest> = {}) {
  return pr({
    id: `acme/api#${number}`,
    number,
    headRefName: `branch-${number}`,
    baseRefName: base,
    ...overrides,
  });
}
const shown = (prs: PullRequest[]) => prs.map((p) => classify(p, 'me', local)!);
const entries = (visible: PullRequest[], all = visible) => boardEntries(shown(visible), all);
const numbers = (prs: PullRequest[], all = prs) =>
  entries(prs, all).map((e) => e.items.map((i) => i.pr.number));
describe('stacked pull requests', () => {
  const chain = [
    layer(1, 'main'),
    layer(2, 'branch-1', { updatedAt: '2026-09-21T10:00:00Z' }),
    layer(3, 'branch-2'),
  ];
  it('groups a chain into one stack, newest layer first', () => {
    expect(entries(chain)).toMatchObject([
      { id: 'stack:acme/api#1', stack: { repository: 'acme/api', base: 'main' } },
    ]);
    expect(numbers(chain)).toEqual([[3, 2, 1]]);
  });
  it('leaves unrelated PRs as single cards', () =>
    expect(entries([layer(1, 'main'), layer(2, 'main')])).toMatchObject([
      { id: 'acme/api#1', stack: null },
      { id: 'acme/api#2', stack: null },
    ]));
  it('only links PRs in the same repository whose head is not a fork', () => {
    const other = layer(2, 'branch-1', { id: 'acme/web#2', repository: 'acme/web' });
    expect(numbers([layer(1, 'main'), other])).toEqual([[1], [2]]);
    expect(numbers([layer(1, 'main', { crossRepository: true }), layer(2, 'branch-1')])).toEqual([
      [1],
      [2],
    ]);
    expect(numbers([layer(1, 'main', { repository: 'Acme/API' }), layer(2, 'branch-1')])).toEqual([
      [2, 1],
    ]);
  });
  it('ignores closed parents and parents shared by several open PRs', () => {
    expect(
      numbers(
        [layer(2, 'branch-1')],
        [layer(1, 'main', { state: 'MERGED' }), layer(2, 'branch-1')],
      ),
    ).toEqual([[2]]);
    const twin = layer(4, 'develop', { headRefName: 'branch-1' });
    expect(numbers([layer(1, 'main'), twin, layer(2, 'branch-1')])).toEqual([[1], [2], [4]]);
  });
  it('keeps layers together when a layer between them is hidden', () =>
    expect(numbers([chain[0], chain[2]], chain)).toEqual([[3, 1]]));
  it('shows a lone visible layer as a single card', () =>
    expect(entries([chain[1]], chain)).toMatchObject([{ id: 'acme/api#2', stack: null }]));
  it('leaves PRs whose chain loops unstacked', () =>
    expect(numbers([layer(1, 'branch-2'), layer(2, 'branch-1'), layer(3, 'branch-2')])).toEqual([
      [1],
      [2],
      [3],
    ]));
  it('orders branching layers depth first by PR number', () =>
    expect(
      numbers([layer(1, 'main'), layer(5, 'branch-1'), layer(3, 'branch-1'), layer(4, 'branch-3')]),
    ).toEqual([[5, 4, 3, 1]]));
  it('places a stack by its most urgent layer', () => {
    const urgent = layer(3, 'branch-2', { reviewDecision: 'CHANGES_REQUESTED' });
    const [stack] = entries([chain[0], chain[1], urgent]);
    expect(stack.lead.pr.number).toBe(3);
    expect(stack.lead.state).toBe('needs-attention');
  });
  it('sorts entries by urgency, then by the usual column order', () =>
    expect(
      entries([
        layer(7, 'main', { updatedAt: '2026-09-01T10:00:00Z' }),
        ...chain,
        layer(8, 'main', { checks: [{ name: 'CI', state: 'failed' }] }),
      ]).map((e) => e.id),
    ).toEqual(['acme/api#8', 'stack:acme/api#1', 'acme/api#7']));
});
