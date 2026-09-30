<script lang="ts">
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import Bug from '@lucide/svelte/icons/bug';
  import Copy from '@lucide/svelte/icons/copy';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import GitMerge from '@lucide/svelte/icons/git-merge';
  import PRDetails from './PRDetails.svelte';
  import LabelChoices from './LabelChoices.svelte';
  import SnoozeChoices from './SnoozeChoices.svelte';
  import { ariaKeyShortcut, compactKeys } from '../lib/hotkeys/format';
  import { hotkeyFor } from '../lib/hotkeys/match';
  import { cardViewModel } from '../lib/pr/card-view-model';
  import type { Hotkey } from '../lib/hotkeys/types';
  import type { ClassifiedPR } from '../lib/pr/classify';
  import type { LabelOp } from '../lib/pr/labels';
  import type { PullRequest } from '../lib/pr/types';
  import type { PRLabel, SnoozeOption } from '../lib/store/app-state';
  let {
    item,
    now,
    snoozeOptions,
    stale,
    watching,
    labels,
    allLabels,
    busy,
    onopen,
    oncopy,
    oncopydebuginfo,
    onaction,
    onlabel,
    onhover,
  }: {
    item: ClassifiedPR;
    now: number;
    snoozeOptions: SnoozeOption[];
    stale: boolean;
    watching: boolean;
    labels: PRLabel[];
    allLabels: PRLabel[];
    busy: boolean;
    onopen: (url: string) => void;
    oncopy: (pr: PullRequest) => void;
    oncopydebuginfo: (pr: PullRequest) => void;
    onaction: (id: string, action: string, until?: string) => void;
    onlabel: (op: LabelOp) => void;
    onhover: (id: string | null) => void;
  } = $props();
  const openHotkey = hotkeyFor('open-pr');
  const copyHotkey = hotkeyFor('copy-pr');
  const snoozeHotkey = hotkeyFor('snooze-pr');
  const labelHotkey = hotkeyFor('label-pr');
  const ignoreHotkey = hotkeyFor('ignore-pr');
  let menu = $state(false),
    submenu = $state<'snooze' | 'labels' | null>(null);
  let card = $derived(cardViewModel(item, now));
  function close() {
    menu = false;
    submenu = null;
  }
  export function openSubmenu(which: 'snooze' | 'labels') {
    if (busy) return;
    menu = true;
    submenu = which;
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

{#snippet hint(hotkey: Hotkey | null)}
  {#if hotkey}<span class="menu-hotkey" aria-hidden="true">{compactKeys(hotkey)}</span>{/if}
{/snippet}

<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    if (submenu) submenu = null;
    else close();
  }}
/>
<article
  class="pr-card"
  data-pr-id={card.pr.id}
  onpointerenter={() => onhover(card.pr.id)}
  onpointerleave={() => onhover(null)}
>
  <button
    class="card-main"
    onclick={() => onopen(card.pr.url)}
    aria-label={`Open ${card.pr.title} on GitHub`}
  >
    <PRDetails {item} {now} {stale} {labels} />
  </button>
  <button
    disabled={busy}
    class="menu-trigger"
    aria-label={`Actions for ${card.pr.title}`}
    aria-expanded={menu}
    onclick={() => (menu ? close() : (menu = true))}><Ellipsis size={14} /></button
  >
  {#if card.canMerge}
    <button
      class="merge-button"
      disabled={busy || stale}
      onclick={() => act('merge')}
      aria-label={`Merge ${card.pr.title}`}><GitMerge size={14} /> Merge…</button
    >
  {/if}
  {#if menu}
    <!-- The backdrop swallows the dismissing click so it cannot also open the PR behind it. -->
    <div class="menu-backdrop" onclick={close} role="presentation"></div>
    <div class="card-menu" role="group" aria-label="PR actions">
      <button
        aria-keyshortcuts={openHotkey ? ariaKeyShortcut(openHotkey) : null}
        onclick={() => {
          close();
          onopen(card.pr.url);
        }}>Open on GitHub <ArrowUpRight size={12} />{@render hint(openHotkey)}</button
      >
      <button
        aria-keyshortcuts={copyHotkey ? ariaKeyShortcut(copyHotkey) : null}
        onclick={() => {
          close();
          oncopy(card.pr);
        }}>Copy PR URL <Copy size={12} />{@render hint(copyHotkey)}</button
      >
      <button
        onclick={() => {
          close();
          oncopydebuginfo(card.pr);
        }}>Copy debug info <Bug size={12} /></button
      >
      <button onclick={() => act(watching ? 'unwatch' : 'watch')}
        >{watching ? 'Stop watching' : 'Watch PR'}</button
      >
      <div class="submenu-anchor">
        <button
          aria-expanded={submenu === 'snooze'}
          aria-keyshortcuts={snoozeHotkey ? ariaKeyShortcut(snoozeHotkey) : null}
          onclick={() => (submenu = submenu === 'snooze' ? null : 'snooze')}
          >Snooze{@render hint(snoozeHotkey)}{#if submenu === 'snooze'}<ChevronDown
              class="chevron"
              size={12}
            />{:else}<ChevronRight class="chevron" size={12} />{/if}</button
        >
        {#if submenu === 'snooze'}
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
      <div class="submenu-anchor">
        <button
          aria-expanded={submenu === 'labels'}
          aria-keyshortcuts={labelHotkey ? ariaKeyShortcut(labelHotkey) : null}
          onclick={() => (submenu = submenu === 'labels' ? null : 'labels')}
          >Labels{@render hint(labelHotkey)}{#if submenu === 'labels'}<ChevronDown
              class="chevron"
              size={12}
            />{:else}<ChevronRight class="chevron" size={12} />{/if}</button
        >
        {#if submenu === 'labels'}
          <div use:keepInView class="card-menu card-submenu" role="group" aria-label="Labels">
            <LabelChoices prId={card.pr.id} {allLabels} applied={labels} {busy} {onlabel} />
          </div>
        {/if}
      </div>
      {#if card.staleness === 'high'}
        <button class="danger" onclick={() => act('close-stale')}>Close as stale…</button>
      {/if}
      <button
        class="danger"
        aria-keyshortcuts={ignoreHotkey ? ariaKeyShortcut(ignoreHotkey) : null}
        onclick={() => act('ignore')}>Ignore PR{@render hint(ignoreHotkey)}</button
      >
      <button onclick={close}>Close menu</button>
    </div>
  {/if}
</article>
