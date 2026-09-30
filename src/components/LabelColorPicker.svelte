<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import {
    parseLabelColor,
    randomLabelColor,
    SUGGESTED_LABEL_COLORS,
    type LabelColor,
  } from '../lib/store/app-state';
  let {
    color,
    name,
    disabled = false,
    onchange,
  }: {
    color: LabelColor;
    name: string;
    disabled?: boolean;
    onchange: (color: LabelColor) => void;
  } = $props();
  let open = $state(false),
    draft = $state(''),
    invalid = $state(false);
  function show() {
    draft = color;
    invalid = false;
    open = true;
  }
  function pick(next: LabelColor) {
    draft = next;
    invalid = false;
    if (next !== color) onchange(next);
  }
  // Custom colors apply on Enter or blur so a half-typed hex never reaches the preferences file.
  function commitDraft() {
    try {
      pick(parseLabelColor(draft));
    } catch {
      invalid = true;
    }
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (open && e.key === 'Escape') open = false;
  }}
/>
<div class="color-picker">
  <button
    type="button"
    class="color-trigger"
    aria-label={name}
    aria-expanded={open}
    {disabled}
    onclick={() => (open ? (open = false) : show())}
    ><i class="label-dot" style:--label-color={color}></i><span>{color}</span></button
  >
  {#if open}
    <div class="menu-backdrop" onclick={() => (open = false)} role="presentation"></div>
    <div class="color-menu" role="group" aria-label={name}>
      <div class="color-custom">
        <button
          type="button"
          class="color-shuffle"
          style:--label-color={color}
          aria-label="Random color"
          title="Random color"
          {disabled}
          onclick={() => pick(randomLabelColor())}><RefreshCw size={14} /></button
        >
        <input
          type="text"
          aria-label="Hex color"
          maxlength="7"
          spellcheck="false"
          bind:value={draft}
          aria-invalid={invalid ? 'true' : undefined}
          oninput={() => (invalid = false)}
          onblur={commitDraft}
          onkeydown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            commitDraft();
          }}
        />
      </div>
      <div class="color-swatches">
        {#each SUGGESTED_LABEL_COLORS as swatch (swatch)}
          <button
            type="button"
            class="color-swatch"
            style:--label-color={swatch}
            aria-label={swatch}
            aria-pressed={swatch === color}
            {disabled}
            onclick={() => {
              pick(swatch);
              open = false;
            }}
            >{#if swatch === color}<Check size={12} />{/if}</button
          >
        {/each}
      </div>
    </div>
  {/if}
</div>
