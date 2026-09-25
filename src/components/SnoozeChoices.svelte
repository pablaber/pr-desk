<script lang="ts">
  import {
    snoozeUntil,
    snoozeOptionKey,
    snoozeOptionLabel,
    type SnoozeOption,
  } from '../lib/store/app-state';
  let {
    snoozeOptions,
    now,
    busy = false,
    onselect,
  }: {
    snoozeOptions: SnoozeOption[];
    now: number;
    busy?: boolean;
    onselect: (until: string) => void;
  } = $props();
  let custom = $state('');
</script>

{#if snoozeOptions.length}<span class="menu-label">Snooze for</span>{/if}
{#each snoozeOptions as option (snoozeOptionKey(option))}
  <button disabled={busy} onclick={() => onselect(snoozeUntil(option))}
    >{snoozeOptionLabel(option)}</button
  >
{/each}
<label class="custom-label">Custom date<input type="datetime-local" bind:value={custom} /></label>
<button
  disabled={busy ||
    !custom ||
    !Number.isFinite(new Date(custom).getTime()) ||
    new Date(custom).getTime() <= now}
  onclick={() => onselect(new Date(custom).toISOString())}>Snooze until custom date</button
>
