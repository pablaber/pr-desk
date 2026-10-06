<script lang="ts">
  import SegmentedChoice from './SegmentedChoice.svelte';
  import type { InterfaceScale } from '../lib/store/app-state';
  let {
    scale,
    busy,
    onsave,
  }: { scale: InterfaceScale; busy: boolean; onsave: (value: InterfaceScale) => Promise<void> } =
    $props();
  const options: { value: InterfaceScale; label: string }[] = [
    { value: 90, label: 'Small (90%)' },
    { value: 100, label: 'Default (100%)' },
    { value: 115, label: 'Large (115%)' },
    { value: 130, label: 'Larger (130%)' },
  ];
</script>

<fieldset class="dock-badge-control" disabled={busy}>
  <legend>Interface size</legend>
  <SegmentedChoice name="interface-scale" value={scale} {options} onchange={onsave} />
  <p class="refresh-help">
    Default: Default. Changes save automatically. Cmd + / Cmd − / Cmd 0 also adjust it.
  </p>
</fieldset>
