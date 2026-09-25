<script lang="ts">
  import {
    MAX_SNOOZE_OPTIONS,
    parseSnoozeOptions,
    snoozeOptionKey,
    snoozeOptionLabel,
    type SnoozeDay,
    type SnoozeOption,
    type SnoozeUnit,
  } from '../lib/store/app-state';
  let {
    options,
    busy,
    onsave,
  }: {
    options: SnoozeOption[];
    busy: boolean;
    onsave: (value: SnoozeOption[]) => Promise<void>;
  } = $props();
  const units: SnoozeUnit[] = ['minutes', 'hours', 'days', 'weeks'];
  const days: SnoozeDay[] = [
    'tomorrow',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const dayLabel = (day: SnoozeDay) => (day === 'tomorrow' ? 'Tomorrow' : capitalize(day));
  const hourLabel = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
  const capitalize = (value: string) => value[0].toUpperCase() + value.slice(1);
  const newOption = () => ({ kind: 'duration', amount: 2, unit: 'hours' }) as const;
  const nextOption = () => ({ kind: 'next', day: 'tomorrow', hour: 9 }) as const;
  // Drafts are per row so an in-progress edit survives re-renders of the other rows. Rows are
  // always driven by the saved list: a draft array of its own would outlive a removed row.
  let drafts = $state<Record<number, SnoozeOption>>({});
  let addition = $state<SnoozeOption>(newOption());
  let validation = $state('');
  $effect(() => {
    void options;
    drafts = {};
  });
  // The add row's option is not narrowed inside the markup, so patch through these.
  const withDuration = (option: SnoozeOption, patch: { amount?: number; unit?: SnoozeUnit }) => ({
    ...(option.kind === 'duration' ? option : newOption()),
    ...patch,
  });
  const withNext = (
    option: SnoozeOption,
    patch: { day?: SnoozeDay; hour?: number },
  ): SnoozeOption => ({
    ...(option.kind === 'next' ? option : nextOption()),
    ...patch,
  });
  function changeKind(option: SnoozeOption, kind: SnoozeOption['kind']): SnoozeOption {
    if (option.kind === kind) return option;
    return kind === 'duration' ? newOption() : nextOption();
  }
  async function commit(next: SnoozeOption[]) {
    if (busy) return;
    try {
      validation = '';
      await onsave(parseSnoozeOptions(next));
    } catch (e) {
      validation = e instanceof Error ? e.message : String(e);
    }
  }
  const draftAt = (index: number, option: SnoozeOption) => drafts[index] ?? option;
  const changed = (index: number, option: SnoozeOption) =>
    snoozeOptionKey(draftAt(index, option)) !== snoozeOptionKey(option);
</script>

<div class="snooze-options">
  {#each options as option, index (index)}
    {@const draft = draftAt(index, option)}
    <div class="snooze-option-row">
      <select
        aria-label={`Snooze option ${index + 1} kind`}
        disabled={busy}
        value={draft.kind}
        onchange={(e) => (drafts[index] = changeKind(draft, e.currentTarget.value as 'duration'))}
      >
        <option value="duration">Duration</option>
        <option value="next">Next</option>
      </select>
      {#if draft.kind === 'duration'}
        <input
          type="number"
          min="1"
          max="999"
          step="1"
          aria-label={`Snooze option ${index + 1} amount`}
          disabled={busy}
          value={draft.amount}
          oninput={(e) => (drafts[index] = { ...draft, amount: e.currentTarget.valueAsNumber })}
        />
        <select
          aria-label={`Snooze option ${index + 1} unit`}
          disabled={busy}
          value={draft.unit}
          onchange={(e) =>
            (drafts[index] = { ...draft, unit: e.currentTarget.value as SnoozeUnit })}
        >
          {#each units as unit}<option value={unit}>{unit}</option>{/each}
        </select>
      {:else}
        <select
          aria-label={`Snooze option ${index + 1} day`}
          disabled={busy}
          value={draft.day}
          onchange={(e) => (drafts[index] = { ...draft, day: e.currentTarget.value as SnoozeDay })}
        >
          {#each days as day}<option value={day}>{dayLabel(day)}</option>{/each}
        </select>
        <select
          aria-label={`Snooze option ${index + 1} hour`}
          disabled={busy}
          value={draft.hour}
          onchange={(e) => (drafts[index] = { ...draft, hour: Number(e.currentTarget.value) })}
        >
          {#each hours as hour}<option value={hour}>{hourLabel(hour)}</option>{/each}
        </select>
      {/if}
      <button
        class="primary-button"
        disabled={busy || !changed(index, option)}
        onclick={() => commit(options.map((saved, i) => (i === index ? draft : saved)))}
        >Save</button
      >
      <button
        disabled={busy}
        aria-label={`Remove snooze option ${snoozeOptionLabel(option)}`}
        onclick={() => commit(options.filter((_, i) => i !== index))}>Remove</button
      >
    </div>
  {:else}
    <p class="empty-setting">
      No snooze options configured. The Snooze menu shows Custom date only.
    </p>
  {/each}
  {#if options.length < MAX_SNOOZE_OPTIONS}
    <div class="snooze-option-row add">
      <select
        aria-label="New snooze option kind"
        disabled={busy}
        value={addition.kind}
        onchange={(e) => (addition = changeKind(addition, e.currentTarget.value as 'duration'))}
      >
        <option value="duration">Duration</option>
        <option value="next">Next</option>
      </select>
      {#if addition.kind === 'duration'}
        <input
          type="number"
          min="1"
          max="999"
          step="1"
          aria-label="New snooze option amount"
          disabled={busy}
          value={addition.amount}
          oninput={(e) =>
            (addition = withDuration(addition, { amount: e.currentTarget.valueAsNumber }))}
        />
        <select
          aria-label="New snooze option unit"
          disabled={busy}
          value={addition.unit}
          onchange={(e) =>
            (addition = withDuration(addition, { unit: e.currentTarget.value as SnoozeUnit }))}
        >
          {#each units as unit}<option value={unit}>{unit}</option>{/each}
        </select>
      {:else}
        <select
          aria-label="New snooze option day"
          disabled={busy}
          value={addition.day}
          onchange={(e) =>
            (addition = withNext(addition, { day: e.currentTarget.value as SnoozeDay }))}
        >
          {#each days as day}<option value={day}>{dayLabel(day)}</option>{/each}
        </select>
        <select
          aria-label="New snooze option hour"
          disabled={busy}
          value={addition.hour}
          onchange={(e) => (addition = withNext(addition, { hour: Number(e.currentTarget.value) }))}
        >
          {#each hours as hour}<option value={hour}>{hourLabel(hour)}</option>{/each}
        </select>
      {/if}
      <button class="primary-button" disabled={busy} onclick={() => commit([...options, addition])}
        >Add snooze option</button
      >
    </div>
  {:else}
    <p class="snooze-limit">Five snooze options is the maximum. Remove one to add another.</p>
  {/if}
  {#if validation}<p class="refresh-validation" role="alert">{validation}</p>{/if}
</div>
