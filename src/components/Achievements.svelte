<script lang="ts">
  import Info from '@lucide/svelte/icons/info';
  import Lock from '@lucide/svelte/icons/lock';
  import type { AchievementEvaluation } from '../lib/achievements/evaluate';
  import { achievementProgress, romanNumeral, shortDate } from '../lib/achievements/format';

  let {
    evaluation,
    trackingSince,
  }: {
    evaluation: AchievementEvaluation;
    trackingSince: number;
  } = $props();

  let since = $derived(
    new Date(trackingSince).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
  );
</script>

<section class="completed-panel achievements" aria-label="Achievements">
  <div class="completed-panel-head">
    <div>
      <h2>Achievements</h2>
      <p class="completed-panel-sub">Earned from activity since tracking began on {since}</p>
    </div>
    <span class="achievements-total">
      {evaluation.unlocked} of {evaluation.total} levels unlocked
    </span>
  </div>
  <div class="achievement-grid">
    {#each evaluation.views as view (view.achievement.id)}
      {@const Icon = view.achievement.icon}
      <article
        class="achievement"
        class:locked={view.level === 0}
        aria-label={view.achievement.title}
      >
        <span class="achievement-medal">
          {#if view.level > 0}<Icon size={19} />{:else}<Lock size={15} />{/if}
          {#if view.level > 0 && view.pips.length > 1}
            <span class="achievement-level" role="img" aria-label={`Level ${view.level}`}
              >{romanNumeral(view.level)}</span
            >
          {/if}
        </span>
        <div class="achievement-body">
          <div class="achievement-top">
            <h3>{view.achievement.title}</h3>
            <span class="achievement-progress">{achievementProgress(view)}</span>
          </div>
          <p class="achievement-description">{view.achievement.description}</p>
          {#if view.note}
            <p class="achievement-note"><Info size={11} /> {view.note}</p>
          {/if}
          {#if view.pips.length > 1}
            <div class="achievement-pips" aria-hidden="true">
              {#each view.pips as pip (pip.threshold)}
                <span class:done={pip.unlocked}><i style:width={`${pip.fill * 100}%`}></i></span>
              {/each}
            </div>
            <ol class="achievement-tiers">
              {#each view.pips as pip (pip.threshold)}
                <li
                  class:done={pip.unlocked}
                  title={pip.at === null ? null : `Unlocked ${shortDate(pip.at)}`}
                >
                  {pip.threshold}
                </li>
              {/each}
            </ol>
          {/if}
        </div>
      </article>
    {/each}
  </div>
</section>
