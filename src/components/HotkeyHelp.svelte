<script lang="ts">
  import { hotkeys } from '../lib/hotkeys/hotkeys';
  let { open, onclose }: { open: boolean; onclose: () => void } = $props();
  let dialog = $state<HTMLDialogElement | null>(null);
  // showModal() brings the focus trap, Escape handling, inert background and top-layer
  // stacking with it, so none of that is reimplemented here.
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
</script>

<dialog
  class="hotkey-help"
  bind:this={dialog}
  aria-labelledby="hotkey-help-title"
  {onclose}
  onclick={(event) => {
    // Clicks on the backdrop are reported against the dialog itself.
    if (event.target === dialog) onclose();
  }}
>
  <div class="hotkey-help-panel">
    <header>
      <h2 id="hotkey-help-title">Keyboard shortcuts</h2>
      <button onclick={onclose} aria-label="Close keyboard shortcuts">×</button>
    </header>
    <dl>
      {#each hotkeys as hotkey (hotkey.action)}
        <div class="hotkey-row">
          <dt>{hotkey.description}</dt>
          <dd><kbd>{hotkey.label}</kbd></dd>
        </div>
      {/each}
    </dl>
    <p>Press <kbd>Esc</kbd> to close.</p>
  </div>
</dialog>
