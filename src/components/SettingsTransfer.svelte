<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy';
  import { parseSettingsImport, snoozeOptionLabel } from '../lib/store/app-state';
  import type { SettingsConfig } from '../lib/store/app-state';
  let {
    busy,
    dirty,
    oncopy,
    onimport,
  }: {
    busy: boolean;
    dirty: boolean;
    oncopy: () => void;
    onimport: (config: SettingsConfig) => Promise<boolean>;
  } = $props();
  let text = $state('');
  let importError = $state('');
  let preview = $state<SettingsConfig | null>(null);
  let fileInput = $state<HTMLInputElement>();
  function review() {
    preview = null;
    try {
      preview = parseSettingsImport(text);
      importError = '';
    } catch (error) {
      importError = error instanceof Error ? error.message : String(error);
    }
  }
  async function chooseFile(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      text = await file.text();
      review();
    } catch (error) {
      preview = null;
      importError = `Could not read that file: ${String(error)}`;
    }
    input.value = '';
  }
  function cancel() {
    preview = null;
  }
  async function replace() {
    if (!preview || !(await onimport(preview))) return;
    text = '';
    preview = null;
  }
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  const dockBadgeLabels = {
    off: 'Off',
    'ready-to-merge': 'Ready to merge',
    'needs-attention': 'Needs attention',
    both: 'Both',
  };
  const summary = $derived(
    preview && [
      count(preview.trackedRepositories.length, 'tracked repository').replace(
        'repositorys',
        'repositories',
      ),
      count(preview.watchedPullRequests.length, 'watched PR'),
      count(preview.knownBots.length, 'known bot'),
      count(preview.ignoreRules.length, 'ignore rule'),
      count(preview.checkRules.length, 'non-blocking check rule'),
      count(preview.labels.length, 'label'),
      `snooze options: ${preview.settings.snoozeOptions.map(snoozeOptionLabel).join(', ') || 'none'}`,
      `refresh: ${preview.settings.automaticRefreshMinutes === 0 ? 'never' : `every ${count(preview.settings.automaticRefreshMinutes, 'minute')}`}`,
      `dock badge: ${dockBadgeLabels[preview.settings.dockBadge]}`,
      `interface size: ${preview.settings.interfaceScale}%`,
      `sidebar: ${preview.settings.sidebarCollapsed ? 'collapsed' : 'expanded'}`,
    ],
  );
</script>

<h3>Export</h3>
<p>
  Copies your saved configuration as JSON. Snoozes, individually ignored PRs and label assignments
  aren't included.
</p>
<button type="button" class="settings-action" onclick={oncopy}
  ><Copy size={13} /> Copy settings</button
>

<h3>Import</h3>
<p>Paste settings JSON or choose a file. Importing replaces your current configuration.</p>
<textarea
  class="settings-json"
  aria-label="Settings JSON"
  rows="8"
  spellcheck="false"
  {...{ autocorrect: 'off' }}
  autocapitalize="off"
  disabled={busy}
  bind:value={text}
  oninput={() => {
    preview = null;
    importError = '';
  }}></textarea>
<div class="settings-transfer-actions">
  <button type="button" disabled={busy} onclick={() => fileInput?.click()}>Choose file…</button>
  <input
    bind:this={fileInput}
    type="file"
    accept=".json,application/json"
    hidden
    aria-label="Settings file"
    onchange={chooseFile}
  />
  <button type="button" disabled={busy || !text.trim()} onclick={review}>Review import</button>
</div>
{#if importError}<p class="field-error" role="alert">{importError}</p>{/if}
{#if preview && summary}
  <div class="settings-transfer-confirm" role="region" aria-label="Confirm import">
    <p>Importing will replace your current settings with:</p>
    <ul>
      {#each summary as line}<li>{line}</li>{/each}
    </ul>
    {#if dirty}<p>Unsaved changes will be discarded.</p>{/if}
    <div class="settings-transfer-actions">
      <button type="button" class="primary-button" disabled={busy} onclick={() => void replace()}
        >Replace settings</button
      >
      <button type="button" disabled={busy} onclick={cancel}>Cancel</button>
    </div>
  </div>
{/if}
