<script lang="ts">
  import Tag from '@lucide/svelte/icons/tag';
  import {
    labelNameTaken,
    parseLabelName,
    randomLabelColor,
    type AppState,
  } from '../lib/store/app-state';
  import { labelSummaries, type LabelOp } from '../lib/pr/labels';
  import LabelColorPicker from './LabelColorPicker.svelte';
  let {
    preferences,
    busy,
    onselect,
    onlabel,
  }: {
    preferences: AppState;
    busy: boolean;
    onselect: (labelId: string) => void;
    onlabel: (op: LabelOp) => void;
  } = $props();
  let rows = $derived(labelSummaries(preferences));
  let name = $state(''),
    color = $state(randomLabelColor()),
    problem = $state('');
  let renaming = $state<{ id: string; name: string } | null>(null),
    renameProblem = $state(''),
    deleting = $state<string | null>(null);
  // Validation runs here so a bad name shows beside its field instead of as a save error.
  function problemFor(value: string, exceptId?: string): string {
    try {
      const parsed = parseLabelName(value);
      return labelNameTaken(preferences.labels, parsed, exceptId)
        ? 'A label with that name exists.'
        : '';
    } catch (e) {
      return (e as Error).message;
    }
  }
  function create() {
    problem = problemFor(name);
    if (problem || busy) return;
    onlabel({ type: 'create', name, color });
    name = '';
    color = randomLabelColor();
  }
  function rename() {
    if (!renaming || busy) return;
    renameProblem = problemFor(renaming.name, renaming.id);
    if (renameProblem) return;
    onlabel({ type: 'rename', labelId: renaming.id, name: renaming.name });
    renaming = null;
  }
</script>

<div class="dashboard-heading">
  <div>
    <div class="eyebrow">GROUP YOUR WORK</div>
    <h1>Labels</h1>
    <p>Labels live only in PR Desk. Nothing is written to GitHub.</p>
  </div>
</div>
<div class="labels-list" aria-busy={busy}>
  <form
    class="label-create"
    onsubmit={(e) => {
      e.preventDefault();
      create();
    }}
  >
    <input
      type="text"
      aria-label="New label name"
      placeholder="Label name"
      maxlength="32"
      bind:value={name}
      aria-invalid={problem ? 'true' : undefined}
      oninput={() => (problem = '')}
    />
    <LabelColorPicker {color} name="New label color" onchange={(next) => (color = next)} />
    <button type="submit" class="primary-button" disabled={busy}>Create label</button>
  </form>
  {#if problem}<span class="field-error" role="alert">{problem}</span>{/if}
  {#each rows as { label, count } (label.id)}
    <div class="label-row">
      {#if renaming?.id === label.id}
        <form
          class="label-rename"
          onsubmit={(e) => {
            e.preventDefault();
            rename();
          }}
        >
          <i class="label-dot" style:--label-color={label.color}></i>
          <input
            type="text"
            aria-label={`Rename ${label.name}`}
            maxlength="32"
            bind:value={renaming.name}
            oninput={() => (renameProblem = '')}
          />
          <button type="submit" disabled={busy}>Save</button>
          <button
            type="button"
            onclick={() => {
              renaming = null;
              renameProblem = '';
            }}>Cancel</button
          >
          {#if renameProblem}<span class="field-error" role="alert">{renameProblem}</span>{/if}
        </form>
      {:else}
        <button class="label-open" onclick={() => onselect(label.id)}>
          <i class="label-dot" style:--label-color={label.color}></i><strong>{label.name}</strong>
          <span class="label-count">{count} pull request{count === 1 ? '' : 's'}</span>
        </button>
        {#if deleting === label.id}
          <div class="label-actions">
            <span>Delete label?</span>
            <button
              class="danger"
              disabled={busy}
              onclick={() => {
                deleting = null;
                onlabel({ type: 'delete', labelId: label.id });
              }}>Delete</button
            >
            <button onclick={() => (deleting = null)}>Cancel</button>
          </div>
        {:else}
          <div class="label-actions">
            <button
              disabled={busy}
              aria-label={`Rename ${label.name}`}
              onclick={() => {
                renaming = { id: label.id, name: label.name };
                renameProblem = '';
              }}>Rename</button
            >
            <LabelColorPicker
              color={label.color}
              name={`Color for ${label.name}`}
              disabled={busy}
              onchange={(next) => onlabel({ type: 'recolor', labelId: label.id, color: next })}
            />
            <button
              class="danger"
              disabled={busy}
              aria-label={`Delete ${label.name}`}
              onclick={() => (deleting = label.id)}>Delete</button
            >
          </div>
        {/if}
      {/if}
    </div>
  {:else}
    <div class="empty-column">
      <span><Tag size={24} /></span>
      <p>No labels yet — add one from a card’s ⋯ menu or create one here.</p>
    </div>
  {/each}
</div>
