<script lang="ts">
  let {
    open,
    busy,
    onsave,
    ondiscard,
    oncancel,
  }: {
    open: boolean;
    busy: boolean;
    onsave: () => void;
    ondiscard: () => void;
    oncancel: () => void;
  } = $props();
  let dialog = $state<HTMLDialogElement>();
  let save = $state<HTMLButtonElement>();
  $effect(() => {
    if (open && dialog && !dialog.open) {
      dialog.showModal();
      save?.focus();
    } else if (!open && dialog?.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  class="unsaved-dialog"
  aria-labelledby="unsaved-title"
  aria-describedby="unsaved-description"
  oncancel={(event) => {
    event.preventDefault();
    if (!busy) oncancel();
  }}
>
  <h2 id="unsaved-title">Save your settings?</h2>
  <p id="unsaved-description">
    Tracked repositories, ignore rules and watched pull requests have unsaved changes. Saving
    refreshes GitHub data in the background; discarding restores the last saved settings.
  </p>
  <div class="unsaved-actions">
    <button type="button" disabled={busy} onclick={oncancel}>Keep editing</button>
    <button type="button" disabled={busy} onclick={ondiscard}>Discard changes</button>
    <button bind:this={save} type="button" class="primary-button" disabled={busy} onclick={onsave}
      >{busy ? 'Saving…' : 'Save changes'}</button
    >
  </div>
</dialog>

<style>
  .unsaved-dialog {
    width: min(460px, calc(100vw - 48px));
    padding: 24px;
    border: 1px solid #dce2dc;
    border-radius: 12px;
    color: #26332e;
    background: white;
    box-shadow: 0 20px 60px #0003;
  }
  .unsaved-dialog::backdrop {
    background: #18202b66;
  }
  h2 {
    margin-top: 0;
  }
  p {
    line-height: 1.5;
  }
  .unsaved-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 24px;
  }
</style>
