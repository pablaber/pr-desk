<script lang="ts">
  import { onMount } from 'svelte';
  import { isTauri } from '@tauri-apps/api/core';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { version } from '../package.json';
  // The app's CSP blocks data URLs, so keep the logo as a bundled file.
  import appIcon from '../src-tauri/icons/source.svg?no-inline';
  import PRCard from './components/PRCard.svelte';
  import Settings from './components/Settings.svelte';
  import { GhGitHubService } from './lib/github/client';
  import { refreshDashboard, type DashboardSnapshot } from './lib/github/refresh';
  import {
    defaultState,
    loadState,
    saveState,
    parseRepository,
    parsePullRequest,
    isRefreshInterval,
    type AppState,
  } from './lib/store/app-state';
  import { classify, sortPullRequests } from './lib/pr/classify';
  import { hotkeyFor, resolveHotkey } from './lib/hotkeys/match';
  import type { DashboardState, TrackingReason } from './lib/pr/types';
  const service = new GhGitHubService();
  let preferences = $state<AppState>(defaultState());
  let snapshot = $state<DashboardSnapshot>({ prs: [], sources: {}, warnings: [], staleIds: [] });
  let login = $state(''),
    screen = $state<'dashboard' | 'settings'>('dashboard');
  let filter = $state<TrackingReason | 'all'>('all'),
    loading = $state(false),
    saving = $state(false),
    initialized = $state(false);
  let error = $state(''),
    setupError = $state(''),
    now = $state(Date.now()),
    refreshed = $state('');
  const dashboardHotkey = hotkeyFor('open-dashboard');
  const settingsHotkey = hotkeyFor('open-settings');
  const columns: { state: DashboardState; title: string; subtitle: string }[] = [
    { state: 'ready-to-merge', title: 'Ready to merge', subtitle: 'The finish line' },
    { state: 'needs-attention', title: 'Needs attention', subtitle: 'Your next move' },
    { state: 'waiting', title: 'Waiting', subtitle: 'On your radar' },
  ];
  const filters: { value: TrackingReason | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'owned', label: 'Mine' },
    { value: 'direct-review-request', label: 'Review requests' },
    { value: 'tracked-repository', label: 'Tracked repos' },
    { value: 'watched', label: 'Watching' },
  ];
  let classified = $derived(
    snapshot.prs
      .map((pr) => classify(pr, login, preferences, now))
      .filter((p) => p !== null)
      .sort(sortPullRequests),
  );
  let visible = $derived(
    classified.filter((p) => filter === 'all' || p.pr.reasons.includes(filter)),
  );
  let snoozed = $derived(
    Object.values(preferences.snoozedPullRequests).filter((s) => Date.parse(s.until) > now).length,
  );
  onMount(() => {
    void start();
    const timer = setInterval(() => (now = Date.now()), 15000);
    return () => clearInterval(timer);
  });
  $effect(() => {
    const minutes = preferences.settings.automaticRefreshMinutes;
    if (!initialized || loading || saving || minutes === 0) return;
    // Reschedule after each refresh/save and cancel when settings change or the app unmounts.
    const timer = setTimeout(() => void refresh(), minutes * 60_000);
    return () => clearTimeout(timer);
  });
  async function setRefreshInterval(minutes: number) {
    if (!isRefreshInterval(minutes)) return;
    await change((next) => {
      next.settings.automaticRefreshMinutes = minutes;
    });
  }
  async function start() {
    if (loading) return;
    setupError = '';
    loading = true;
    try {
      if (!isTauri())
        throw new Error(
          'Open PR Desk as a desktop app with npm run tauri dev. GitHub CLI and local preferences are available in the native app.',
        );
      preferences = await loadState();
      await service.authenticate();
      login = await service.getCurrentUser();
      initialized = true;
    } catch (e) {
      setupError = String(e);
    } finally {
      loading = false;
    }
    if (initialized) await refresh();
  }
  async function refresh() {
    if (loading || saving) return;
    loading = true;
    error = '';
    try {
      snapshot = await refreshDashboard(service, preferences, snapshot);
      now = Date.now();
      refreshed = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }
  async function persist(next: AppState) {
    await saveState(next);
    preferences = next;
  }
  async function change(update: (next: AppState) => void) {
    if (saving) return;
    saving = true;
    error = '';
    try {
      const next = structuredClone($state.snapshot(preferences));
      update(next);
      await persist(next);
    } catch (e) {
      error = `Could not save preferences: ${String(e)}`;
    } finally {
      saving = false;
    }
  }
  async function add(kind: 'repo' | 'pr' | 'ignored-repo', value: string): Promise<boolean> {
    if (saving || loading) return false;
    saving = true;
    error = '';
    try {
      const next = structuredClone($state.snapshot(preferences));
      if (kind === 'ignored-repo') {
        const repo = parseRepository(value);
        next.ignoredRepositories = [...new Set([...next.ignoredRepositories, repo])];
      } else if (kind === 'repo') {
        const repo = parseRepository(value);
        await service.validateRepository(repo);
        next.trackedRepositories = [...new Set([...next.trackedRepositories, repo])];
      } else {
        const id = parsePullRequest(value);
        const pr = await service.getPullRequest(id);
        if (pr.state !== 'OPEN')
          throw new Error('This PR is closed or merged. Watch an open PR instead.');
        next.watchedPullRequests = [...new Set([...next.watchedPullRequests, pr.id])];
      }
      await persist(next);
      saving = false;
      await refresh();
      return true;
    } catch (e) {
      error = String(e);
      return false;
    } finally {
      saving = false;
    }
  }
  async function remove(kind: 'repo' | 'pr' | 'ignored-repo', value: string) {
    await change((next) => {
      if (kind === 'ignored-repo')
        next.ignoredRepositories = next.ignoredRepositories.filter((r) => r !== value);
      else if (kind === 'repo')
        next.trackedRepositories = next.trackedRepositories.filter((r) => r !== value);
      else next.watchedPullRequests = next.watchedPullRequests.filter((p) => p !== value);
    });
    await refresh();
  }
  async function action(id: string, action: string, until?: string) {
    await change((next) => {
      if (action === 'watch')
        next.watchedPullRequests = [...new Set([...next.watchedPullRequests, id])];
      if (action === 'unwatch')
        next.watchedPullRequests = next.watchedPullRequests.filter((p) => p !== id);
      if (action === 'ignore')
        next.ignoredPullRequests[id] = { ignoredAt: new Date().toISOString() };
      if (action === 'snooze' && until && Date.parse(until) > Date.now())
        next.snoozedPullRequests[id] = { until };
    });
    if (action === 'watch' || action === 'unwatch') await refresh();
  }
  async function restore(kind: 'ignored' | 'snoozed', id: string) {
    await change((next) => {
      if (kind === 'ignored') delete next.ignoredPullRequests[id];
      else delete next.snoozedPullRequests[id];
    });
    await refresh();
  }
  function handleHotkey(event: KeyboardEvent) {
    const hotkey = resolveHotkey(event, event.target as HTMLElement | null);
    if (!hotkey) return;
    event.preventDefault();
    if (hotkey.action === 'open-dashboard') screen = 'dashboard';
    else if (hotkey.action === 'open-settings') screen = 'settings';
  }
  async function open(url: string) {
    try {
      await openUrl(url);
    } catch (e) {
      error = `Could not open GitHub: ${String(e)}`;
    }
  }
</script>

<svelte:head><title>PR Desk</title></svelte:head>
<svelte:window onkeydown={handleHotkey} />
<div class="app-shell">
  <aside>
    <div class="brand">
      <img class="brand-mark" src={appIcon} alt="" width="32" height="32" />
      <span>PR Desk</span>
    </div>
    <div class="nav-label">WORKSPACE</div>
    <nav aria-label="Main navigation">
      <button class:active={screen === 'dashboard'} onclick={() => (screen = 'dashboard')}
        ><span aria-hidden="true">▦</span> Dashboard
        <span class="nav-count">{classified.length}</span>{#if dashboardHotkey}<span
            class="nav-hotkey"
            aria-hidden="true">{dashboardHotkey.label}</span
          >{/if}</button
      >
      <button class:active={screen === 'settings'} onclick={() => (screen = 'settings')}
        ><span aria-hidden="true">⚙</span> Settings{#if settingsHotkey}<span
            class="nav-hotkey"
            aria-hidden="true">{settingsHotkey.label}</span
          >{/if}</button
      >
    </nav>
    <div class="sidebar-bottom">
      <span class="connection-dot" class:connected={initialized}></span>{login
        ? `@${login}`
        : 'GitHub CLI'}<small>One place for your pull requests.</small>
      <span class="version">v{version}</span>
    </div>
  </aside>
  <main>
    <div class="toolbar">
      <span>{screen === 'dashboard' ? 'Workspace / Dashboard' : 'Workspace / Settings'}</span>
      <div>
        {#if refreshed}<span class="refresh-time">Updated {refreshed}</span>{/if}<button
          disabled={loading || saving}
          onclick={() => (initialized ? refresh() : start())}
          >{loading ? '↻ Refreshing…' : '↻ Refresh'}</button
        >
      </div>
    </div>
    {#if error}<div class="alert" role="alert">
        {error}<button onclick={() => (error = '')} aria-label="Dismiss error">×</button>
      </div>{/if}
    {#if !initialized}
      <div class="setup">
        <span class="setup-symbol">⑂</span>
        <h1>Your pull requests, in focus.</h1>
        <p>PR Desk uses your existing GitHub CLI sign-in.</p>
        {#if setupError}<div class="alert" role="alert">{setupError}</div>
          <button class="primary-button" onclick={start} disabled={loading}>Try again</button
          >{:else}<p>Connecting to GitHub…</p>{/if}
      </div>
    {:else if screen === 'settings'}
      <Settings
        {preferences}
        {now}
        busy={saving || loading}
        onadd={add}
        onremove={remove}
        onrestore={restore}
        onrefreshinterval={setRefreshInterval}
      />
    {:else}
      <div class="dashboard-heading">
        <div>
          <div class="eyebrow">YOUR WORK, AT A GLANCE</div>
          <h1>Pull requests</h1>
          <p>What needs you. What’s ready. What can wait.</p>
        </div>
        <button class="quiet" onclick={() => (screen = 'settings')}
          >◷ Snoozed <span class="pill">{snoozed}</span></button
        >
      </div>
      <div class="summary">
        {#each columns as col}<span
            ><i class={col.state}></i><b>{visible.filter((p) => p.state === col.state).length}</b>
            {col.title}</span
          >{/each}
      </div>
      <div class="filters" aria-label="Filter by source">
        {#each filters as f}<button
            class:selected={filter === f.value}
            aria-pressed={filter === f.value}
            onclick={() => (filter = f.value)}>{f.label}</button
          >{/each}<span class="result-count"
          >{visible.length} pull request{visible.length === 1 ? '' : 's'}</span
        >
      </div>
      {#if snapshot.warnings.length}<details class="alert">
          <summary
            >{snapshot.warnings.length} refresh issue{snapshot.warnings.length === 1 ? '' : 's'} · available
            results shown</summary
          >{#each snapshot.warnings as warning}<p>{warning}</p>{/each}
        </details>{/if}
      <div class="board" aria-busy={loading}>
        {#each columns as col}
          <section class="column">
            <header>
              <div>
                <i class={col.state}></i>
                <h2>{col.title}</h2>
                <span class="column-count"
                  >{visible.filter((p) => p.state === col.state).length}</span
                >
              </div>
              <p>{col.subtitle}</p>
            </header>
            <div class="card-list">
              {#each visible.filter((p) => p.state === col.state) as item (item.pr.id)}<PRCard
                  {item}
                  {now}
                  busy={saving || loading}
                  stale={snapshot.staleIds.includes(item.pr.id)}
                  watching={preferences.watchedPullRequests.includes(item.pr.id)}
                  onopen={open}
                  onaction={action}
                />{:else}<div class="empty-column">
                  <span
                    >{col.state === 'ready-to-merge'
                      ? '✓'
                      : col.state === 'needs-attention'
                        ? '☑'
                        : '◷'}</span
                  >
                  <p>
                    {loading
                      ? 'Loading pull requests…'
                      : col.state === 'needs-attention'
                        ? 'All clear here'
                        : 'Nothing here yet'}
                  </p>
                  <small
                    >{filter !== 'all'
                      ? 'Try another source filter.'
                      : col.state === 'waiting'
                        ? 'Track a repository or watch a PR in Settings.'
                        : 'PRs will appear as their status changes.'}</small
                  >
                </div>{/each}
            </div>
          </section>
        {/each}
      </div>
      <footer>
        <span>↗ Select a pull request to open it on GitHub</span><span
          >Only direct review requests need your attention</span
        >
      </footer>
    {/if}
  </main>
</div>
