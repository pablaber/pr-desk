<script lang="ts">
  import { tick } from 'svelte';
  import { isWeeklyGoal, parseStreakDays } from '../lib/store/app-state';
  let {
    weeklyGoal,
    streakDays,
    busy,
    ongoal,
    onstreakdays,
  }: {
    weeklyGoal: number;
    streakDays: number[];
    busy: boolean;
    ongoal: (goal: number) => Promise<void>;
    onstreakdays: (days: number[]) => Promise<void>;
  } = $props();
  // Monday first, as the Completed page shows the week; the numbers are JS weekdays.
  const days = [
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
    { value: 0, label: 'Sun' },
  ];
  let draft = $state<number | undefined>(10);
  let goalError = $state('');
  let daysError = $state('');
  $effect(() => {
    draft = weeklyGoal;
  });
  async function commitGoal() {
    if (busy) return;
    if (!isWeeklyGoal(draft)) {
      goalError = 'Enter a whole number from 1 to 999.';
      draft = weeklyGoal;
      return;
    }
    goalError = '';
    if (draft !== weeklyGoal) await ongoal(draft);
    draft = weeklyGoal;
  }
  async function toggle(day: number, checkbox: HTMLInputElement) {
    const next = checkbox.checked ? [...streakDays, day] : streakDays.filter((d) => d !== day);
    try {
      daysError = '';
      await onstreakdays(parseStreakDays(next));
    } catch (error) {
      daysError = error instanceof Error ? error.message : String(error);
    }
    await tick();
    checkbox.checked = streakDays.includes(day);
  }
</script>

<div class="completed-settings">
  <div class="goal-setting">
    <label for="weekly-goal">Weekly goal</label>
    <div class="refresh-number">
      <input
        id="weekly-goal"
        type="number"
        min="1"
        max="999"
        step="1"
        bind:value={draft}
        disabled={busy}
        aria-describedby="weekly-goal-help"
        aria-invalid={goalError ? 'true' : undefined}
        oninput={() => (goalError = '')}
        onchange={commitGoal}
        onkeydown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      /><span>PRs a week</span>
    </div>
    <p id="weekly-goal-help" class="refresh-help">
      Default: 10. Counts every PR you ship in a Monday to Sunday week. Changes save automatically.
    </p>
    {#if goalError}<p class="refresh-validation" role="alert">{goalError}</p>{/if}
  </div>

  <fieldset class="dock-badge-control streak-days" disabled={busy}>
    <legend>Streak days</legend>
    <div class="segmented-control">
      {#each days as day (day.value)}
        <label
          ><input
            type="checkbox"
            checked={streakDays.includes(day.value)}
            onchange={(event) => toggle(day.value, event.currentTarget)}
          /><span>{day.label}</span></label
        >
      {/each}
    </div>
    <p class="refresh-help">
      Days you don't pick never break a streak, but shipping on one extends it. Pick at least one.
      Default: Monday to Friday.
    </p>
    {#if daysError}<p class="refresh-validation" role="alert">{daysError}</p>{/if}
  </fieldset>
</div>
