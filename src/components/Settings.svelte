<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import RefreshInterval from './RefreshInterval.svelte';
  import SnoozeOptions from './SnoozeOptions.svelte';
  import type { AppState, SnoozeOption, IgnoreRuleKind } from '../lib/store/app-state';
  let {
    preferences,
    busy,
    onadd,
    onremove,
    onrestore,
    onrefreshinterval,
    onsnoozeoptions,
  }: {
    preferences: AppState;
    busy: boolean;
    onadd: (kind: 'repo' | 'pr' | IgnoreRuleKind, value: string) => Promise<boolean>;
    onremove: (kind: 'repo' | 'pr' | IgnoreRuleKind, value: string) => void;
    onrestore: (kind: 'ignored' | 'snoozed', id: string) => void;
    onrefreshinterval: (minutes: number) => Promise<void>;
    onsnoozeoptions: (options: SnoozeOption[]) => Promise<void>;
  } = $props();
  let ignoreKind = $state<IgnoreRuleKind>('repository');
  const ignoreLabels = { repository: 'Repository', author: 'PR author', title: 'PR title' };
  let ignoreValue = $state(''),
    repository = $state(''),
    pr = $state('');

  // Automatic refresh is a commonly adjusted, compact setting, so it starts open; the
  // management-heavy sections start collapsed.
  let open = $state({
    refresh: true,
    snooze: false,
    tracked: false,
    ignoredRules: false,
    watched: false,
    ignoredPrs: false,
  });

  function heading(label: string, count: number): string {
    return count > 0 ? `${label} · ${count}` : label;
  }
</script>

<div class="settings">
  <header>
    <h1>Settings</h1>
    <p>Choose what belongs on your desk.</p>
  </header>
  <section class="settings-section">
    <h2>
      <button
        type="button"
        class="settings-section-toggle"
        aria-expanded={open.refresh}
        aria-controls="settings-section-refresh"
        onclick={() => (open.refresh = !open.refresh)}
        ><ChevronRight class="chevron" size={13} /> Automatic refresh</button
      >
    </h2>
    {#if open.refresh}
      <div class="settings-section-body" id="settings-section-refresh">
        <p>Refresh GitHub data while the app is running. Manual refresh is always available.</p>
        <RefreshInterval
          minutes={preferences.settings.automaticRefreshMinutes}
          {busy}
          onsave={onrefreshinterval}
        />
      </div>
    {/if}
  </section>
  <section class="settings-section">
    <h2>
      <button
        type="button"
        class="settings-section-toggle"
        aria-expanded={open.snooze}
        aria-controls="settings-section-snooze"
        onclick={() => (open.snooze = !open.snooze)}
        ><ChevronRight class="chevron" size={13} />
        {heading('Snooze options', preferences.settings.snoozeOptions.length)}</button
      >
    </h2>
    {#if open.snooze}
      <div class="settings-section-body" id="settings-section-snooze">
        <p>
          Choose up to five snooze choices for the PR card menu. Custom date is always offered and
          does not count toward the five.
        </p>
        <SnoozeOptions
          options={preferences.settings.snoozeOptions}
          {busy}
          onsave={onsnoozeoptions}
        />
      </div>
    {/if}
  </section>
  <section class="settings-section">
    <h2>
      <button
        type="button"
        class="settings-section-toggle"
        aria-expanded={open.tracked}
        aria-controls="settings-section-tracked"
        onclick={() => (open.tracked = !open.tracked)}
        ><ChevronRight class="chevron" size={13} />
        {heading('Tracked repositories', preferences.trackedRepositories.length)}</button
      >
    </h2>
    {#if open.tracked}
      <div class="settings-section-body" id="settings-section-tracked">
        <p>
          Show all open PRs from these repositories under Needs attention. Drafts stay in Waiting.
        </p>
        <form
          onsubmit={async (e) => {
            e.preventDefault();
            if (await onadd('repo', repository)) repository = '';
          }}
        >
          <input
            aria-label="Repository"
            placeholder="owner/repository"
            bind:value={repository}
            required
          /><button class="primary-button" disabled={busy}>Add repository</button>
        </form>
        {#each preferences.trackedRepositories as repo}<div class="setting-row">
            <code>{repo}</code><button disabled={busy} onclick={() => onremove('repo', repo)}
              >Remove</button
            >
          </div>{:else}<p class="empty-setting">No repositories tracked yet.</p>{/each}
      </div>
    {/if}
  </section>
  <section class="settings-section">
    <h2>
      <button
        type="button"
        class="settings-section-toggle"
        aria-expanded={open.ignoredRules}
        aria-controls="settings-section-ignored-rules"
        onclick={() => (open.ignoredRules = !open.ignoredRules)}
        ><ChevronRight class="chevron" size={13} />
        {heading('Ignored', preferences.ignoreRules.length)}</button
      >
    </h2>
    {#if open.ignoredRules}
      <div class="settings-section-body" id="settings-section-ignored-rules">
        <p>
          Hide PRs matching any rule, including your own, review requests, tracked and watched PRs.
          Remove a rule to make matching PRs eligible to appear on the next refresh.
        </p>
        <form
          onsubmit={async (e) => {
            e.preventDefault();
            if (await onadd(ignoreKind, ignoreValue)) ignoreValue = '';
          }}
        >
          <select aria-label="Ignore rule type" bind:value={ignoreKind} disabled={busy}>
            <option value="repository">Repository</option>
            <option value="author">PR author</option>
            <option value="title">PR title</option>
          </select>
          <input
            aria-label="Ignore rule"
            aria-describedby="ignore-rule-help"
            placeholder={ignoreKind === 'repository'
              ? 'acme/*'
              : ignoreKind === 'author'
                ? 'dependabot[bot]'
                : 'chore:*'}
            bind:value={ignoreValue}
            required
            disabled={busy}
          />
          <button class="primary-button" disabled={busy}>Add ignore rule</button>
        </form>
        <p id="ignore-rule-help">
          {#if ignoreKind === 'repository'}
            Use owner/repository, acme/*, */docs, or acme/service-?.
          {:else if ignoreKind === 'author'}
            Use an exact GitHub login without @, such as octocat or dependabot[bot].
          {:else}
            Use chore:* for titles starting with “chore:”, or *dependenc* for titles containing
            “dependenc”.
          {/if}
          Matching is case-insensitive.
          {#if ignoreKind !== 'author'}
            Patterns match the entire {ignoreKind === 'repository' ? 'repository name' : 'title'}: *
            matches zero or more characters; ? matches exactly one. All other characters are
            literal.
          {/if}
        </p>
        {#each preferences.ignoreRules as rule}<div class="setting-row">
            <span>{ignoreLabels[rule.kind]}: <code>{rule.value}</code></span><button
              disabled={busy}
              onclick={() => onremove(rule.kind, rule.value)}>Remove</button
            >
          </div>{:else}<p class="empty-setting">No ignore rules.</p>{/each}
      </div>
    {/if}
  </section>
  <section class="settings-section">
    <h2>
      <button
        type="button"
        class="settings-section-toggle"
        aria-expanded={open.watched}
        aria-controls="settings-section-watched"
        onclick={() => (open.watched = !open.watched)}
        ><ChevronRight class="chevron" size={13} />
        {heading('Watched pull requests', preferences.watchedPullRequests.length)}</button
      >
    </h2>
    {#if open.watched}
      <div class="settings-section-body" id="settings-section-watched">
        <p>Keep an individual PR here, even if you don’t track its repository.</p>
        <form
          onsubmit={async (e) => {
            e.preventDefault();
            if (await onadd('pr', pr)) pr = '';
          }}
        >
          <input
            aria-label="Pull request URL"
            placeholder="https://github.com/owner/repo/pull/123"
            bind:value={pr}
            required
          /><button class="primary-button" disabled={busy}>Watch PR</button>
        </form>
        {#each preferences.watchedPullRequests as id}<div class="setting-row">
            <code>{id}</code><button disabled={busy} onclick={() => onremove('pr', id)}
              >Remove</button
            >
          </div>{:else}<p class="empty-setting">No individually watched PRs.</p>{/each}
      </div>
    {/if}
  </section>
  <section class="settings-section">
    <h2>
      <button
        type="button"
        class="settings-section-toggle"
        aria-expanded={open.ignoredPrs}
        aria-controls="settings-section-ignored-prs"
        onclick={() => (open.ignoredPrs = !open.ignoredPrs)}
        ><ChevronRight class="chevron" size={13} />
        {heading(
          'Ignored pull requests',
          Object.keys(preferences.ignoredPullRequests).length,
        )}</button
      >
    </h2>
    {#if open.ignoredPrs}
      <div class="settings-section-body" id="settings-section-ignored-prs">
        <p>
          Individually ignored with Ignore PR, separate from broad rules above. Restoring a PR keeps
          any matching broad rules in effect. Closed or inaccessible PRs stay saved here.
        </p>
        {#each Object.keys(preferences.ignoredPullRequests) as id}<div class="setting-row">
            <code>{id}</code><button disabled={busy} onclick={() => onrestore('ignored', id)}
              >Restore</button
            >
          </div>{:else}<p class="empty-setting">Nothing ignored.</p>{/each}
      </div>
    {/if}
  </section>
  <p class="settings-note">
    GitHub.com · Authentication managed by gh · Preferences stored on this Mac
  </p>
</div>
