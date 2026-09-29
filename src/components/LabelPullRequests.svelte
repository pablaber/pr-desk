<script lang="ts">
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import Tag from '@lucide/svelte/icons/tag';
  import type { AppState, PRLabel } from '../lib/store/app-state';
  import type { DashboardSnapshot } from '../lib/github/refresh';
  import { labeledPullRequests, type LabelOp } from '../lib/pr/labels';
  import LabeledRow from './LabeledRow.svelte';
  let {
    preferences,
    snapshot,
    label,
    login,
    now,
    busy,
    onopen,
    onlabel,
    onback,
  }: {
    preferences: AppState;
    snapshot: DashboardSnapshot;
    label: PRLabel;
    login: string;
    now: number;
    busy: boolean;
    onopen: (url: string) => void;
    onlabel: (op: LabelOp) => void;
    onback: () => void;
  } = $props();
  let rows = $derived(labeledPullRequests(preferences, snapshot.prs, login, label.id));
</script>

<div class="dashboard-heading">
  <div>
    <div class="eyebrow">LABEL</div>
    <h1><span class="badge label {label.color}"><i class="label-dot"></i>{label.name}</span></h1>
    <p>Pull requests carrying this label.</p>
  </div>
  <button class="quiet" onclick={onback}><ChevronLeft size={13} /> Back to labels</button>
</div>
<div class="snoozed-list" aria-busy={busy}>
  <div class="snoozed-summary">
    <span>{rows.length} pull request{rows.length === 1 ? '' : 's'}</span><span
      >Most recently updated first</span
    >
  </div>
  {#each rows as row (row.id)}
    <LabeledRow
      {row}
      {label}
      {now}
      {busy}
      stale={snapshot.staleIds.includes(row.id)}
      {onopen}
      {onlabel}
    />
  {:else}
    <div class="empty-column">
      <span><Tag size={24} /></span>
      <p>No pull requests with this label</p>
      <small>Add the label from a pull request’s dashboard menu.</small>
    </div>
  {/each}
</div>
