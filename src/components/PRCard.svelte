<script lang="ts">
  import PRDetails from './PRDetails.svelte';
  import SnoozeChoices from './SnoozeChoices.svelte';
  import { cardViewModel } from '../lib/pr/card-view-model';
  import type { ClassifiedPR } from '../lib/pr/classify';
  import { type SnoozeOption } from '../lib/store/app-state';
  let {
    item,
    now,
    snoozeOptions,
    stale,
    watching,
    busy,
    onopen,
    onaction,
  }: {
    item: ClassifiedPR;
    now: number;
    snoozeOptions: SnoozeOption[];
    stale: boolean;
    watching: boolean;
    busy: boolean;
    onopen: (url: string) => void;
    onaction: (id: string, action: string, until?: string) => void;
  } = $props();
  let menu = $state(false),
    submenu = $state(false);
  let card = $derived(cardViewModel(item, now));
  function close() {
    menu = false;
    submenu = false;
  }
  function act(action: string, until?: string) {
    if (busy) return;
    close();
    onaction(card.pr.id, action, until);
  }
  // The submenu opens beside its row, so cards low on the board would push it past the
  // window; lift it by however much it overflows.
  function keepInView(node: HTMLElement) {
    const overflow = node.getBoundingClientRect().bottom - (window.innerHeight - 8);
    if (overflow > 0) node.style.top = `${-6 - overflow}px`;
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    if (submenu) submenu = false;
    else close();
  }}
/>
<article class="pr-card">
  <button
    class="card-main"
    onclick={() => onopen(card.pr.url)}
    aria-label={`Open ${card.pr.title} on GitHub`}
  >
    <PRDetails {item} {now} {stale} />
  </button>
  <button
    disabled={busy}
    class="menu-trigger"
    aria-label={`Actions for ${card.pr.title}`}
    aria-expanded={menu}
    onclick={() => (menu ? close() : (menu = true))}>•••</button
  >
  {#if menu}
    <!-- The backdrop swallows the dismissing click so it cannot also open the PR behind it. -->
    <div class="menu-backdrop" onclick={close} role="presentation"></div>
    <div class="card-menu" role="group" aria-label="PR actions">
      <button
        onclick={() => {
          close();
          onopen(card.pr.url);
        }}>Open on GitHub ↗</button
      >
      <button onclick={() => act(watching ? 'unwatch' : 'watch')}
        >{watching ? 'Stop watching' : 'Watch PR'}</button
      >
      <div class="submenu-anchor">
        <button aria-expanded={submenu} onclick={() => (submenu = !submenu)}
          >Snooze<span class="chevron" aria-hidden="true">{submenu ? '▾' : '▸'}</span></button
        >
        {#if submenu}
          <div
            use:keepInView
            class="card-menu card-submenu"
            role="group"
            aria-label="Snooze options"
          >
            <SnoozeChoices
              {snoozeOptions}
              {now}
              {busy}
              onselect={(until) => act('snooze', until)}
            />
          </div>
        {/if}
      </div>
      <button class="danger" onclick={() => act('ignore')}>Ignore PR</button>
      <button onclick={close}>Close menu</button>
    </div>
  {/if}
</article>
