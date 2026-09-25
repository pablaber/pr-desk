<script lang="ts">
  import PRDetails from './PRDetails.svelte';
  import SnoozeChoices from './SnoozeChoices.svelte';
  import type { snoozedPullRequests } from '../lib/pr/snoozed';
  import type { SnoozeOption } from '../lib/store/app-state';
  let {
    row,
    now,
    busy,
    stale,
    snoozeOptions,
    onopen,
    onaction,
    onrestore,
  }: {
    row: ReturnType<typeof snoozedPullRequests>[number];
    now: number;
    busy: boolean;
    stale: boolean;
    snoozeOptions: SnoozeOption[];
    onopen: (url: string) => void;
    onaction: (id: string, action: string, until?: string) => void;
    onrestore: (id: string) => void;
  } = $props();
  let menu = $state(false);
  let trigger: HTMLButtonElement;
  function close() {
    menu = false;
    trigger?.focus();
  }
  function keepInView(node: HTMLElement) {
    const overflow = node.getBoundingClientRect().bottom - (window.innerHeight - 8);
    if (overflow > 0) node.style.top = `${36 - overflow}px`;
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape' && menu) {
      e.preventDefault();
      close();
    }
  }}
/>
<article class="snoozed-row">
  <button
    class="card-main snoozed-main"
    aria-label={`Open ${row.item?.pr.title ?? row.id} on GitHub`}
    onclick={() =>
      onopen(row.item?.pr.url ?? `https://github.com/${row.id.replace('#', '/pull/')}`)}
  >
    {#if row.item}
      <PRDetails item={row.item} {now} {stale} />
      {#if row.item.pr.state !== 'OPEN'}<span class="badge"
          >{row.item.pr.state === 'MERGED' ? 'Merged' : 'Closed'}</span
        >{/if}
    {:else}
      <span class="repo">{row.id}</span><strong>Pull request details unavailable</strong><span
        class="secondary">You can still open, reschedule, or restore this pull request.</span
      >
    {/if}
  </button>
  <div class="snoozed-schedule">
    <span class="snoozed-until-label">Snoozed until</span>
    <time datetime={row.until}
      >{new Date(row.until).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })}</time
    >
    <div class="snoozed-actions">
      <button disabled={busy} onclick={() => onrestore(row.id)}>Restore now</button>
      <div class="snoozed-menu-anchor">
        <button
          bind:this={trigger}
          class="snooze-trigger"
          disabled={busy}
          aria-label={`Change snooze for ${row.item?.pr.title ?? row.id}`}
          title="Change snooze"
          aria-expanded={menu}
          onclick={() => (menu = !menu)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg
          >
        </button>
        {#if menu}
          <div class="menu-backdrop" onclick={close} role="presentation"></div>
          <div
            class="card-menu snoozed-menu"
            use:keepInView
            role="group"
            aria-label="Snooze options"
          >
            <SnoozeChoices
              {snoozeOptions}
              {now}
              {busy}
              onselect={(until) => {
                close();
                onaction(row.id, 'snooze', until);
              }}
            />
          </div>
        {/if}
      </div>
    </div>
  </div>
</article>
