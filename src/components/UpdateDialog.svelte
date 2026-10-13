<script lang="ts">
  import { tick } from 'svelte';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import type { UpdateState } from '../lib/updates/types';
  import { progressLabel, releaseNotesUrl } from '../lib/updates/updater';
  let {
    update,
    installedVersion,
    onupdate,
    onretry,
    onlater,
    onopen,
  }: {
    update: UpdateState;
    installedVersion: string;
    onupdate: () => void;
    onretry: () => void;
    onlater: () => void;
    onopen: (url: string) => void;
  } = $props();
  let dialog = $state<HTMLDialogElement>();
  let primary = $state<HTMLButtonElement>();
  let phase = $derived(update.phase);
  let busy = $derived(phase === 'downloading' || phase === 'waiting' || phase === 'restarting');
  let title = $derived(
    {
      disabled: 'Updates are off',
      idle: 'Check for updates',
      checking: 'Checking for updates…',
      current: 'PR Desk is up to date',
      available: 'Update available',
      downloading: update.progress?.finished ? 'Installing update…' : 'Downloading update…',
      waiting: 'Finishing pending work…',
      restarting: 'Restarting PR Desk…',
      'check-failed': 'Could not check for updates',
      'install-failed': 'Update failed',
      'restart-failed': 'Restart to finish updating',
    }[phase],
  );
  let description = $derived(
    {
      disabled: 'Development builds never check for, download or install updates.',
      idle: '',
      checking: 'Looking for a newer release on GitHub.',
      current: 'You have the latest version of PR Desk.',
      available: `PR Desk ${update.version} is ready to download. PR Desk restarts once it is installed.`,
      downloading: 'PR Desk restarts once the update is installed.',
      waiting:
        'The update is installed. PR Desk restarts as soon as pending changes finish saving.',
      restarting: 'The update is installed.',
      'check-failed': update.error,
      'install-failed': update.error,
      'restart-failed': update.error,
    }[phase],
  );
  let primaryLabel = $derived(
    phase === 'available'
      ? 'Update and restart'
      : phase === 'install-failed' || phase === 'check-failed'
        ? 'Try again'
        : phase === 'restart-failed'
          ? 'Restart now'
          : busy
            ? 'Updating…'
            : null,
  );
  let dismissLabel = $derived(update.version ? 'Later' : 'Close');
  $effect(() => {
    if (update.dialogOpen && dialog && !dialog.open) dialog.showModal();
    else if (!update.dialogOpen && dialog?.open) dialog.close();
  });
  // Each outcome swaps the buttons, so focus follows to the one that acts on it.
  $effect(() => {
    void phase;
    if (!update.dialogOpen) return;
    void tick().then(() => {
      if (primary && !primary.disabled) primary.focus();
    });
  });
</script>

<dialog
  bind:this={dialog}
  class="update-dialog"
  aria-labelledby="update-title"
  aria-describedby="update-description"
  oncancel={(event) => {
    event.preventDefault();
    if (!busy) onlater();
  }}
>
  <h2 id="update-title">{title}</h2>
  <p id="update-description" role={update.error ? 'alert' : null}>{description}</p>
  <dl class="update-versions">
    <div>
      <dt>Installed</dt>
      <dd>v{installedVersion}</dd>
    </div>
    {#if update.version}
      <div>
        <dt>Available</dt>
        <dd>v{update.version}</dd>
      </div>
    {/if}
  </dl>
  {#if update.version}
    <button
      class="update-notes"
      onclick={() => update.version && onopen(releaseNotesUrl(update.version))}
      >Release notes <ArrowUpRight size={13} /></button
    >
  {/if}
  {#if phase === 'downloading' && update.progress}
    <div class="update-progress">
      {#if update.progress.total && !update.progress.finished}
        <progress
          aria-labelledby="update-progress-label"
          max={update.progress.total}
          value={update.progress.downloaded}
        ></progress>
      {:else}
        <!-- Without a value a progress bar is indeterminate, for an unknown size or the install. -->
        <progress aria-labelledby="update-progress-label"></progress>
      {/if}
      <span id="update-progress-label" role="status">{progressLabel(update.progress)}</span>
    </div>
  {:else if phase === 'checking' || phase === 'waiting' || phase === 'restarting'}
    <p class="update-status" role="status">
      <LoaderCircle size={16} class="update-spinner" />{phase === 'checking'
        ? 'Checking…'
        : phase === 'waiting'
          ? 'Waiting for pending changes…'
          : 'Restarting…'}
    </p>
  {/if}
  <div class="update-actions">
    <button type="button" disabled={busy} onclick={onlater}>{dismissLabel}</button>
    {#if primaryLabel}
      <button
        bind:this={primary}
        type="button"
        class="primary-button"
        disabled={busy}
        onclick={phase === 'available' ? onupdate : onretry}>{primaryLabel}</button
      >
    {/if}
  </div>
</dialog>

<style>
  .update-dialog {
    width: min(440px, calc(100vw - 48px));
    padding: 24px;
    border: 1px solid #dce2dc;
    border-radius: 12px;
    color: #26332e;
    background: white;
    box-shadow: 0 20px 60px #0003;
  }
  .update-dialog::backdrop {
    background: #18202b66;
  }
  h2 {
    margin: 0 0 12px;
  }
  p {
    line-height: 1.5;
  }
  [role='alert'] {
    color: #b42318;
  }
  .update-versions {
    display: flex;
    gap: 24px;
    margin: 16px 0 12px;
  }
  .update-versions dt {
    font-size: 11px;
    font-weight: 650;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: #79857a;
  }
  .update-versions dd {
    margin: 4px 0 0;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .update-notes {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #3f6746;
    text-decoration: underline;
  }
  .update-notes:hover {
    background: transparent;
    color: #294d36;
  }
  .update-progress {
    display: grid;
    gap: 6px;
    margin-top: 16px;
    font-size: 12px;
    color: #62725e;
  }
  progress {
    width: 100%;
    accent-color: #3f6746;
  }
  .update-status {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
    font-weight: 600;
  }
  .update-status :global(.update-spinner) {
    flex: none;
    animation: update-spin 0.9s linear infinite;
  }
  @keyframes update-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .update-status :global(.update-spinner) {
      animation: none;
    }
  }
  .update-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 24px;
  }
</style>
