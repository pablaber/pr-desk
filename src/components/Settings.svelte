<script lang="ts">
  import RefreshInterval from './RefreshInterval.svelte';
  import type { AppState } from '../lib/store/app-state';
  let {
    preferences,
    now,
    busy,
    onadd,
    onremove,
    onrestore,
    onrefreshinterval,
  }: {
    preferences: AppState;
    now: number;
    busy: boolean;
    onadd: (kind: 'repo' | 'pr', value: string) => Promise<boolean>;
    onremove: (kind: 'repo' | 'pr', value: string) => void;
    onrestore: (kind: 'ignored' | 'snoozed', id: string) => void;
    onrefreshinterval: (minutes: number) => Promise<void>;
  } = $props();
  let repository = $state(''),
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
    <h2>Tracked repositories</h2>
    <p>Show all open PRs from these repositories.</p>
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
    <h2>Snoozed pull requests</h2>
    <p>They return automatically when the snooze expires.</p>
    {#each Object.entries(preferences.snoozedPullRequests).filter(([, s]) => Date.parse(s.until) > now) as [id, snooze]}
      <div class="setting-row">
        <div><code>{id}</code><small>Until {new Date(snooze.until).toLocaleString()}</small></div>
        <button disabled={busy} onclick={() => onrestore('snoozed', id)}>Restore now</button>
      </div>
    {:else}<p class="empty-setting">Nothing snoozed.</p>{/each}
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
