<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Clock from '@lucide/svelte/icons/clock';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import X from '@lucide/svelte/icons/x';
  import type { PRActionKind, QueuedAction } from '../lib/actions/types';
  let {
    entries,
    done,
    onretry,
    onskip,
    onclear,
    onremove,
  }: {
    entries: QueuedAction[];
    done: number;
    onretry: () => void;
    onskip: () => void;
    onclear: () => void;
    onremove: (key: number) => void;
  } = $props();
  const runningLabel: Record<PRActionKind, string> = {
    merge: 'Merging',
    'approve-merge': 'Approving and merging',
    'update-branch': 'Updating branch of',
    'close-stale': 'Closing',
  };
  const actionLabel: Record<PRActionKind, string> = {
    merge: 'Merge',
    'approve-merge': 'Approve and merge',
    'update-branch': 'Update branch',
    'close-stale': 'Close as stale',
  };
  let expanded = $state(false);
  let head = $derived(entries[0]);
  let failed = $derived(head?.status === 'failed' ? head : undefined);
  let waiting = $derived(entries.filter((e) => e.status === 'queued').length);
  let total = $derived(done + entries.length);
  let open = $derived(expanded || !!failed);
</script>

<section class="action-queue" class:failed={!!failed} aria-label="Action queue">
  {#if open}
    <div class="panel">
      {#if failed}
        <div class="failure" role="alert">
          <b
            >Couldn’t {actionLabel[failed.kind].toLowerCase()}
            {failed.pr.repository} #{failed.pr.number}</b
          >
          <p>{failed.error}</p>
          <div class="failure-actions">
            <button class="retry" onclick={onretry}>Retry</button>
            <button onclick={onskip}>Skip</button>
            <button onclick={onclear}>Clear queue</button>
          </div>
        </div>
      {/if}
      <ol>
        {#each entries.filter((e) => e !== failed) as entry (entry.key)}
          <li class:running={entry.status === 'running'}>
            <span class="row-icon">
              {#if entry.status === 'running'}<LoaderCircle size={13} class="spin" />{:else}<Clock
                  size={13}
                />{/if}
            </span>
            <span class="row-text">
              <b>{entry.pr.title}</b>
              <small>{actionLabel[entry.kind]} · {entry.pr.repository} #{entry.pr.number}</small>
            </span>
            {#if entry.status === 'queued'}
              <button
                class="row-remove"
                aria-label={`Remove ${entry.pr.title} from the queue`}
                onclick={() => onremove(entry.key)}><X size={13} /></button
              >
            {:else}<small class="row-now">Now</small>{/if}
          </li>
        {/each}
      </ol>
    </div>
  {/if}
  <button
    class="queue-summary"
    aria-expanded={open}
    disabled={!!failed}
    onclick={() => (expanded = !expanded)}
  >
    <span class="status-icon">
      {#if failed}<CircleAlert size={15} />{:else}<LoaderCircle size={15} class="spin" />{/if}
    </span>
    <span class="summary-text" role="status">
      {#if failed}
        <b>Queue paused</b>
        <small
          >{waiting ? `${waiting} waiting behind a failed action` : 'Nothing else waiting'}</small
        >
      {:else if head}
        <b>{runningLabel[head.kind]} {head.pr.repository} #{head.pr.number}</b>
        <small>{head.detail || head.pr.title}</small>
      {/if}
    </span>
    {#if total > 1}<span class="count">{done + 1} of {total}</span>{/if}
    {#if !failed}
      <span class="queue-chevron">
        {#if open}<ChevronDown size={14} />{:else}<ChevronUp size={14} />{/if}
      </span>
    {/if}
  </button>
  <!-- GitHub reports no progress within an action, so the bar counts actions and sweeps the current one. -->
  <div
    class="bar"
    class:paused={!!failed}
    role="progressbar"
    aria-label="Queue progress"
    aria-valuemin={0}
    aria-valuemax={total}
    aria-valuenow={done}
  >
    {#each { length: total } as _, i}
      <span class:complete={i < done} class:current={i === done}></span>
    {/each}
  </div>
</section>

<style>
  .action-queue {
    --queue-accent: #287a3e;
    position: fixed;
    /* Settings shows the dock too, and its dialog sits outside the shell that sets the width. */
    left: calc(var(--sidebar-width, 0px) + (100vw - var(--sidebar-width, 0px)) / 2);
    bottom: 20px;
    z-index: 7;
    width: min(440px, calc(100vw - var(--sidebar-width, 0px) - 40px));
    overflow: hidden;
    color: #252936;
    font-size: 12px;
    text-align: left;
    background: white;
    border: 1px solid #dce4d5;
    border-radius: 12px;
    box-shadow: 0 10px 34px #26332e2e;
    transform: translateX(-50%);
  }
  .action-queue.failed {
    --queue-accent: #b42318;
  }
  .queue-summary {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 14px;
    border: 0;
    border-radius: 0;
    background: transparent;
    text-align: left;
  }
  .queue-summary:disabled {
    opacity: 1;
    cursor: default;
  }
  .status-icon {
    display: inline-flex;
    flex: none;
    color: var(--queue-accent);
  }
  .summary-text {
    display: grid;
    flex: 1;
    min-width: 0;
    gap: 1px;
  }
  .summary-text b,
  .summary-text small,
  .row-text b,
  .row-text small {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .summary-text b {
    font-weight: 650;
  }
  small {
    font-size: 10.5px;
    color: #79827b;
  }
  .count {
    flex: none;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: 650;
    color: #294d36;
    background: #eaf4ec;
  }
  .failed .count {
    color: #912018;
    background: #fdecea;
  }
  .queue-chevron {
    display: inline-flex;
    flex: none;
    color: #79827b;
  }
  :global(.action-queue .spin) {
    animation: action-queue-spin 0.9s linear infinite;
  }
  @keyframes action-queue-spin {
    to {
      transform: rotate(360deg);
    }
  }
  .bar {
    display: flex;
    gap: 3px;
    height: 3px;
    padding: 0 3px;
    overflow: hidden;
  }
  .bar span {
    position: relative;
    flex: 1;
    overflow: hidden;
    border-radius: 2px;
    background: #e4ebe0;
  }
  .bar span.complete,
  .bar.paused span.current {
    background: var(--queue-accent);
  }
  .bar span.current::after {
    content: '';
    position: absolute;
    inset: 0;
    width: 45%;
    border-radius: 2px;
    background: var(--queue-accent);
    animation: action-queue-sweep 1.3s ease-in-out infinite;
  }
  .bar.paused span.current::after {
    display: none;
  }
  @keyframes action-queue-sweep {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(225%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.action-queue .spin),
    .bar span.current::after {
      animation: none;
    }
  }
  .panel {
    display: grid;
    gap: 8px;
    padding: 10px;
    max-height: 300px;
    overflow-y: auto;
    border-bottom: 1px solid #eef1eb;
  }
  .failure {
    padding: 10px 12px;
    border: 1px solid #f3cdc8;
    border-radius: 7px;
    background: #fdf3f1;
  }
  .failure b {
    display: block;
    color: #912018;
    font-weight: 650;
  }
  .failure p {
    margin-top: 3px;
    font-size: 11.5px;
    line-height: 1.45;
    color: #7a2e26;
    overflow-wrap: anywhere;
  }
  .failure-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 9px;
  }
  .failure-actions button {
    padding: 4px 10px;
    border: 1px solid #e4c3bd;
    background: white;
    font-size: 11.5px;
    font-weight: 600;
  }
  .failure-actions .retry {
    border-color: #b42318;
    background: #b42318;
    color: white;
  }
  ol {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  ol:empty {
    display: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 7px;
    border-radius: 6px;
  }
  li.running {
    background: #f2f7f2;
  }
  .row-icon {
    display: inline-flex;
    flex: none;
    color: #8a948a;
  }
  li.running .row-icon {
    color: var(--queue-accent);
  }
  .row-text {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .row-text b {
    font-weight: 600;
  }
  .row-remove {
    display: inline-flex;
    flex: none;
    padding: 3px;
    border: 0;
    background: transparent;
    color: #79827b;
  }
  .row-remove:hover {
    background: #eef2ec;
    color: #252936;
  }
  .row-now {
    flex: none;
    font-weight: 600;
    color: #287a3e;
  }
</style>
