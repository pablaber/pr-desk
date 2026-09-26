<script lang="ts">
  import RowSummary from './RowSummary.svelte';
  import type { ignoredPullRequests } from '../lib/pr/ignored';
  let {
    row,
    now,
    busy,
    stale,
    onopen,
    onunignore,
  }: {
    row: ReturnType<typeof ignoredPullRequests>[number];
    now: number;
    busy: boolean;
    stale: boolean;
    onopen: (url: string) => void;
    onunignore: (id: string) => void;
  } = $props();
  let ignoredAt = $derived(Date.parse(row.ignoredAt));
</script>

<article class="ignored-row">
  <button
    class="card-main ignored-main"
    aria-label={`Open ${row.item?.pr.title ?? row.id} on GitHub`}
    onclick={() => onopen(row.url)}
  >
    <RowSummary item={row.item} {now} {stale}>
      {#snippet unavailable()}
        <span class="repo">{row.repository} <span class="number">#{row.number}</span></span><strong
          >Pull request details unavailable</strong
        ><span class="secondary">You can still open or unignore this pull request.</span>
      {/snippet}
    </RowSummary>
  </button>
  <div class="ignored-meta">
    <span class="ignored-at-label">Ignored</span>
    {#if Number.isNaN(ignoredAt)}
      <span class="ignored-at">Date unknown</span>
    {:else}
      <time class="ignored-at" datetime={row.ignoredAt}
        >{new Date(ignoredAt).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}</time
      >
    {/if}
    <div class="ignored-actions">
      <button
        disabled={busy}
        aria-label={`Unignore ${row.item?.pr.title ?? row.id}`}
        onclick={() => onunignore(row.id)}>Unignore</button
      >
    </div>
  </div>
</article>
