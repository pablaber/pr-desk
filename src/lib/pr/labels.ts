import {
  labelNameTaken,
  parseLabelColor,
  parseLabelName,
  randomLabelColor,
  type AppState,
  type LabelColor,
  type PRLabel,
} from '../store/app-state';
import type { PullRequest } from './types';
import { describePullRequest } from './classify';

export type LabelSlice = Pick<AppState, 'labels' | 'labeledPullRequests'>;

export type LabelOp =
  | { type: 'toggle'; prId: string; labelId: string }
  | { type: 'create'; name: string; color?: LabelColor; prId?: string }
  | { type: 'rename'; labelId: string; name: string }
  | { type: 'recolor'; labelId: string; color: LabelColor }
  | { type: 'delete'; labelId: string };

export function labelsFor(local: LabelSlice, prId: string): PRLabel[] {
  const ids = local.labeledPullRequests[prId] ?? [];
  return local.labels.filter((label) => ids.includes(label.id));
}

export function labelSummaries(local: LabelSlice): { label: PRLabel; count: number }[] {
  const counts = new Map<string, number>();
  for (const ids of Object.values(local.labeledPullRequests))
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return local.labels
    .map((label) => ({ label, count: counts.get(label.id) ?? 0 }))
    .sort(
      (a, b) => a.label.name.localeCompare(b.label.name) || a.label.id.localeCompare(b.label.id),
    );
}

// Like the other list screens, entries the last refresh could not fetch stay listed with only
// what the identifier says.
export function labeledPullRequests(
  local: AppState,
  prs: PullRequest[],
  login: string,
  labelId: string,
) {
  const byId = new Map(prs.map((pr) => [pr.id, pr]));
  return Object.entries(local.labeledPullRequests)
    .filter(([, ids]) => ids.includes(labelId))
    .map(([id]) => {
      const pr = byId.get(id);
      const [repository, number] = id.split('#');
      return {
        id,
        url: pr?.url ?? `https://github.com/${repository}/pull/${number}`,
        item: pr ? describePullRequest(pr, login, local.checkRules) : null,
      };
    })
    .sort((a, b) => updated(b) - updated(a) || a.id.localeCompare(b.id));
}

function updated(row: { item: { pr: PullRequest } | null }): number {
  return Date.parse(row.item?.pr.updatedAt ?? '') || 0;
}

export function toggleLabel(local: LabelSlice, prId: string, labelId: string): LabelSlice {
  if (!local.labels.some((label) => label.id === labelId)) throw new Error('Unknown label.');
  const current = local.labeledPullRequests[prId] ?? [];
  const ids = current.includes(labelId)
    ? current.filter((id) => id !== labelId)
    : [...current, labelId];
  const { [prId]: _, ...rest } = local.labeledPullRequests;
  return {
    labels: local.labels,
    labeledPullRequests: ids.length ? { ...rest, [prId]: ids } : rest,
  };
}

export function createLabel(
  local: LabelSlice,
  name: string,
  color?: LabelColor,
  prId?: string,
): LabelSlice {
  const parsed = parseLabelName(name);
  if (labelNameTaken(local.labels, parsed)) throw new Error('A label with that name exists.');
  const label = {
    id: crypto.randomUUID(),
    name: parsed,
    color: color === undefined ? randomLabelColor() : parseLabelColor(color),
  };
  const created = {
    labels: [...local.labels, label],
    labeledPullRequests: local.labeledPullRequests,
  };
  return prId ? toggleLabel(created, prId, label.id) : created;
}

export function renameLabel(local: LabelSlice, labelId: string, name: string): LabelSlice {
  const parsed = parseLabelName(name);
  if (labelNameTaken(local.labels, parsed, labelId))
    throw new Error('A label with that name exists.');
  return {
    labels: local.labels.map((label) =>
      label.id === labelId ? { ...label, name: parsed } : label,
    ),
    labeledPullRequests: local.labeledPullRequests,
  };
}

export function recolorLabel(local: LabelSlice, labelId: string, input: LabelColor): LabelSlice {
  const color = parseLabelColor(input);
  return {
    labels: local.labels.map((label) => (label.id === labelId ? { ...label, color } : label)),
    labeledPullRequests: local.labeledPullRequests,
  };
}

export function deleteLabel(local: LabelSlice, labelId: string): LabelSlice {
  const assignments: Record<string, string[]> = {};
  for (const [prId, ids] of Object.entries(local.labeledPullRequests)) {
    const kept = ids.filter((id) => id !== labelId);
    if (kept.length) assignments[prId] = kept;
  }
  return {
    labels: local.labels.filter((label) => label.id !== labelId),
    labeledPullRequests: assignments,
  };
}

export function applyLabelOp(local: LabelSlice, op: LabelOp): LabelSlice {
  if (op.type === 'toggle') return toggleLabel(local, op.prId, op.labelId);
  if (op.type === 'create') return createLabel(local, op.name, op.color, op.prId);
  if (op.type === 'rename') return renameLabel(local, op.labelId, op.name);
  if (op.type === 'recolor') return recolorLabel(local, op.labelId, op.color);
  return deleteLabel(local, op.labelId);
}
