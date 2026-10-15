<script lang="ts">
  import CalendarCheck from '@lucide/svelte/icons/calendar-check';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import Flame from '@lucide/svelte/icons/flame';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Target from '@lucide/svelte/icons/target';
  import Trophy from '@lucide/svelte/icons/trophy';
  import Zap from '@lucide/svelte/icons/zap';
  import type { ActivityDay } from '../lib/history/activity';
  import { formatDuration, weekRange } from '../lib/history/format';
  import { weekSummary } from '../lib/history/stats';
  import type { HistoryFacts } from '../lib/history/facts';

  let {
    facts,
    goal,
    streakDays,
    now,
    onedit,
    onopen,
  }: {
    facts: HistoryFacts;
    goal: number;
    streakDays: number[];
    now: number;
    onedit: () => void;
    onopen: (url: string) => void;
  } = $props();

  let week = $derived(weekSummary(facts, goal, streakDays, now));
  let records = $derived(week.records);
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const date = (time: number, options: Intl.DateTimeFormatOptions) =>
    new Date(time).toLocaleDateString([], options);
  let since = $derived(
    week.firstRun
      ? 'today'
      : date(facts.trackingSince, { month: 'short', day: 'numeric', year: 'numeric' }),
  );
  let status = $derived(
    [
      week.remaining === 0 ? 'Goal reached' : `${week.remaining} more by Sunday to hit your goal`,
      week.lastWeek === null ? null : `last week ${week.lastWeek}`,
    ]
      .filter(Boolean)
      .join(' · '),
  );
  function dayLabel(day: ActivityDay) {
    const name = date(day.start, { weekday: 'long', month: 'short', day: 'numeric' });
    return day.tracked ? `${name}: ${day.shipped} shipped` : `${name}: no data`;
  }
</script>

<section class="completed-panel this-week" aria-label="This week">
  <div class="completed-panel-head">
    <div>
      <h2>This week</h2>
      <p class="completed-panel-sub">
        {weekRange(week.days[0].start)} · your PRs merged plus PRs you merged or approved, each counted
        once
      </p>
    </div>
    <div class="this-week-actions">
      <span class="tracking-since"><CalendarClock size={13} /> Tracking since {since}</span>
      <button class="quiet" onclick={onedit}><Target size={13} /> Edit goal</button>
    </div>
  </div>

  {#if week.firstRun}
    <div class="first-run-notice" role="status">
      <Sparkles size={16} />
      <div>
        <b>Your history starts today.</b> PR Desk now keeps a record of every pull request you ship. Streaks,
        records and achievements build from here. Merges from before today don't count.
      </div>
    </div>
  {/if}

  <div class="goal-grid">
    <div class="goal-card">
      <div class="goal-top">
        <div class="goal-count"><b>{week.shipped}</b> <small>of {week.goal} merged</small></div>
        <span class="goal-streak" class:idle={week.streak === 0}
          ><Flame size={13} />
          <span
            >{#if week.streak === 0}No streak yet{:else}<b>{week.streak}</b>-day streak{/if}</span
          ></span
        >
      </div>
      <div
        class="goal-meter"
        role="meter"
        aria-label="Weekly goal"
        aria-valuemin={0}
        aria-valuemax={week.goal}
        aria-valuenow={Math.min(week.shipped, week.goal)}
      >
        <i style:width={`${Math.min(100, (week.shipped / week.goal) * 100)}%`}></i>
      </div>
      <div class="goal-week">
        {#each week.days as day, i (day.start)}
          <div>
            <div
              class="goal-day"
              class:done={day.tracked && day.shipped > 0}
              class:today={day.today}
              class:untracked={!day.tracked}
              role="img"
              aria-label={dayLabel(day)}
            >
              {day.tracked ? day.shipped : '–'}
            </div>
            <span>{weekdays[i]}</span>
          </div>
        {/each}
      </div>
      <p class="goal-status">{status}</p>
    </div>

    <div class="goal-card" role="group" aria-label="Personal records">
      <h3>Personal records</h3>
      {#if week.firstRun}
        <p class="empty-note">
          Records start filling in as you merge. Nothing from before today counts.
        </p>
      {:else}
        <dl class="records">
          <div class="record">
            <dt><Trophy size={13} /> Most in a day</dt>
            <dd>
              {#if records.day}<b>{records.day.count}</b>
                <em>{date(records.day.start, { month: 'short', day: 'numeric' })}</em>{:else}–{/if}
            </dd>
          </div>
          <div class="record">
            <dt><CalendarCheck size={13} /> Most in a week</dt>
            <dd>
              {#if records.week}<b>{records.week.count}</b>
                <em>{weekRange(records.week.start)}</em>{:else}–{/if}
            </dd>
          </div>
          <div class="record">
            <dt><Flame size={13} /> Longest streak</dt>
            <dd>
              {#if records.streak > 0}<b>{records.streak} days</b>{:else}–{/if}
            </dd>
          </div>
          <div class="record">
            <dt><Zap size={13} /> Fastest merge</dt>
            <dd>
              {#if records.fastest}<b>{formatDuration(records.fastest.duration)}</b>
                <button
                  class="record-link"
                  aria-label={`Open ${records.fastest.fact.title} on GitHub`}
                  onclick={() => onopen(records.fastest!.fact.url)}
                  >{records.fastest.fact.id.replace('#', ' #')}</button
                >{:else}–{/if}
            </dd>
          </div>
        </dl>
      {/if}
    </div>
  </div>
</section>
