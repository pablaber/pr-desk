<script lang="ts">
  import type { Snippet } from 'svelte';
  import PRDetails from './PRDetails.svelte';
  import type { ClassifiedPR } from '../lib/pr/classify';
  // The ignored and snoozed lists keep entries whose pull request the last refresh could not
  // fetch, so each caller supplies its own wording for that case.
  let {
    item,
    now,
    stale,
    unavailable,
  }: {
    item: ClassifiedPR | null;
    now: number;
    stale: boolean;
    unavailable: Snippet;
  } = $props();
</script>

{#if item}
  <PRDetails {item} {now} {stale} />
  {#if item.pr.state !== 'OPEN'}<span class="badge"
      >{item.pr.state === 'MERGED' ? 'Merged' : 'Closed'}</span
    >{/if}
{:else}
  {@render unavailable()}
{/if}
