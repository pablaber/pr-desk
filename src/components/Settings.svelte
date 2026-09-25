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
</script>

<div class="settings">
  <header>
    <h1>Settings</h1>
    <p>Choose what belongs on your desk.</p>
  </header>
  <section class="settings-section">
    <h2>Automatic refresh</h2>
    <p>Refresh GitHub data while the app is running. Manual refresh is always available.</p>
    <RefreshInterval
      minutes={preferences.settings.automaticRefreshMinutes}
      {busy}
      onsave={onrefreshinterval}
    />
  </section>
  <section class="settings-section">
    <h2>Snooze options</h2>
    <p>
      Choose up to five snooze choices for the PR card menu. Custom date is always offered and does
      not count toward the five.
    </p>
    <SnoozeOptions options={preferences.settings.snoozeOptions} {busy} onsave={onsnoozeoptions} />
  </section>
  <section class="settings-section">
    <h2>Tracked repositories</h2>
    <p>Show all open PRs from these repositories under Needs attention. Drafts stay in Waiting.</p>
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
  </section>
  <section class="settings-section">
    <h2>Ignored repositories</h2>
    <p>
      Hide all PRs from these repositories, including your own, review requests, tracked and watched
      PRs. Remove a repository here to show its PRs again.
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
        <code>{repo}</code><button disabled={busy} onclick={() => onremove('ignored-repo', repo)}
          >Remove</button
        >
      </div>{:else}<p class="empty-setting">No repositories ignored.</p>{/each}
  </section>
  <section class="settings-section">
    <h2>Watched pull requests</h2>
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
        <code>{id}</code><button disabled={busy} onclick={() => onremove('pr', id)}>Remove</button>
      </div>{:else}<p class="empty-setting">No individually watched PRs.</p>{/each}
  </section>
  <section class="settings-section">
    <h2>Ignored pull requests</h2>
    <p>Hidden until you restore them. Closed or inaccessible PRs stay saved here.</p>
    {#each Object.keys(preferences.ignoredPullRequests) as id}<div class="setting-row">
        <code>{id}</code><button disabled={busy} onclick={() => onrestore('ignored', id)}
          >Restore</button
        >
      </div>{:else}<p class="empty-setting">Nothing ignored.</p>{/each}
  </section>
  <p class="settings-note">
    GitHub.com · Authentication managed by gh · Preferences stored on this Mac
  </p>
</div>
