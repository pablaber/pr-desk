<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import { labelNameTaken, parseLabelName, type PRLabel } from '../lib/store/app-state';
  import type { LabelOp } from '../lib/pr/labels';
  let {
    prId,
    allLabels,
    applied,
    busy = false,
    onlabel,
  }: {
    prId: string;
    allLabels: PRLabel[];
    applied: PRLabel[];
    busy?: boolean;
    onlabel: (op: LabelOp) => void;
  } = $props();
  let name = $state(''),
    problem = $state('');
  function add() {
    if (busy) return;
    try {
      const parsed = parseLabelName(name);
      if (labelNameTaken(allLabels, parsed)) throw new Error('A label with that name exists.');
      onlabel({ type: 'create', name: parsed, prId });
      name = '';
      problem = '';
    } catch (e) {
      problem = (e as Error).message;
    }
  }
</script>

{#if allLabels.length}<span class="menu-label">Labels</span>{/if}
{#each allLabels as label (label.id)}
  {@const checked = applied.some((a) => a.id === label.id)}
  <button
    class="label-choice"
    role="menuitemcheckbox"
    aria-checked={checked}
    disabled={busy}
    onclick={() => onlabel({ type: 'toggle', prId, labelId: label.id })}
    ><i class="label-dot" style:--label-color={label.color}></i><span>{label.name}</span
    >{#if checked}<Check size={12} />{/if}</button
  >
{/each}
<form
  class="custom-label"
  onsubmit={(e) => {
    e.preventDefault();
    add();
  }}
>
  <label
    >New label<input
      type="text"
      bind:value={name}
      maxlength="32"
      aria-invalid={problem ? 'true' : undefined}
      oninput={() => (problem = '')}
    /></label
  >
  {#if problem}<span class="field-error" role="alert">{problem}</span>{/if}
  <button type="submit" disabled={busy || !name.trim()}>Add</button>
</form>
