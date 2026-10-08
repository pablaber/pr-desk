<script lang="ts">
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import Layers from '@lucide/svelte/icons/layers';
  import type { Snippet } from 'svelte';
  import type { ClassifiedPR } from '../lib/pr/classify';
  import type { BoardEntry } from '../lib/pr/stacks';
  let {
    items,
    stack,
    row,
  }: {
    items: ClassifiedPR[];
    stack: NonNullable<BoardEntry['stack']>;
    row: Snippet<[ClassifiedPR, boolean]>;
  } = $props();
</script>

<section
  class="pr-stack"
  aria-label={`Stack of ${items.length} pull requests in ${stack.repository}`}
>
  <div class="stack-heading">
    <Layers size={12} /> Stack
    <span class="stack-repo">· {stack.repository} · {items.length} PRs</span>
  </div>
  <ol class="stack-layers">
    {#each items as item (item.pr.id)}<li>{@render row(item, true)}</li>{/each}
  </ol>
  <div class="stack-base" title="Base branch of the stack">
    <GitBranch size={12} />
    {stack.base}
  </div>
</section>
