<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import { hotkeys, hotkeySections } from '../lib/hotkeys/hotkeys';
  import { displayKeys, spokenKeys } from '../lib/hotkeys/format';
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
      <button onclick={onclose} aria-label="Close keyboard shortcuts"><X size={16} /></button>
    </header>
    {#each hotkeySections as section (section.id)}
      <section aria-labelledby="hotkey-section-{section.id}">
        <h3 id="hotkey-section-{section.id}">{section.title}</h3>
        <dl>
          {#each hotkeys.filter((h) => h.section === section.id) as hotkey (hotkey.action)}
            <div class="hotkey-row">
              <dt>{hotkey.description}</dt>
              <dd>
                <span class="visually-hidden"
                  >{[spokenKeys(hotkey), ...(hotkey.alternateKeys ?? [])].join(' or ')}</span
                >
                <!-- One kbd per key inside a wrapping kbd, the markup MDN documents for a
                     combination; the glyphs announce poorly, so the caps are hidden and the
                     spelled-out combination above is what a screen reader reads. -->
                <kbd class="key-combo" aria-hidden="true"
                  >{#each displayKeys(hotkey) as key, index}{#if index > 0}<span class="key-plus"
                        >+</span
                      >{/if}<kbd>{key}</kbd>{/each}</kbd
                >
                {#each hotkey.alternateKeys ?? [] as key}
                  <span class="key-or" aria-hidden="true">or</span>
                  <kbd class="key-combo" aria-hidden="true"><kbd>{key}</kbd></kbd>
                {/each}
              </dd>
            </div>
          {/each}
        </dl>
      </section>
    {/each}
    <p>Press <kbd class="key-combo"><kbd>Esc</kbd></kbd> to close.</p>
  </div>
</dialog>
