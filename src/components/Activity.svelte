<script lang="ts">
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Info from '@lucide/svelte/icons/info';
  import {
    activityPeriod,
    axisTicks,
    heatStep,
    shiftPeriod,
    type ActivityDay,
    type ActivityView,
  } from '../lib/history/activity';
  import { historyFacts } from '../lib/history/facts';
  import type { AccountHistory } from '../lib/history/types';
  import type { AppState } from '../lib/store/app-state';
  import SegmentedChoice from './SegmentedChoice.svelte';

  let {
    account,
    login,
    preferences,
    now,
  }: {
    account: AccountHistory;
    login: string;
    preferences: Pick<AppState, 'knownBots' | 'ignoreRules'>;
    now: number;
  } = $props();

  let view = $state<ActivityView>('week');
  // Null follows the current period as the clock moves on.
  let anchor = $state<number | null>(null);
  let facts = $derived(historyFacts(account, login, preferences));
  let period = $derived(activityPeriod(facts, view, anchor ?? now, now));
  let ticks = $derived(
    axisTicks(Math.max(...period.days.map((d) => Math.max(d.authored, d.mergedByYou, d.approved)))),
  );
  let top = $derived(ticks[ticks.length - 1]);
  let current = $derived(!period.canNext);

  const date = (time: number, options: Intl.DateTimeFormatOptions) =>
    new Date(time).toLocaleDateString([], options);
  let label = $derived.by(() => {
    if (view === 'month') return date(period.start, { month: 'long', year: 'numeric' });
    const last = period.days[period.days.length - 1].start;
    const sameMonth = new Date(period.start).getMonth() === new Date(last).getMonth();
    return `${date(period.start, { month: 'short', day: 'numeric' })} – ${date(
      last,
      sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' },
    )}`;
  });
  let deltaText = $derived.by(() => {
    if (period.delta === null) return null;
    const amount =
      period.delta > 0 ? `+${period.delta}` : period.delta < 0 ? `−${-period.delta}` : 'No change';
    return `${amount} vs ${current ? `last ${view}, same point` : `the ${view} before`}`;
  });

  const plural = (count: number, text: string) => `${count} ${text}`;
  const series = [
    { key: 'authored', name: 'authored', text: 'of your PRs merged' },
    { key: 'mergedByYou', name: 'merged-by-you', text: 'merged by you' },
    { key: 'approved', name: 'approved', text: 'approved' },
  ] as const;

  const dayName = (day: ActivityDay) =>
    date(day.start, { weekday: 'long', month: 'short', day: 'numeric' });
  const dayLabel = (day: ActivityDay) =>
    day.tracked
      ? `${dayName(day)}: ${series.map((s) => plural(day[s.key], s.text)).join(', ')}`
      : `${dayName(day)}: no data`;

  function show(next: ActivityView) {
    view = next;
  }
  function move(by: number) {
    anchor = shiftPeriod(view, period.start, by);
  }
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
</script>

{#snippet tip(day: ActivityDay)}
  <span class="activity-tip" aria-hidden="true">
    <strong>{dayName(day)}</strong>
    {#each series as s (s.key)}
      <span class="activity-tip-row"
        ><i class={`activity-key ${s.name}`}></i>{plural(day[s.key], s.text)}</span
      >
    {/each}
  </span>
{/snippet}

<section class="completed-panel activity" aria-label="Activity">
  <div class="completed-panel-head">
    <h2>Activity</h2>
    <div class="activity-controls">
      <div class="activity-period">
        <button
          class="quiet"
          aria-label={`Previous ${view}`}
          disabled={!period.canPrevious}
          onclick={() => move(-1)}><ChevronLeft size={14} /></button
        >
        <span aria-live="polite">{label}</span>
        <button
          class="quiet"
          aria-label={`Next ${view}`}
          disabled={!period.canNext}
          onclick={() => move(1)}><ChevronRight size={14} /></button
        >
      </div>
      <div role="group" aria-label="Activity period">
        <SegmentedChoice
          name="activity-view"
          value={view}
          options={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
          onchange={show}
        />
      </div>
    </div>
  </div>

  <div class="activity-totals">
    {#each series as s (s.key)}
      <span class="activity-total"
        ><i class={`activity-key ${s.name}`}></i><b>{period.totals[s.key]}</b> {s.text}</span
      >
    {/each}
    {#if deltaText}
      <span
        class="activity-delta"
        class:up={period.delta! > 0}
        class:down={period.delta! < 0}
        title="Change in PRs shipped, each counted once">{deltaText}</span
      >
    {/if}
  </div>

  {#if view === 'week'}
    <div class="activity-week">
      <div class="activity-plot">
        {#each ticks as tick (tick)}
          <div
            class="activity-grid"
            class:base={tick === 0}
            style:bottom={`${(tick / top) * 100}%`}
          >
            <span>{tick}</span>
          </div>
        {/each}
        <div class="activity-columns">
          {#each period.days as day, i (day.start)}
            <div class="activity-day" class:flip={i >= 4} role="img" aria-label={dayLabel(day)}>
              {#if day.tracked}
                {#each series as s (s.key)}
                  <i class={`activity-bar ${s.name}`} style:height={`${(day[s.key] / top) * 100}%`}
                  ></i>
                {/each}
                {@render tip(day)}
              {:else}
                <span class="activity-none">–</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
      <div class="activity-labels" aria-hidden="true">
        {#each period.days as day, i (day.start)}
          <span class:today={day.today}
            >{day.today ? 'Today' : `${weekdays[i]} ${new Date(day.start).getDate()}`}</span
          >
        {/each}
      </div>
    </div>
  {:else}
    <div class="activity-month">
      <div class="activity-calendar">
        {#each weekdays as name (name)}<span class="activity-dow">{name}</span>{/each}
        {#each { length: period.lead } as _, i (i)}<span></span>{/each}
        {#each period.days as day, i (day.start)}
          <div
            class={`activity-cell heat-${heatStep(day.shipped)}`}
            class:untracked={!day.tracked}
            class:today={day.today}
            class:flip={(period.lead + i) % 7 >= 4}
            role="img"
            aria-label={dayLabel(day)}
          >
            <span class="activity-date">{new Date(day.start).getDate()}</span>
            {#if day.tracked}
              <span class="activity-count">{day.shipped || ''}</span>
              {@render tip(day)}
            {/if}
          </div>
        {/each}
      </div>
      <div class="activity-legend">
        <span>Each day counts every PR once, even if it was yours and you merged it</span>
        <span class="activity-ramp" aria-hidden="true"
          >Less
          {#each [0, 1, 2, 3, 4] as step (step)}<i class={`heat-${step}`}></i>{/each}
          More</span
        >
      </div>
    </div>
  {/if}

  <p class="activity-note">
    <Info size={13} />
    <span
      >GitHub search can't filter by who merged a PR, so “merged by you” only sees PRs you wrote,
      reviewed or were asked to review, PRs in tracked repositories, and merges done in PR Desk.</span
    >
  </p>
</section>
