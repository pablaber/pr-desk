import { sortPullRequests, type ClassifiedPR } from './classify';
import type { DashboardState, PullRequest } from './types';
export interface BoardEntry {
  id: string;
  // The most urgent PR in the entry; it decides the column and the position within it.
  lead: ClassifiedPR;
  // Newest layer first, base-most layer last. A single card has exactly one item.
  items: ClassifiedPR[];
  stack: { repository: string; base: string } | null;
}
const urgency: Record<DashboardState, number> = {
  'needs-attention': 0,
  'ready-to-merge': 1,
  waiting: 2,
};
function byUrgency(a: ClassifiedPR, b: ClassifiedPR) {
  return urgency[a.state] - urgency[b.state] || sortPullRequests(a, b);
}
const branchKey = (repository: string, branch: string) => `${repository.toLowerCase()}:${branch}`;
// A PR is stacked on the open PR whose head branch is its base. Fork heads cannot be a base in
// the upstream repository, and a branch shared by several open PRs leaves the parent unknown.
function stackParents(prs: PullRequest[]) {
  const open = prs.filter((pr) => pr.state === 'OPEN');
  const byHead = new Map<string, PullRequest[]>();
  for (const pr of open) {
    if (pr.crossRepository) continue;
    const key = branchKey(pr.repository, pr.headRefName);
    byHead.set(key, [...(byHead.get(key) ?? []), pr]);
  }
  const parents = new Map<string, PullRequest>();
  for (const pr of open) {
    const candidates = byHead.get(branchKey(pr.repository, pr.baseRefName)) ?? [];
    if (candidates.length === 1 && candidates[0].id !== pr.id) parents.set(pr.id, candidates[0]);
  }
  return parents;
}
// A chain that loops back on itself has no base, so its PRs stay unstacked.
function stackRoot(pr: PullRequest, parents: Map<string, PullRequest>) {
  const seen = new Set([pr.id]);
  let root = pr;
  for (let next = parents.get(root.id); next; next = parents.get(root.id)) {
    if (seen.has(next.id)) return pr;
    seen.add(next.id);
    root = next;
  }
  return root;
}
// Hidden and filtered-out PRs still link the layers around them, so stacks are built from every
// fetched PR while only the visible ones are shown.
export function boardEntries(visible: ClassifiedPR[], all: PullRequest[]): BoardEntry[] {
  const parents = stackParents(all);
  const children = new Map<string, PullRequest[]>();
  for (const pr of all) {
    const parent = parents.get(pr.id);
    if (parent) children.set(parent.id, [...(children.get(parent.id) ?? []), pr]);
  }
  const groups = new Map<string, { root: PullRequest; items: ClassifiedPR[] }>();
  for (const item of visible) {
    const root = stackRoot(item.pr, parents);
    const group = groups.get(root.id) ?? { root, items: [] };
    group.items.push(item);
    groups.set(root.id, group);
  }
  const entries = [...groups.values()].map(({ root, items }): BoardEntry => {
    if (items.length === 1) return { id: items[0].pr.id, lead: items[0], items, stack: null };
    const byId = new Map(items.map((item) => [item.pr.id, item]));
    const ordered: ClassifiedPR[] = [];
    const walk = (pr: PullRequest) => {
      const item = byId.get(pr.id);
      if (item) ordered.push(item);
      const next = [...(children.get(pr.id) ?? [])].sort((a, b) => a.number - b.number);
      for (const child of next) walk(child);
    };
    walk(root);
    return {
      id: `stack:${root.id}`,
      lead: [...items].sort(byUrgency)[0],
      items: ordered.reverse(),
      stack: { repository: root.repository, base: root.baseRefName },
    };
  });
  return entries.sort((a, b) => byUrgency(a.lead, b.lead));
}
