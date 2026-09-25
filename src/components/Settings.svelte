<script lang="ts">
  import RefreshInterval from './RefreshInterval.svelte';
  import SnoozeOptions from './SnoozeOptions.svelte';
  import type { AppState, SnoozeOption } from '../lib/store/app-state';
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
    onadd: (kind: 'repo' | 'pr' | 'ignored-repo', value: string) => Promise<boolean>;
    onremove: (kind: 'repo' | 'pr' | 'ignored-repo', value: string) => void;
    onrestore: (kind: 'ignored' | 'snoozed', id: string) => void;
    onrefreshinterval: (minutes: number) => Promise<void>;
    onsnoozeoptions: (options: SnoozeOption[]) => Promise<void>;
  } = $props();
  let ignoredRepository = $state(''),
    repository = $state(''),
    pr = $state('');

  // Automatic refresh is a commonly adjusted, compact setting, so it starts open; the
  // management-heavy sections start collapsed.
  let open = $state({
    refresh: true,
    snooze: false,
    tracked: false,
    ignoredRepos: false,
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
        ><span class="chevron" aria-hidden="true">▸</span> Automatic refresh</button
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
        ><span class="chevron" aria-hidden="true">▸</span>
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
        ><span class="chevron" aria-hidden="true">▸</span>
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
        aria-expanded={open.ignoredRepos}
        aria-controls="settings-section-ignored-repos"
        onclick={() => (open.ignoredRepos = !open.ignoredRepos)}
        ><span class="chevron" aria-hidden="true">▸</span>
        {heading('Ignored repositories', preferences.ignoredRepositories.length)}</button
      >
    </h2>
    {#if open.ignoredRepos}
      <div class="settings-section-body" id="settings-section-ignored-repos">
        <p>
          Hide all PRs from these repositories, including your own, review requests, tracked and
          watched PRs. Remove a repository here to show its PRs again.
        </p>
        <form
          onsubmit={async (e) => {
            e.preventDefault();
            if (await onadd('ignored-repo', ignoredRepository)) ignoredRepository = '';
          }}
        >
          <input
            aria-label="Ignored repository"
            placeholder="owner/repository"
            bind:value={ignoredRepository}
            required
          />
          <button class="primary-button" disabled={busy}>Ignore repository</button>
        </form>
        {#each preferences.ignoredRepositories as repo}<div class="setting-row">
            <code>{repo}</code><button
              disabled={busy}
              onclick={() => onremove('ignored-repo', repo)}>Remove</button
            >
          </div>{:else}<p class="empty-setting">No repositories ignored.</p>{/each}
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
        ><span class="chevron" aria-hidden="true">▸</span>
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
        ><span class="chevron" aria-hidden="true">▸</span>
        {heading(
          'Ignored pull requests',
          Object.keys(preferences.ignoredPullRequests).length,
        )}</button
      >
    </h2>
    {#if open.ignoredPrs}
      <div class="settings-section-body" id="settings-section-ignored-prs">
        <p>Hidden until you restore them. Closed or inaccessible PRs stay saved here.</p>
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
