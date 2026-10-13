<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import FolderGit2 from '@lucide/svelte/icons/folder-git-2';
  import X from '@lucide/svelte/icons/x';
  import { repositoryCounts } from '../lib/pr/repositories';
  let {
    items,
    selected,
    onselect,
  }: {
    items: { pr: { repository: string } }[];
    selected: string | null;
    onselect: (repository: string | null) => void;
  } = $props();
  let open = $state(false);
  let counts = $derived(repositoryCounts(items, selected));
  let total = $derived(items.length);
  function choose(repository: string | null) {
    open = false;
    onselect(repository);
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') open = false;
  }}
/>
<div class="repository-filter">
  <button
    class="repository-trigger"
    class:active={selected !== null}
    aria-haspopup="true"
    aria-expanded={open}
    onclick={() => (open = !open)}
    ><FolderGit2 size={13} /><span class="repository-name">{selected ?? 'All repositories'}</span
    ><span class="repository-count"
      >{selected ? (counts.find((c) => c.repository === selected)?.count ?? 0) : total}</span
    >{#if !selected}<ChevronDown size={12} />{/if}</button
  >
  {#if selected}<button
      class="repository-clear"
      aria-label="Clear repository filter"
      onclick={() => choose(null)}><X size={11} /></button
    >{/if}
  {#if open}
    <!-- The backdrop swallows the dismissing click so it cannot also open the PR behind it. -->
    <div class="menu-backdrop" onclick={() => (open = false)} role="presentation"></div>
    <div class="card-menu repository-menu" role="group" aria-label="Repositories">
      <span class="menu-label">Filter by repository</span>
      <button aria-pressed={selected === null} onclick={() => choose(null)}
        ><span class="repository-check"
          >{#if selected === null}<Check size={12} />{/if}</span
        >All repositories<span class="repository-count">{total}</span></button
      >
      {#if counts.length}<hr />{/if}
      {#each counts as { repository, count } (repository)}
        <button aria-pressed={selected === repository} onclick={() => choose(repository)}
          ><span class="repository-check"
            >{#if selected === repository}<Check size={12} />{/if}</span
          ><span class="repository-name">{repository}</span><span class="repository-count"
            >{count}</span
          ></button
        >
      {/each}
    </div>
  {/if}
</div>
