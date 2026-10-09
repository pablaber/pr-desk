<script lang="ts">
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import Bug from '@lucide/svelte/icons/bug';
  import Copy from '@lucide/svelte/icons/copy';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import GitMerge from '@lucide/svelte/icons/git-merge';
  import GitPullRequestArrow from '@lucide/svelte/icons/git-pull-request-arrow';
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
    compact = false,
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
    compact?: boolean;
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
  let at = $state<{ x: number; y: number } | null>(null);
  let cardEl: HTMLElement;
  let card = $derived(cardViewModel(item, now));
  function close() {
    menu = false;
    submenu = null;
    at = null;
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
  // Menus open beside their row or at the cursor, so cards low or far right on the board
  // would push them past the window; shift them back by however much they overflow. A
  // submenu that would run off the left edge opens on the right of its row instead.
  // The ⋯ menu keeps its usual anchor, so it opts out.
  function keepInView(node: HTMLElement, active = true) {
    if (!active) return;
    if (node.classList.contains('card-submenu') && node.getBoundingClientRect().left < 8) {
      node.style.right = 'auto';
      node.style.left = 'calc(100% + 8px)';
    }
    const rect = node.getBoundingClientRect();
    const down = rect.bottom - (window.innerHeight - 8);
    if (down > 0) node.style.top = `${node.offsetTop - down}px`;
    const across = rect.right - (window.innerWidth - 8);
    if (across > 0) node.style.left = `${node.offsetLeft - across}px`;
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
  class:compact
  data-pr-id={card.pr.id}
  bind:this={cardEl}
  oncontextmenu={(e) => {
    e.preventDefault();
    if (busy) return;
    const r = cardEl.getBoundingClientRect();
    at = { x: e.clientX - r.left - cardEl.clientLeft, y: e.clientY - r.top - cardEl.clientTop };
    submenu = null;
    menu = true;
  }}
  onpointerenter={() => onhover(card.pr.id)}
  onpointerleave={() => onhover(null)}
>
  <button
    class="card-main"
    onclick={() => onopen(card.pr.url)}
    aria-label={`Open ${card.pr.title} on GitHub`}
  >
    <PRDetails {item} {now} {stale} {labels} {compact} />
  </button>
  <button
    disabled={busy}
    class="menu-trigger"
    aria-label={`Actions for ${card.pr.title}`}
    aria-expanded={menu}
    onclick={() => {
      if (menu) close();
      else {
        at = null;
        menu = true;
      }
    }}><Ellipsis size={14} /></button
  >
  {#if card.canMerge}
    <button
      class="merge-button"
      disabled={busy || stale}
      onclick={() => act('merge')}
      aria-label={`Merge ${card.pr.title}`}><GitMerge size={14} /> Merge…</button
    >
  {/if}
  {#if card.canUpdateBranch}
    <button
      class="merge-button update-branch-button"
      disabled={busy || stale}
      onclick={() => act('update-branch')}
      aria-label={`Update branch for ${card.pr.title}`}
      ><GitPullRequestArrow size={14} /> Update branch…</button
    >
  {/if}
  {#if card.canApproveAndMerge}
    <button
      class="merge-button"
      disabled={busy || stale}
      onclick={() => act('approve-merge')}
      aria-label={`Approve and merge ${card.pr.title}`}
      ><GitMerge size={14} /> Approve and merge…</button
    >
  {/if}
  {#if menu}
    <!-- The backdrop swallows the dismissing click so it cannot also open the PR behind it. -->
    <div
      class="menu-backdrop"
      onclick={close}
      oncontextmenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
      }}
      role="presentation"
    ></div>
    <div
      use:keepInView={at !== null}
      class="card-menu"
      style:left={at ? `${at.x}px` : null}
      style:top={at ? `${at.y}px` : null}
      style:right={at ? 'auto' : null}
      role="group"
      aria-label="PR actions"
    >
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
