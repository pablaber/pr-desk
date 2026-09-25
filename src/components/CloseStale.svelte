<script lang="ts">
  import type { PullRequest } from '../lib/pr/types';
  let {
    pr,
    busy,
    error,
    onconfirm,
    oncancel,
  }: {
    pr: PullRequest | null;
    busy: boolean;
    error: string;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();
  let dialog = $state<HTMLDialogElement>();
  let confirm = $state<HTMLButtonElement>();
  $effect(() => {
    if (pr && dialog && !dialog.open) {
      dialog.showModal();
      confirm?.focus();
    } else if (!pr && dialog?.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  class="close-stale-dialog"
  aria-labelledby="close-stale-title"
  aria-describedby="close-stale-description"
  oncancel={(event) => {
    event.preventDefault();
    if (!busy) oncancel();
  }}
>
  <h2 id="close-stale-title">Close as stale?</h2>
  <p id="close-stale-description">
    Are you sure you want to close <strong>{pr?.title}</strong> on GitHub?
  </p>
  <p>PR Desk will leave this comment using your GitHub account:</p>
  <blockquote>
    🤖 This PR has been closed via the PR Desk application because it is stale and hasn't been
    updated in {pr ? Math.floor((Date.now() - Date.parse(pr.updatedAt)) / 86400000) : 0} days.
  </blockquote>
  {#if error}<p role="alert">{error}</p>{/if}
  <div class="close-stale-actions">
    <button disabled={busy} onclick={oncancel}>Cancel</button>
    <button bind:this={confirm} class="destructive-button" disabled={busy} onclick={onconfirm}
      >{busy ? 'Closing…' : 'Close as stale'}</button
    >
  </div>
</dialog>

<style>
  .close-stale-dialog {
    width: min(480px, calc(100vw - 48px));
    padding: 24px;
    border: 1px solid #ddd;
    border-radius: 12px;
    color: #252936;
    background: white;
    box-shadow: 0 20px 60px #0003;
  }
  .close-stale-dialog::backdrop {
    background: #18202b66;
  }
  h2 {
    margin-top: 0;
  }
  p,
  blockquote {
    line-height: 1.5;
  }
  blockquote {
    margin: 16px 0;
    padding: 12px;
    background: #f5f6f8;
    border-radius: 6px;
  }
  [role='alert'] {
    color: #b42318;
  }
  .close-stale-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 24px;
  }
  .destructive-button {
    background: #b42318;
    color: white;
    border-color: #b42318;
  }
  .destructive-button:hover:not(:disabled) {
    background: #912018;
  }
  .destructive-button:focus-visible {
    outline: 2px solid #b42318;
    outline-offset: 3px;
  }
</style>
