<script lang="ts">
  let {
    minutes,
    busy,
    onsave,
  }: { minutes: number; busy: boolean; onsave: (value: number) => Promise<void> } = $props();
  let draft = $state<number | undefined>(5);
  let validation = $state('');
  $effect(() => {
    if (minutes > 0) draft = minutes;
  });
  async function commit() {
    if (busy || minutes === 0) return;
    if (draft === undefined || !Number.isInteger(draft) || draft < 1 || draft > 60) {
      validation = 'Enter a whole number from 1 to 60.';
      draft = minutes;
      return;
    }
    validation = '';
    await onsave(draft);
    draft = minutes;
  }
</script>

<div class="refresh-control">
  <div class="refresh-control-heading">
    <span id="refresh-label">Refresh interval</span>
    <label class="never-option"
      ><input
        type="checkbox"
        checked={minutes === 0}
        disabled={busy}
        onchange={async (event) => {
          const checkbox = event.currentTarget;
          validation = '';
          await onsave(checkbox.checked ? 0 : (draft ?? 5));
          checkbox.checked = minutes === 0;
        }}
      /> Never</label
    >
  </div>
  <div class="refresh-inputs" class:inactive={minutes === 0}>
    <div class="refresh-slider">
      <input
        type="range"
        min="1"
        max="60"
        step="1"
        bind:value={draft}
        aria-labelledby="refresh-label"
        aria-valuetext={`${draft ?? minutes} minutes`}
        disabled={busy || minutes === 0}
        onchange={commit}
      />
      <div class="slider-limits" aria-hidden="true"><span>1 min</span><span>1 hour</span></div>
    </div>
    <label class="refresh-number"
      ><input
        type="number"
        aria-label="Refresh interval in minutes"
        min="1"
        max="60"
        step="1"
        bind:value={draft}
        disabled={busy || minutes === 0}
        aria-describedby="refresh-help"
        aria-invalid={validation ? 'true' : undefined}
        oninput={() => (validation = '')}
        onchange={commit}
        onkeydown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      /><span>minutes</span></label
    >
  </div>
  <p id="refresh-help" class="refresh-help">
    {minutes === 0
      ? 'Automatic refresh is off. You can still refresh manually.'
      : 'Default: 5 minutes. Changes save automatically.'}
  </p>
  {#if validation}<p class="refresh-validation" role="alert">{validation}</p>{/if}
</div>
