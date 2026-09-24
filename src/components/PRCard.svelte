<script lang="ts">
  import { cardViewModel } from '../lib/pr/card-view-model';
  import type { ClassifiedPR } from '../lib/pr/classify';
  import { snoozeUntil } from '../lib/store/app-state';
  let {
    item,
    now,
    stale,
    watching,
    busy,
    onopen,
    onaction,
  }: {
    item: ClassifiedPR;
    now: number;
    stale: boolean;
    watching: boolean;
    busy: boolean;
    onopen: (url: string) => void;
    onaction: (id: string, action: string, until?: string) => void;
  } = $props();
  let menu = $state(false),
    custom = $state('');
  let card = $derived(cardViewModel(item, now));
  function act(action: string, until?: string) {
    if (busy) return;
    menu = false;
    onaction(card.pr.id, action, until);
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') menu = false;
  }}
/>
<article class="pr-card">
  <button
    class="card-main"
    onclick={() => onopen(card.pr.url)}
    aria-label={`Open ${card.pr.title} on GitHub`}
  >
    <span class="repo">{card.pr.repository} <span class="number">#{card.pr.number}</span></span>
    <strong>{card.pr.title}</strong>
    <span class="badges"
      >{#each card.badges as badge}<span class="badge">{badge}</span>{/each}</span
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
    onclick={() => (menu = !menu)}>•••</button
  >
  {#if menu}
    <div class="card-menu" role="group" aria-label="PR actions">
      <button
        onclick={() => {
          menu = false;
          onopen(card.pr.url);
        }}>Open on GitHub ↗</button
      >
      <button onclick={() => act(watching ? 'unwatch' : 'watch')}
        >{watching ? 'Stop watching' : 'Watch PR'}</button
      >
      <span class="menu-label">Snooze for</span>
      {#each [['1h', '1 hour'], ['4h', '4 hours'], ['tomorrow', 'Until tomorrow, 9 AM'], ['monday', 'Until Monday, 9 AM']] as [value, label]}
        <button onclick={() => act('snooze', snoozeUntil(value))}>{label}</button>
      {/each}
      <label class="custom-label"
        >Custom time<input type="datetime-local" bind:value={custom} /></label
      >
      <button
        disabled={!custom || new Date(custom).getTime() <= now}
        onclick={() => act('snooze', new Date(custom).toISOString())}
        >Snooze until custom time</button
      >
      <button class="danger" onclick={() => act('ignore')}>Ignore PR</button>
      <button onclick={() => (menu = false)}>Close menu</button>
    </div>
  {/if}
</article>
