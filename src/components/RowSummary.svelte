<script lang="ts">
  import type { Snippet } from 'svelte';
  import PRDetails from './PRDetails.svelte';
  import type { ClassifiedPR } from '../lib/pr/classify';
  import type { PRLabel, TitleTagRule } from '../lib/store/app-state';
  // The ignored and snoozed lists keep entries whose pull request the last refresh could not
  // fetch, so each caller supplies its own wording for that case.
  let {
    item,
    now,
    stale,
    labels = [],
    titleTagRules,
    unavailable,
  }: {
    item: ClassifiedPR | null;
    now: number;
    stale: boolean;
    labels?: PRLabel[];
    titleTagRules: TitleTagRule[];
    unavailable: Snippet;
  } = $props();
</script>

{#if item}
  <PRDetails {item} {now} {stale} {labels} {titleTagRules} />
  {#if item.pr.state !== 'OPEN'}<span class="badge"
      >{item.pr.state === 'MERGED' ? 'Merged' : 'Closed'}</span
    >{/if}
{:else}
  {@render unavailable()}
{/if}
