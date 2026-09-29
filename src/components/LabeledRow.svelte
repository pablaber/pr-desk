<script lang="ts">
  import RowSummary from './RowSummary.svelte';
  import type { labeledPullRequests, LabelOp } from '../lib/pr/labels';
  import type { PRLabel } from '../lib/store/app-state';
  let {
    row,
    label,
    now,
    busy,
    stale,
    onopen,
    onlabel,
  }: {
    row: ReturnType<typeof labeledPullRequests>[number];
    label: PRLabel;
    now: number;
    busy: boolean;
    stale: boolean;
    onopen: (url: string) => void;
    onlabel: (op: LabelOp) => void;
  } = $props();
</script>

<article class="snoozed-row labeled-row">
  <button
    class="card-main snoozed-main"
    aria-label={`Open ${row.item?.pr.title ?? row.id} on GitHub`}
    onclick={() => onopen(row.url)}
  >
    <RowSummary item={row.item} {now} {stale}>
      {#snippet unavailable()}
        <span class="repo">{row.id}</span><strong>Pull request details unavailable</strong><span
          class="secondary">You can still open this pull request or remove its label.</span
        >
      {/snippet}
    </RowSummary>
  </button>
  <div class="snoozed-schedule">
    <div class="snoozed-actions">
      <button
        disabled={busy}
        aria-label={`Remove ${label.name} from ${row.item?.pr.title ?? row.id}`}
        onclick={() => onlabel({ type: 'toggle', prId: row.id, labelId: label.id })}
        >Remove label</button
      >
    </div>
  </div>
</article>
