<script lang="ts">
  import SegmentedChoice from './SegmentedChoice.svelte';
  import type { DockBadgeMode } from '../lib/store/app-state';
  let {
    mode,
    busy,
    onsave,
  }: { mode: DockBadgeMode; busy: boolean; onsave: (value: DockBadgeMode) => Promise<void> } =
    $props();
  const options: { value: DockBadgeMode; label: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'ready-to-merge', label: 'Ready to merge' },
    { value: 'needs-attention', label: 'Needs attention' },
    { value: 'both', label: 'Both' },
  ];
</script>

<fieldset class="dock-badge-control" disabled={busy}>
  <legend>Dock badge count</legend>
  <SegmentedChoice name="dock-badge" value={mode} {options} onchange={onsave} />
  <p class="refresh-help">Default: Both. Changes save automatically.</p>
</fieldset>
