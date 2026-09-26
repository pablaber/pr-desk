<script lang="ts">
  import { onMount } from 'svelte';
  import { isTauri } from '@tauri-apps/api/core';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { version } from '../package.json';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import Clock from '@lucide/svelte/icons/clock';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import SettingsIcon from '@lucide/svelte/icons/settings';
  import X from '@lucide/svelte/icons/x';
  // The app's CSP blocks data URLs, so keep the logo as a bundled file.
  import appIcon from '../src-tauri/icons/source.svg?no-inline';
  import CloseStale from './components/CloseStale.svelte';
  import { stalenessLevel } from './lib/pr/card-view-model';
  import type { PullRequest } from './lib/pr/types';
  import PRCard from './components/PRCard.svelte';
  import Ignored from './components/Ignored.svelte';
  import Snoozed from './components/Snoozed.svelte';
  import Settings from './components/Settings.svelte';
  import UnsavedChanges from './components/UnsavedChanges.svelte';
  import HotkeyHelp from './components/HotkeyHelp.svelte';
  import { GhGitHubService } from './lib/github/client';
  import { refreshDashboard, type DashboardSnapshot } from './lib/github/refresh';
  import {
    defaultState,
    loadState,
    saveState,
    parseRepository,
    parseIgnoreRule,
    ignoreRuleKey,
    type IgnoreRuleKind,
    parsePullRequest,
    isRefreshInterval,
    parseSnoozeOptions,
    preferenceDraft,
    draftDiffers,
    type AppState,
    type PreferenceDraft,
    type SnoozeOption,
  } from './lib/store/app-state';
  import { classify, sortPullRequests } from './lib/pr/classify';
  import { hotkeyFor, resolveHotkey } from './lib/hotkeys/match';
  import { ariaKeyShortcut, compactKeys } from './lib/hotkeys/format';
  import type { DashboardState, TrackingReason } from './lib/pr/types';
  const service = new GhGitHubService();
  let preferences = $state<AppState>(defaultState());
  let snapshot = $state<DashboardSnapshot>({ prs: [], sources: {}, warnings: [], staleIds: [] });
  type Screen = 'dashboard' | 'snoozed' | 'settings' | 'ignored';
  let login = $state(''),
    screen = $state<Screen>('dashboard');
  // Settings edits live here until Save, so leaving and returning through the Ignored sub-screen
  // keeps them, and a refresh never fires for a half-finished list of repositories.
  let settingsDraft = $state<PreferenceDraft | null>(null);
  let settingsDirty = $derived(settingsDraft !== null && draftDiffers(settingsDraft, preferences));
  let settingsView = $derived(settingsDraft ? { ...preferences, ...settingsDraft } : preferences);
  let pendingScreen = $state<Screen | null>(null);
  let closingPR = $state<PullRequest | null>(null);
  let closeError = $state('');
  let showHotkeys = $state(false);
  let filter = $state<TrackingReason | 'all'>('all'),
    loading = $state(false),
    saving = $state(false),
    initialized = $state(false);
  let silentRefresh = $state(false);
  let refreshQueued = false;
  let showLoading = $derived(loading && !silentRefresh);
  let error = $state(''),
    setupError = $state(''),
    now = $state(Date.now()),
    refreshed = $state('');
  const refreshHotkey = hotkeyFor('refresh');
  const dashboardHotkey = hotkeyFor('open-dashboard');
  const snoozedHotkey = hotkeyFor('open-snoozed');
  const settingsHotkey = hotkeyFor('open-settings');
  const shortcutsHotkey = hotkeyFor('toggle-shortcuts');
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
  onMount(() => {
    void start();
    const timer = setInterval(() => (now = Date.now()), 15000);
    return () => clearInterval(timer);
  });
  $effect(() => {
    const minutes = preferences.settings.automaticRefreshMinutes;
    if (!initialized || loading || saving || minutes === 0) return;
    // Reschedule after each refresh/save and cancel when settings change or the app unmounts.
    const timer = setTimeout(() => void refresh(true), minutes * 60_000);
    return () => clearTimeout(timer);
  });
  async function setRefreshInterval(minutes: number) {
    if (!isRefreshInterval(minutes)) return;
    await change((next) => {
      next.settings.automaticRefreshMinutes = minutes;
    });
  }
  async function setSnoozeOptions(options: SnoozeOption[]) {
    const validated = parseSnoozeOptions(options);
    await change((next) => {
      next.settings.snoozeOptions = validated;
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
  async function refresh(silent = false) {
    if (loading || saving) {
      // A background refresh asked for while one is already running would otherwise be dropped,
      // leaving the board built from the preferences that were current before the save.
      if (silent) refreshQueued = true;
      return;
    }
    loading = true;
    silentRefresh = silent;
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
    if (refreshQueued) {
      refreshQueued = false;
      await refresh(true);
    }
  }
  function manualRefresh() {
    if (loading && silentRefresh) {
      // Reuse the in-flight request, but acknowledge the explicit refresh action.
      silentRefresh = false;
      return;
    }
    void (initialized ? refresh() : start());
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
  function editDraft(update: (next: PreferenceDraft) => void) {
    const next = preferenceDraft(
      settingsDraft ? { ...preferences, ...settingsDraft } : preferences,
    );
    update(next);
    settingsDraft = next;
  }
  // Validating a value costs a GitHub round trip for repositories and PRs, so it happens here,
  // before the value joins the draft. Nothing is written or refreshed until Save.
  async function add(kind: 'repo' | 'pr' | IgnoreRuleKind, value: string): Promise<boolean> {
    if (saving) return false;
    error = '';
    try {
      if (kind === 'repository' || kind === 'author' || kind === 'title') {
        const rule = parseIgnoreRule(kind, value);
        if (settingsView.ignoreRules.some((e) => ignoreRuleKey(e) === ignoreRuleKey(rule)))
          throw new Error('That ignore rule is already configured.');
        editDraft((next) => {
          next.ignoreRules = [...next.ignoreRules, rule];
        });
      } else if (kind === 'repo') {
        const repo = parseRepository(value);
        await service.validateRepository(repo);
        editDraft((next) => {
          next.trackedRepositories = [...new Set([...next.trackedRepositories, repo])];
        });
      } else {
        const id = parsePullRequest(value);
        const pr = await service.getPullRequest(id);
        if (pr.state !== 'OPEN')
          throw new Error('This PR is closed or merged. Watch an open PR instead.');
        editDraft((next) => {
          next.watchedPullRequests = [...new Set([...next.watchedPullRequests, pr.id])];
        });
      }
      return true;
    } catch (e) {
      if (kind === 'repo') throw e;
      error = String(e);
      return false;
    }
  }
  function remove(kind: 'repo' | 'pr' | IgnoreRuleKind, value: string) {
    error = '';
    editDraft((next) => {
      if (kind === 'repository' || kind === 'author' || kind === 'title')
        next.ignoreRules = next.ignoreRules.filter(
          (rule) => rule.kind !== kind || rule.value !== value,
        );
      else if (kind === 'repo')
        next.trackedRepositories = next.trackedRepositories.filter((r) => r !== value);
      else next.watchedPullRequests = next.watchedPullRequests.filter((p) => p !== value);
    });
  }
  async function saveSettings(): Promise<boolean> {
    if (!settingsDraft || saving) return false;
    const draft = $state.snapshot(settingsDraft) as PreferenceDraft;
    await change((next) => {
      next.trackedRepositories = draft.trackedRepositories;
      next.ignoreRules = draft.ignoreRules;
      next.watchedPullRequests = draft.watchedPullRequests;
    });
    // change() reports failures through error; keep the draft so the user can try again.
    if (error) return false;
    settingsDraft = null;
    void refresh(true);
    return true;
  }
  function discardSettings() {
    settingsDraft = null;
    error = '';
  }
  // The Ignored screen is part of Settings, so a draft survives a trip through it; anything else
  // leaves Settings behind and has to ask first.
  function navigate(to: Screen) {
    if (settingsDirty && to !== 'settings' && to !== 'ignored') pendingScreen = to;
    else screen = to;
  }
  async function saveAndLeave() {
    const to = pendingScreen;
    if (!(await saveSettings())) return;
    pendingScreen = null;
    if (to) screen = to;
  }
  function discardAndLeave() {
    const to = pendingScreen;
    discardSettings();
    pendingScreen = null;
    if (to) screen = to;
  }
  async function action(id: string, action: string, until?: string) {
    if (action === 'close-stale') {
      if (saving || loading) return;
      const pr = snapshot.prs.find((pr) => pr.id === id);
      if (pr && stalenessLevel(pr.updatedAt, Date.now()) === 'high') {
        closeError = '';
        closingPR = pr;
      }
      return;
    }
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
  async function confirmClose() {
    if (!closingPR || saving || loading) return;
    const pr = closingPR;
    saving = true;
    closeError = '';
    try {
      await service.closeStalePullRequest(pr.id);
      snapshot.prs = snapshot.prs.filter((item) => item.id !== pr.id);
      closingPR = null;
    } catch (e) {
      closeError = String(e);
    } finally {
      saving = false;
    }
  }
  async function restore(kind: 'ignored' | 'snoozed', id: string) {
    await change((next) => {
      if (kind === 'ignored') delete next.ignoredPullRequests[id];
      else delete next.snoozedPullRequests[id];
    });
    await refresh();
  }
  function handleHotkey(event: KeyboardEvent) {
    if (closingPR || pendingScreen) return;
    const hotkey = resolveHotkey(event, event.target as HTMLElement | null);
    if (!hotkey) return;
    event.preventDefault();
    // While the shortcut list is up, the only shortcut that still acts is the one that
    // dismisses it; navigating behind an open dialog would leave the user lost.
    if (showHotkeys && hotkey.action !== 'toggle-shortcuts') return;
    if (hotkey.action === 'open-dashboard') navigate('dashboard');
    else if (hotkey.action === 'open-snoozed') navigate('snoozed');
    else if (hotkey.action === 'open-settings') navigate('settings');
    else if (hotkey.action === 'refresh') manualRefresh();
    else if (hotkey.action === 'toggle-shortcuts') showHotkeys = !showHotkeys;
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
      <button
        class:active={screen === 'dashboard'}
        onclick={() => navigate('dashboard')}
        aria-keyshortcuts={dashboardHotkey ? ariaKeyShortcut(dashboardHotkey) : null}
        ><LayoutGrid size={15} /> Dashboard
        {#if dashboardHotkey}<span class="nav-hotkey" aria-hidden="true"
            >{compactKeys(dashboardHotkey)}</span
          >{/if}</button
      >
      <button
        class:active={screen === 'snoozed'}
        onclick={() => navigate('snoozed')}
        aria-keyshortcuts={snoozedHotkey ? ariaKeyShortcut(snoozedHotkey) : null}
      >
        <Clock size={15} /> Snoozed
        {#if snoozedHotkey}<span class="nav-hotkey" aria-hidden="true"
            >{compactKeys(snoozedHotkey)}</span
          >{/if}
      </button>
    </nav>
    <div class="sidebar-utilities">
      <nav aria-label="Preferences">
        <button
          class:active={screen === 'settings'}
          onclick={() => navigate('settings')}
          aria-keyshortcuts={settingsHotkey ? ariaKeyShortcut(settingsHotkey) : null}
          ><SettingsIcon size={15} /> Settings{#if settingsHotkey}<span
              class="nav-hotkey"
              aria-hidden="true">{compactKeys(settingsHotkey)}</span
            >{/if}</button
        >
      </nav>
      {#if shortcutsHotkey}
        <button
          class="shortcuts-button"
          onclick={() => (showHotkeys = true)}
          aria-keyshortcuts={ariaKeyShortcut(shortcutsHotkey)}
          >Keyboard shortcuts<span class="nav-hotkey" aria-hidden="true"
            >{compactKeys(shortcutsHotkey)}</span
          ></button
        >
      {/if}
    </div>
    <div class="sidebar-bottom">
      <span class="connection-dot" class:connected={initialized}></span>{login
        ? `@${login}`
        : 'GitHub CLI'}<small>One place for your pull requests.</small>
      <span class="version">v{version}</span>
    </div>
  </aside>
  <main>
    <div class="toolbar">
      <span
        >Workspace / {screen === 'dashboard'
          ? 'Dashboard'
          : screen === 'snoozed'
            ? 'Snoozed'
            : screen === 'ignored'
              ? 'Settings / Ignored pull requests'
              : 'Settings'}</span
      >
      <div>
        {#if refreshed}<span class="refresh-time">Updated {refreshed}</span>{/if}<button
          disabled={showLoading || saving}
          onclick={manualRefresh}
          aria-keyshortcuts={refreshHotkey ? ariaKeyShortcut(refreshHotkey) : null}
          ><RefreshCw size={13} />
          {showLoading ? 'Refreshing…' : 'Refresh'}
          {#if refreshHotkey}<span class="refresh-hotkey" aria-hidden="true"
              >{compactKeys(refreshHotkey)}</span
            >{/if}</button
        >
      </div>
    </div>
    {#if error}<div class="alert" role="alert">
        {error}<button onclick={() => (error = '')} aria-label="Dismiss error"
          ><X size={14} /></button
        >
      </div>{/if}
    {#if !initialized}
      <div class="setup">
        <GitPullRequest class="setup-symbol" size={48} />
        <h1>Your pull requests, in focus.</h1>
        <p>PR Desk uses your existing GitHub CLI sign-in.</p>
        {#if setupError}<div class="alert" role="alert">{setupError}</div>
          <button class="primary-button" onclick={start} disabled={loading}>Try again</button
          >{:else}<p>Connecting to GitHub…</p>{/if}
      </div>
    {:else if screen === 'snoozed'}
      <Snoozed
        {preferences}
        {snapshot}
        {login}
        {now}
        busy={saving || loading}
        onopen={open}
        onaction={action}
        onrestore={(id) => restore('snoozed', id)}
      />
    {:else if screen === 'ignored'}
      <Ignored
        {preferences}
        {snapshot}
        {login}
        {now}
        busy={saving || loading}
        onopen={open}
        onunignore={(id) => restore('ignored', id)}
        onback={() => navigate('settings')}
      />
    {:else if screen === 'settings'}
      <Settings
        preferences={settingsView}
        busy={saving}
        dirty={settingsDirty}
        onadd={add}
        onremove={remove}
        onsave={saveSettings}
        ondiscard={discardSettings}
        onrefreshinterval={setRefreshInterval}
        onsnoozeoptions={setSnoozeOptions}
        onopenignored={() => navigate('ignored')}
      />
    {:else}
      <div class="dashboard-heading">
        <div>
          <div class="eyebrow">YOUR WORK, AT A GLANCE</div>
          <h1>Pull requests</h1>
          <p>What needs you. What’s ready. What can wait.</p>
        </div>
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
      <div
        class="board"
        class:silent-refresh={loading && silentRefresh && !saving}
        aria-busy={showLoading}
      >
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
                  snoozeOptions={preferences.settings.snoozeOptions}
                  busy={saving || loading}
                  stale={snapshot.staleIds.includes(item.pr.id)}
                  watching={preferences.watchedPullRequests.includes(item.pr.id)}
                  onopen={open}
                  onaction={action}
                />{:else}<div class="empty-column">
                  <span>
                    {#if col.state === 'ready-to-merge'}<CircleCheck
                        size={24}
                      />{:else if col.state === 'needs-attention'}<ClipboardCheck
                        size={24}
                      />{:else}<Clock size={24} />{/if}
                  </span>
                  <p>
                    {showLoading
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
        <span><ArrowUpRight size={11} /> Select a pull request to open it on GitHub</span><span
          >Only direct review requests need your attention</span
        >
      </footer>
    {/if}
  </main>
</div>
<UnsavedChanges
  open={pendingScreen !== null}
  busy={saving}
  onsave={() => void saveAndLeave()}
  ondiscard={discardAndLeave}
  oncancel={() => {
    if (!saving) pendingScreen = null;
  }}
/>
<HotkeyHelp open={showHotkeys} onclose={() => (showHotkeys = false)} />

<CloseStale
  pr={closingPR}
  busy={saving || loading}
  error={closeError}
  onconfirm={confirmClose}
  oncancel={() => {
    if (!saving) closingPR = null;
  }}
/>
