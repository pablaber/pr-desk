<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import X from '@lucide/svelte/icons/x';
  import type { Component } from 'svelte';
  import { filterCounts } from '../lib/pr/board-filters';
  import type { LabelColor } from '../lib/store/app-state';
  let {
    values,
    selected,
    onselect,
    icon: Icon,
    singular,
    plural,
    tagColor,
  }: {
    // The values each PR on the board carries.
    values: string[][];
    selected: string | null;
    onselect: (value: string | null) => void;
    icon: Component<{ size?: number }>;
    singular: string;
    plural: string;
    // Values given a colour show as title tag badges, as they do on cards.
    tagColor?: (value: string) => LabelColor;
  } = $props();
  let open = $state(false);
  let counts = $derived(filterCounts(values, selected));
  let total = $derived(values.length);
  function choose(value: string | null) {
    open = false;
    onselect(value);
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') open = false;
  }}
/>
{#snippet name(value: string)}{#if tagColor}<span
      class="badge title-tag filter-name"
      style:--tag-color={tagColor(value)}>{value}</span
    >{:else}<span class="filter-name">{value}</span>{/if}{/snippet}
<div class="board-filter">
  <button
    class:active={selected !== null}
    aria-haspopup="true"
    aria-expanded={open}
    onclick={() => (open = !open)}
    ><Icon size={13} />{#if selected}{@render name(selected)}{:else}<span class="filter-name"
        >All {plural}</span
      >{/if}<span class="filter-count"
      >{selected ? (counts.find((c) => c.value === selected)?.count ?? 0) : total}</span
    >{#if !selected}<ChevronDown size={12} />{/if}</button
  >
  {#if selected}<button
      class="filter-clear"
      aria-label="Clear {singular} filter"
      onclick={() => choose(null)}><X size={11} /></button
    >{/if}
  {#if open}
    <!-- The backdrop swallows the dismissing click so it cannot also open the PR behind it. -->
    <div class="menu-backdrop" onclick={() => (open = false)} role="presentation"></div>
    <div
      class="card-menu filter-menu"
      role="group"
      aria-label={plural[0].toUpperCase() + plural.slice(1)}
    >
      <span class="menu-label">Filter by {singular}</span>
      <button aria-pressed={selected === null} onclick={() => choose(null)}
        ><span class="filter-check"
          >{#if selected === null}<Check size={12} />{/if}</span
        >All {plural}<span class="filter-count">{total}</span></button
      >
      {#if counts.length}<hr />{/if}
      {#each counts as { value, count } (value)}
        <button aria-pressed={selected === value} onclick={() => choose(value)}
          ><span class="filter-check"
            >{#if selected === value}<Check size={12} />{/if}</span
          >{@render name(value)}<span class="filter-count">{count}</span></button
        >
      {/each}
    </div>
  {/if}
</div>
