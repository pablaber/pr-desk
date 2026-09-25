<script lang="ts">
  import { cardViewModel } from '../lib/pr/card-view-model';
  import type { ClassifiedPR } from '../lib/pr/classify';
  import {
    snoozeUntil,
    snoozeOptionKey,
    snoozeOptionLabel,
    type SnoozeOption,
  } from '../lib/store/app-state';
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
    submenu = $state(false),
    custom = $state('');
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
    <span class="repo"
      >{card.pr.repository} <span class="number">#{card.pr.number}</span>
      <span class="author">{card.pr.author}</span></span
    >
    <strong>{card.pr.title}</strong>
    <span class="badges"
      >{#each card.badges as badge}<span class="badge">{badge}</span
        >{/each}{#if card.reviewBadge}<span class="badge review {card.reviewBadge.tone}"
          >{card.reviewBadge.label}</span
        >{/if}{#if card.staleness}<span class="badge staleness {card.staleness}">Stale</span
        >{/if}</span
    >
    <span class="status {card.state}"
      >{card.state === 'ready-to-merge' ? '✓' : card.state === 'needs-attention' ? '!' : '◷'}
      {card.primary}</span
    >
    {#if card.secondary}<span class="secondary">{card.secondary}</span>{/if}
    <span class="age"
      >Updated {card.age}{#if stale}<span class="stale">
          · Refresh failed · may be out of date</span
        >{/if}</span
    >
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
            {#if snoozeOptions.length}<span class="menu-label">Snooze for</span>{/if}
            {#each snoozeOptions as option (snoozeOptionKey(option))}
              <button onclick={() => act('snooze', snoozeUntil(option))}
                >{snoozeOptionLabel(option)}</button
              >
            {/each}
            <label class="custom-label"
              >Custom date<input type="datetime-local" bind:value={custom} /></label
            >
            <button
              disabled={!custom || new Date(custom).getTime() <= now}
              onclick={() => act('snooze', new Date(custom).toISOString())}
              >Snooze until custom date</button
            >
          </div>
        {/if}
      </div>
      <button class="danger" onclick={() => act('ignore')}>Ignore PR</button>
      <button onclick={close}>Close menu</button>
    </div>
  {/if}
</article>
