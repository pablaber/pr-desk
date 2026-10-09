<script lang="ts">
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import type { PullRequest } from '../lib/pr/types';
  let {
    pr,
    action,
    busy,
    error,
    status,
    onconfirm,
    oncancel,
  }: {
    pr: PullRequest | null;
    action: 'close-stale' | 'merge' | 'approve-merge' | 'update-branch';
    busy: boolean;
    error: string;
    status: string;
    onconfirm: (method: string) => void;
    oncancel: () => void;
  } = $props();
  let method = $state('squash');
  let merging = $derived(action === 'merge' || action === 'approve-merge');
  let updating = $derived(action === 'update-branch');
  let approving = $derived(action === 'approve-merge');
  let dialog = $state<HTMLDialogElement>();
  let confirm = $state<HTMLButtonElement>();
  $effect(() => {
    if (pr && dialog && !dialog.open) {
      method = 'squash';
      dialog.showModal();
      confirm?.focus();
    } else if (!pr && dialog?.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  class="pr-confirmation-dialog"
  aria-labelledby="pr-confirmation-title"
  aria-describedby="pr-confirmation-description"
  oncancel={(event) => {
    event.preventDefault();
    if (!busy) oncancel();
  }}
>
  <h2 id="pr-confirmation-title">
    {approving
      ? 'Approve and merge pull request?'
      : merging
        ? 'Merge pull request?'
        : updating
          ? 'Update branch?'
          : 'Close as stale?'}
  </h2>
  <p id="pr-confirmation-description">
    Are you sure you want to {approving
      ? 'approve and merge'
      : merging
        ? 'merge'
        : updating
          ? 'update'
          : 'close'}
    <strong>{pr?.title}</strong> on GitHub?
  </p>
  {#if merging}
    <p>{pr?.repository} #{pr?.number}</p>
    <label
      >Merge method
      <select bind:value={method} disabled={busy}>
        <option value="squash">Squash and merge</option>
        <option value="merge">Create a merge commit</option>
        <option value="rebase">Rebase and merge</option>
      </select>
    </label>
    <p>
      This will {approving ? 'approve, then merge,' : 'merge'} using your GitHub account. The repository
      must allow the selected method.
    </p>
  {:else if updating}
    <p>{pr?.repository} #{pr?.number}</p>
    <p>
      This will merge the latest <code>{pr?.baseRefName}</code> into
      <code>{pr?.headRefName}</code> using your GitHub account. Checks will run again.
    </p>
  {:else}
    <p>PR Desk will leave this comment using your GitHub account:</p>
    <blockquote>
      🤖 This PR has been closed via the PR Desk application because it is stale and hasn't been
      updated in {pr ? Math.floor((Date.now() - Date.parse(pr.updatedAt)) / 86400000) : 0} days.
    </blockquote>
  {/if}
  {#if busy && status}
    <p class="pr-confirmation-status" role="status">
      <LoaderCircle size={16} class="pr-confirmation-spinner" />{status}
    </p>
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
  <div class="pr-confirmation-actions">
    <button disabled={busy} onclick={oncancel}>Cancel</button>
    <button
      bind:this={confirm}
      class={merging
        ? 'merge-confirm-button'
        : updating
          ? 'update-branch-button'
          : 'destructive-button'}
      disabled={busy}
      onclick={() => onconfirm(method)}
      >{merging
        ? busy
          ? approving
            ? 'Approving and merging…'
            : 'Merging…'
          : approving
            ? 'Approve and merge'
            : 'Confirm merge'
        : updating
          ? busy
            ? 'Updating…'
            : 'Update branch'
          : busy
            ? 'Closing…'
            : 'Close as stale'}</button
    >
  </div>
</dialog>

<style>
  .pr-confirmation-dialog {
    width: min(480px, calc(100vw - 48px));
    padding: 24px;
    border: 1px solid #ddd;
    border-radius: 12px;
    color: #252936;
    background: white;
    box-shadow: 0 20px 60px #0003;
  }
  .pr-confirmation-dialog::backdrop {
    background: #18202b66;
  }
  h2 {
    margin: 0 0 12px;
  }
  label {
    display: grid;
    gap: 8px;
    margin: 16px 0;
    font-weight: 600;
  }
  select {
    padding: 8px 10px;
    border: 1px solid #dce4d5;
    border-radius: 6px;
    background: white;
    color: inherit;
    font: inherit;
    font-weight: 400;
  }
  p + p {
    margin-top: 8px;
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
  .pr-confirmation-status {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
    font-weight: 600;
  }
  .pr-confirmation-status :global(.pr-confirmation-spinner) {
    flex: none;
    animation: pr-confirmation-spin 0.9s linear infinite;
  }
  @keyframes pr-confirmation-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pr-confirmation-status :global(.pr-confirmation-spinner) {
      animation: none;
    }
  }
  .pr-confirmation-actions {
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
