<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { isTauri } from '@tauri-apps/api/core';
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { version } from '../package.json';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import Bug from '@lucide/svelte/icons/bug';
  import Copy from '@lucide/svelte/icons/copy';
  import Download from '@lucide/svelte/icons/download';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import Clock from '@lucide/svelte/icons/clock';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Link from '@lucide/svelte/icons/link';
  import GitMerge from '@lucide/svelte/icons/git-merge';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import Keyboard from '@lucide/svelte/icons/keyboard';
  import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
  import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import SettingsIcon from '@lucide/svelte/icons/settings';
  import Tag from '@lucide/svelte/icons/tag';
  import X from '@lucide/svelte/icons/x';
  import ZoomIn from '@lucide/svelte/icons/zoom-in';
  import ZoomOut from '@lucide/svelte/icons/zoom-out';
  // The app's CSP blocks data URLs, so keep the logo as a bundled file.
  import appIcon from '../src-tauri/icons/source.svg?no-inline';
  import PRConfirmation from './components/PRConfirmation.svelte';
  import { sourceReasons, stalenessLevel } from './lib/pr/card-view-model';
  import type { PullRequest } from './lib/pr/types';
  import PRCard from './components/PRCard.svelte';
  import PRStack from './components/PRStack.svelte';
  import RefreshOverlay from './components/RefreshOverlay.svelte';
  import AllClear from './components/AllClear.svelte';
  import Snoozed from './components/Snoozed.svelte';
  import Completed from './components/Completed.svelte';
  import Labels from './components/Labels.svelte';
  import LabelPullRequests from './components/LabelPullRequests.svelte';
  import Settings from './components/Settings.svelte';
  import UnsavedChanges from './components/UnsavedChanges.svelte';
  import HotkeyHelp from './components/HotkeyHelp.svelte';
  import Toaster from './components/Toaster.svelte';
  import { showToast } from './lib/toast/toasts.svelte';
  import type { GhCliInfo } from './lib/github/types';
  import { GhGitHubService } from './lib/github/client';
  import { refreshDashboard, type DashboardSnapshot } from './lib/github/refresh';
  import { fetchCompleted, type CompletedSnapshot } from './lib/github/completed';
  import {
    defaultState,
    loadState,
    saveState,
    parseKnownBot,
    parseRepository,
    parseIgnoreRule,
    parseCheckRule,
    checkRuleKey,
    type CheckRule,
    ignoreRuleKey,
    type IgnoreRuleKind,
    parsePullRequest,
    isRefreshInterval,
    isDockBadgeMode,
    type DockBadgeMode,
    isInterfaceScale,
    stepInterfaceScale,
    type InterfaceScale,
    parseSnoozeOptions,
    preferenceDraft,
    draftDiffers,
    exportSettings,
    applySettingsImport,
    type SettingsConfig,
    type AppState,
    type PreferenceDraft,
    type SnoozeOption,
  } from './lib/store/app-state';
  import { classify, sortPullRequests, type ClassifiedPR } from './lib/pr/classify';
  import { boardEntries } from './lib/pr/stacks';
  import { knownBotKey } from './lib/pr/bots';
  import { badgeCount } from './lib/pr/badge';
  import { buildDebugInfo } from './lib/debug/debug-info';
  import {
    recordError,
    sessionErrors,
    type ErrorSource,
    type SessionError,
  } from './lib/debug/session-errors.svelte';
  import { applyLabelOp, labelsFor, type LabelOp } from './lib/pr/labels';
  import { prunePreferences } from './lib/pr/prune';
  import { hotkeyFor, resolveHotkey } from './lib/hotkeys/match';
  import { ariaKeyShortcut, compactKeys } from './lib/hotkeys/format';
  import type { DashboardState, TrackingReason } from './lib/pr/types';
  const service = new GhGitHubService();
  let preferences = $state<AppState>(defaultState());
  let snapshot = $state<DashboardSnapshot>({
    prs: [],
    sources: {},
    warnings: [],
    staleIds: [],
    discoveryComplete: false,
  });
  type Screen = 'dashboard' | 'snoozed' | 'completed' | 'labels' | 'label';
  let login = $state(''),
    avatarUrl = $state(''),
    screen = $state<Screen>('dashboard');
  let selectedLabelId = $state<string | null>(null);
  let selectedLabel = $derived(preferences.labels.find((l) => l.id === selectedLabelId) ?? null);
  // Settings is an overlay above the current screen. Its edits live here until Save, so a refresh
  // never fires for a half-finished list of repositories.
  let settingsOpen = $state(false);
  let confirmClose = $state(false);
  let settingsDraft = $state<PreferenceDraft | null>(null);
  let settingsDirty = $derived(settingsDraft !== null && draftDiffers(settingsDraft, preferences));
  let settingsView = $derived(settingsDraft ? { ...preferences, ...settingsDraft } : preferences);
  let actionPR = $state<PullRequest | null>(null);
  let actionError = $state('');
  let actionStatus = $state('');
  let pendingAction = $state<'close-stale' | 'merge' | 'approve-merge' | 'update-branch'>(
    'close-stale',
  );
  let showHotkeys = $state(false);
  let sidebarCollapsed = $derived(preferences.settings.sidebarCollapsed);
  let filter = $state<TrackingReason | 'all'>('all'),
    loading = $state(false),
    saving = $state(false),
    initialized = $state(false);
  let silentRefresh = $state(false);
  let refreshQueued = false;
  let completed = $state<CompletedSnapshot | null>(null),
    completedLoading = $state(false);
  let showLoading = $derived(loading && !silentRefresh);
  let refreshBusy = $derived(showLoading || (screen === 'completed' && completedLoading));
  // Only a refresh the user asked for covers the content; background refreshes leave it usable.
  let manualRefreshing = $state(false);
  let refreshOverlay = $derived(manualRefreshing && refreshBusy);
  $effect(() => {
    if (manualRefreshing && !refreshBusy) manualRefreshing = false;
  });
  let error = $state(''),
    setupError = $state(''),
    now = $state(Date.now()),
    refreshed = $state('');
  const refreshHotkey = hotkeyFor('refresh');
  const dashboardHotkey = hotkeyFor('open-dashboard');
  const sidebarHotkey = hotkeyFor('toggle-sidebar');
  const snoozedHotkey = hotkeyFor('open-snoozed');
  const completedHotkey = hotkeyFor('open-completed');
  const labelsHotkey = hotkeyFor('open-labels');
  const settingsHotkey = hotkeyFor('open-settings');
  const shortcutsHotkey = hotkeyFor('toggle-shortcuts');
  let hoveredId = $state<string | null>(null);
  let cards: Record<string, PRCard> = {};
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
    classified.filter((p) => filter === 'all' || sourceReasons(p.pr.reasons).includes(filter)),
  );
  let entries = $derived(boardEntries(visible, snapshot.prs));
  // A stack sits in its most urgent layer's column, so columns count the PRs they show.
  let columnSizes = $derived(
    Object.fromEntries(
      columns.map((col) => [
        col.state,
        entries.filter((e) => e.lead.state === col.state).reduce((n, e) => n + e.items.length, 0),
      ]),
    ) as Record<DashboardState, number>,
  );
  let allClear = $derived(!showLoading && filter === 'all' && classified.length === 0);
  let dockBadge = $derived(
    initialized ? badgeCount(classified, preferences.settings.dockBadge) : 0,
  );
  $effect(() => {
    if (!isTauri()) return;
    // The badge is cosmetic, so a failure to set it must never surface as a dashboard error.
    getCurrentWindow()
      .setBadgeCount(dockBadge || undefined)
      .catch((e) => recordError('dock-badge', String(e)));
  });
  $effect(() => {
    if (!isTauri() || !initialized) return;
    // Zoom is cosmetic, so a failure to apply it must never surface as a dashboard error.
    getCurrentWebview()
      .setZoom(preferences.settings.interfaceScale / 100)
      .catch((e) => recordError('interface-scale', String(e)));
  });
  $effect(() => {
    if (screen === 'label' && !selectedLabel) screen = 'labels';
  });
  let cliInfo = $state<GhCliInfo | null>(null);
  let cliInfoError = $state(false);
  $effect(() => {
    if (!settingsOpen || !initialized) return;
    let active = true;
    cliInfo = null;
    cliInfoError = false;
    void service.getCliInfo().then(
      (info) => {
        if (active) cliInfo = info;
      },
      (e) => {
        recordError('gh-cli', String(e));
        if (active) cliInfoError = true;
      },
    );
    return () => {
      active = false;
    };
  });
  onMount(() => {
    void start();
    const timer = setInterval(() => (now = Date.now()), 15000);
    const uncaught = (event: ErrorEvent) =>
      recordError('uncaught', String(event.error ?? event.message));
    const unhandled = (event: PromiseRejectionEvent) =>
      recordError('uncaught', String(event.reason));
    window.addEventListener('error', uncaught);
    window.addEventListener('unhandledrejection', unhandled);
    return () => {
      clearInterval(timer);
      window.removeEventListener('error', uncaught);
      window.removeEventListener('unhandledrejection', unhandled);
    };
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
  async function setDockBadge(mode: DockBadgeMode) {
    if (!isDockBadgeMode(mode)) return;
    await change((next) => {
      next.settings.dockBadge = mode;
    });
  }
  async function setInterfaceScale(scale: InterfaceScale) {
    if (!isInterfaceScale(scale)) return;
    await change((next) => {
      next.settings.interfaceScale = scale;
    });
  }
  // Until preferences load, saving would write defaults over the user's file.
  async function toggleSidebar() {
    if (!initialized) return;
    await change((next) => {
      next.settings.sidebarCollapsed = !next.settings.sidebarCollapsed;
    });
  }
  // The shortcuts have no control on screen to show the result, so they confirm it in a toast.
  async function zoomTo(scale: InterfaceScale, icon: typeof ZoomIn) {
    await setInterfaceScale(scale);
    showToast(icon, `Interface size ${scale}%`, 'interface-size');
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
      ({ login, avatarUrl } = await service.getCurrentUser());
      initialized = true;
    } catch (e) {
      setupError = String(e);
      recordError('setup', setupError);
    } finally {
      loading = false;
    }
    if (initialized) await refresh();
  }
  // Merged PRs are asked for each time the view opens, so the dashboard refresh never pays for it.
  async function loadCompleted() {
    if (completedLoading) return;
    completedLoading = true;
    try {
      completed = await fetchCompleted(service, $state.snapshot(preferences), Date.now());
      now = Date.now();
    } catch (e) {
      showError('completed', String(e));
    } finally {
      completedLoading = false;
    }
  }
  $effect(() => {
    if (initialized && screen === 'completed') untrack(() => void loadCompleted());
  });
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
      for (const warning of snapshot.warnings) recordError('refresh-warning', warning);
      await prune();
      now = Date.now();
      refreshed = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      showError('refresh', String(e));
    } finally {
      loading = false;
    }
    if (refreshQueued) {
      refreshQueued = false;
      await refresh(true);
    }
  }
  // Watches and labels for finished or untracked PRs are dropped once a refresh can tell.
  async function prune() {
    const pruned = prunePreferences($state.snapshot(preferences), $state.snapshot(snapshot));
    if (!pruned) return;
    const kept = new Set(pruned.watchedPullRequests);
    const dropped = preferences.watchedPullRequests.filter((id) => !kept.has(id));
    await change((next) => {
      next.watchedPullRequests = pruned.watchedPullRequests;
      next.labeledPullRequests = pruned.labeledPullRequests;
    });
    // A Settings draft still holding a pruned watch would look dirty and bring it back on Save.
    if (settingsDraft)
      settingsDraft.watchedPullRequests = settingsDraft.watchedPullRequests.filter(
        (id) => !dropped.includes(id),
      );
  }
  function manualRefresh() {
    manualRefreshing = true;
    if (loading && silentRefresh) {
      // Reuse the in-flight request, but acknowledge the explicit refresh action.
      silentRefresh = false;
      return;
    }
    if (initialized && screen === 'completed') void loadCompleted();
    else void (initialized ? refresh() : start());
  }
  function showError(source: ErrorSource, message: string) {
    error = message;
    recordError(source, message);
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
      showError('preferences', `Could not save preferences: ${String(e)}`);
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
  async function add(
    kind: 'repo' | 'pr' | 'bot' | IgnoreRuleKind,
    value: string,
  ): Promise<boolean> {
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
      } else if (kind === 'bot') {
        const bot = parseKnownBot(value);
        editDraft((next) => {
          next.knownBots = [...new Set([...next.knownBots, bot])];
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
      if (kind === 'repo') {
        recordError('settings', String(e));
        throw e;
      }
      showError('settings', String(e));
      return false;
    }
  }
  function addCheckRule(repository: string, check: string): boolean {
    if (saving) return false;
    error = '';
    try {
      const rule = parseCheckRule(repository, check);
      if (settingsView.checkRules.some((e) => checkRuleKey(e) === checkRuleKey(rule)))
        throw new Error('That check rule is already configured.');
      editDraft((next) => {
        next.checkRules = [...next.checkRules, rule];
      });
      return true;
    } catch (e) {
      showError('settings', String(e));
      return false;
    }
  }
  function removeCheckRule(rule: CheckRule) {
    error = '';
    editDraft((next) => {
      next.checkRules = next.checkRules.filter((e) => checkRuleKey(e) !== checkRuleKey(rule));
    });
  }
  function remove(kind: 'repo' | 'pr' | 'bot' | IgnoreRuleKind, value: string) {
    error = '';
    editDraft((next) => {
      if (kind === 'repository' || kind === 'author' || kind === 'title')
        next.ignoreRules = next.ignoreRules.filter(
          (rule) => rule.kind !== kind || rule.value !== value,
        );
      else if (kind === 'bot') next.knownBots = next.knownBots.filter((b) => b !== value);
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
      next.checkRules = draft.checkRules;
      next.watchedPullRequests = draft.watchedPullRequests;
      next.knownBots = draft.knownBots;
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
  // Closing Settings with unsaved edits has to ask first.
  function closeSettings() {
    if (settingsDirty) confirmClose = true;
    else settingsOpen = false;
  }
  async function saveAndClose() {
    if (!(await saveSettings())) return;
    confirmClose = settingsOpen = false;
  }
  function discardAndClose() {
    discardSettings();
    confirmClose = settingsOpen = false;
  }
  async function action(id: string, action: string, until?: string) {
    if (
      action === 'close-stale' ||
      action === 'merge' ||
      action === 'approve-merge' ||
      action === 'update-branch'
    ) {
      if (saving || loading) return;
      const pr = snapshot.prs.find((pr) => pr.id === id);
      if (
        pr &&
        (action === 'close-stale'
          ? stalenessLevel(pr.updatedAt, Date.now()) === 'high'
          : !snapshot.staleIds.includes(id) &&
            classify(pr, login, preferences, Date.now())?.[capability[action]])
      ) {
        pendingAction = action;
        actionError = '';
        actionPR = pr;
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
  async function label(op: LabelOp) {
    await change((next) => {
      Object.assign(next, applyLabelOp(next, op));
    });
  }
  const capability = {
    merge: 'canMerge',
    'approve-merge': 'canApproveAndMerge',
    'update-branch': 'canUpdateBranch',
  } as const;
  async function confirmAction(method: string) {
    if (!actionPR || saving || loading) return;
    const pr = actionPR;
    const updating = pendingAction === 'update-branch';
    saving = true;
    actionError = '';
    try {
      if (pendingAction !== 'close-stale') {
        const merge = pendingAction === 'merge';
        actionStatus = updating
          ? 'Checking the PR still needs updating…'
          : 'Checking the PR is still ready…';
        const fresh = await service.getPullRequest(pr.id);
        // A single-PR lookup carries no tracking reasons; the card's own reasons decide bot status.
        const freshResult = classify(
          { ...fresh, reasons: pr.reasons },
          login,
          preferences,
          Date.now(),
        );
        if (fresh.headOid !== pr.headOid || !freshResult?.[capability[pendingAction]])
          throw new Error(
            updating
              ? 'This PR changed or no longer needs a branch update. Cancel and refresh before trying again.'
              : 'This PR changed or is no longer ready to merge. Cancel and refresh before trying again.',
          );
        actionStatus = updating
          ? 'Updating branch…'
          : merge
            ? 'Merging…'
            : 'Approving and merging…';
        if (updating)
          await service.updatePullRequestBranch(
            pr.id,
            pr.headOid,
            freshResult.bot ? knownBotKey(fresh) : undefined,
          );
        else if (merge)
          await service.mergePullRequest(
            pr.id,
            pr.headOid,
            method,
            freshResult.bot ? knownBotKey(fresh) : undefined,
          );
        else
          await service.approveAndMergePullRequest(pr.id, pr.headOid, method, knownBotKey(fresh));
      } else {
        actionStatus = 'Closing and leaving a comment…';
        await service.closeStalePullRequest(pr.id);
      }
      // An updated PR stays open while its checks re-run, so refresh rather than drop it.
      if (!updating) snapshot.prs = snapshot.prs.filter((item) => item.id !== pr.id);
      actionPR = null;
    } catch (e) {
      actionError = String(e);
      recordError(pendingAction, actionError);
    } finally {
      saving = false;
      actionStatus = '';
    }
    if (updating && !actionPR) await refresh();
  }
  async function restore(kind: 'ignored' | 'snoozed', id: string) {
    await change((next) => {
      if (kind === 'ignored') delete next.ignoredPullRequests[id];
      else delete next.snoozedPullRequests[id];
    });
    await refresh();
  }
  function handleHotkey(event: KeyboardEvent) {
    if (actionPR || confirmClose) return;
    const hotkey = resolveHotkey(event, event.target as HTMLElement | null);
    if (!hotkey) return;
    // Enter must keep activating a focused button or link rather than open the hovered PR.
    if (
      event.key === 'Enter' &&
      (event.target as HTMLElement | null)?.closest?.('button, a, summary, [role="menuitem"]')
    )
      return;
    const cardAction = hotkey.action.endsWith('-pr');
    const target = cardAction ? cardTarget(event) : null;
    // Without a card under the pointer these keys stay free for the browser.
    if (cardAction && !target) return;
    event.preventDefault();
    // While the shortcut list is up, the only shortcut that still acts is the one that
    // dismisses it; navigating behind an open dialog would leave the user lost.
    if (showHotkeys && hotkey.action !== 'toggle-shortcuts') return;
    // Settings covers the window, so only shortcuts that make sense above it stay active.
    if (settingsOpen && !hotkey.action.startsWith('zoom-') && hotkey.action !== 'toggle-shortcuts')
      return;
    if (hotkey.action === 'open-dashboard') screen = 'dashboard';
    else if (hotkey.action === 'open-snoozed') screen = 'snoozed';
    else if (hotkey.action === 'open-completed') screen = 'completed';
    else if (hotkey.action === 'open-labels') screen = 'labels';
    else if (hotkey.action === 'open-settings') settingsOpen = true;
    else if (hotkey.action === 'refresh') manualRefresh();
    else if (hotkey.action === 'zoom-in')
      void zoomTo(stepInterfaceScale(preferences.settings.interfaceScale, 1), ZoomIn);
    else if (hotkey.action === 'zoom-out')
      void zoomTo(stepInterfaceScale(preferences.settings.interfaceScale, -1), ZoomOut);
    else if (hotkey.action === 'zoom-reset') void zoomTo(100, ZoomIn);
    else if (hotkey.action === 'toggle-shortcuts') showHotkeys = !showHotkeys;
    else if (hotkey.action === 'toggle-sidebar') void toggleSidebar();
    else if (target) {
      if (hotkey.action === 'open-pr') open(target.pr.url);
      else if (hotkey.action === 'copy-pr') copyUrl(target.pr);
      else if (hotkey.action === 'ignore-pr') {
        if (!saving && !loading) action(target.pr.id, 'ignore');
      } else cards[target.pr.id]?.openSubmenu(hotkey.action === 'snooze-pr' ? 'snooze' : 'labels');
    }
  }
  function cardTarget(event: KeyboardEvent) {
    if (screen !== 'dashboard' || refreshOverlay) return null;
    const id =
      hoveredId ??
      (event.target as HTMLElement | null)?.closest?.('[data-pr-id]')?.getAttribute('data-pr-id');
    return visible.find((p) => p.pr.id === id) ?? null;
  }
  async function copyText(text: () => string, icon: typeof Copy, copied: string, what: string) {
    try {
      await navigator.clipboard.writeText(text());
      showToast(icon, copied);
    } catch (e) {
      showError('clipboard', `Could not copy ${what}: ${String(e)}`);
    }
  }
  function copyUrl(pr: PullRequest) {
    void copyText(
      () => pr.url,
      Link,
      `PR ${pr.repository}#${pr.number} URL copied to clipboard`,
      'the PR URL',
    );
  }
  function copyDebugInfo(pr?: PullRequest) {
    const info = buildDebugInfo(
      {
        version,
        login,
        now: Date.now(),
        filter,
        preferences: $state.snapshot(preferences) as AppState,
        snapshot: $state.snapshot(snapshot) as DashboardSnapshot,
        cliInfo: $state.snapshot(cliInfo),
        errors: $state.snapshot(sessionErrors) as SessionError[],
      },
      pr?.id,
    );
    void copyText(
      () => JSON.stringify(info, null, 2),
      Bug,
      pr
        ? `Debug info for ${pr.repository}#${pr.number} copied to clipboard`
        : 'Debug info copied to clipboard',
      'debug info',
    );
  }
  function copyError(entry: SessionError) {
    void copyText(
      () => JSON.stringify(entry, null, 2),
      Copy,
      'Error copied to clipboard',
      'the error',
    );
  }
  function copySettings() {
    void copyText(
      () =>
        JSON.stringify(
          exportSettings($state.snapshot(preferences) as AppState, new Date()),
          null,
          2,
        ),
      Copy,
      'Settings copied',
      'settings',
    );
  }
  async function importSettings(config: SettingsConfig): Promise<boolean> {
    await change((next) => Object.assign(next, applySettingsImport(next, config)));
    if (error) return false;
    settingsDraft = null;
    void refresh(true);
    showToast(Download, 'Settings imported');
    return true;
  }
  async function open(url: string) {
    try {
      await openUrl(url);
    } catch (e) {
      showError('open', `Could not open GitHub: ${String(e)}`);
    }
  }
</script>

<svelte:head><title>PR Desk</title></svelte:head>
<svelte:window onkeydown={handleHotkey} />
{#snippet navButton(
  label: string,
  Icon: typeof LayoutGrid,
  active: boolean,
  onclick: () => void,
  hotkey: ReturnType<typeof hotkeyFor>,
)}
  <button
    class:active
    {onclick}
    aria-label={sidebarCollapsed ? label : null}
    aria-keyshortcuts={hotkey ? ariaKeyShortcut(hotkey) : null}
    data-tip={sidebarCollapsed ? `${label}${hotkey ? ` ${compactKeys(hotkey)}` : ''}` : null}
    ><Icon size={15} /><span class="nav-text">{label}</span>
    {#if hotkey}<span class="nav-hotkey nav-text" aria-hidden="true">{compactKeys(hotkey)}</span
      >{/if}</button
  >
{/snippet}
<div class="app-shell" class:sidebar-animated={initialized}>
  <aside class:collapsed={sidebarCollapsed}>
    <div class="brand">
      <img class="brand-mark" src={appIcon} alt="" width="32" height="32" />
      <span class="nav-text">PR Desk</span>
      <button
        class="sidebar-toggle"
        onclick={toggleSidebar}
        disabled={!initialized}
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!sidebarCollapsed}
        aria-keyshortcuts={sidebarHotkey ? ariaKeyShortcut(sidebarHotkey) : null}
        data-tip={sidebarCollapsed
          ? `Expand sidebar${sidebarHotkey ? ` ${compactKeys(sidebarHotkey)}` : ''}`
          : null}
        >{#if sidebarCollapsed}<PanelLeftOpen size={15} />{:else}<PanelLeftClose
            size={15}
          />{/if}</button
      >
    </div>
    <div class="brand-user">
      {#if avatarUrl}<span class="avatar-wrap"
          ><img class="avatar" src={avatarUrl} alt="" /><span
            class="connection-dot"
            class:connected={initialized}
          ></span></span
        >{:else}<span class="connection-dot" class:connected={initialized}></span>{/if}<span
        class="brand-user-login nav-text">{login || 'GitHub CLI'}</span
      >
    </div>
    <div class="nav-label">WORKSPACE</div>
    <nav aria-label="Main navigation">
      {@render navButton(
        'Dashboard',
        LayoutGrid,
        screen === 'dashboard',
        () => (screen = 'dashboard'),
        dashboardHotkey,
      )}
      {@render navButton(
        'Snoozed',
        Clock,
        screen === 'snoozed',
        () => (screen = 'snoozed'),
        snoozedHotkey,
      )}
      {@render navButton(
        'Completed',
        GitMerge,
        screen === 'completed',
        () => (screen = 'completed'),
        completedHotkey,
      )}
      {@render navButton(
        'Labels',
        Tag,
        screen === 'labels' || screen === 'label',
        () => (screen = 'labels'),
        labelsHotkey,
      )}
    </nav>
    <div class="sidebar-utilities">
      <nav aria-label="Preferences">
        {@render navButton(
          'Settings',
          SettingsIcon,
          false,
          () => (settingsOpen = true),
          settingsHotkey,
        )}
      </nav>
    </div>
    <div class="sidebar-bottom">
      {#if shortcutsHotkey}
        <div class="shortcuts-row">
          <button
            class="shortcuts-button"
            onclick={() => (showHotkeys = true)}
            aria-keyshortcuts={ariaKeyShortcut(shortcutsHotkey)}
            aria-label={sidebarCollapsed ? 'Keyboard shortcuts' : null}
            data-tip={sidebarCollapsed
              ? `Keyboard shortcuts ${compactKeys(shortcutsHotkey)}`
              : null}
            ><Keyboard size={13} /><span class="nav-text">Keyboard shortcuts</span><span
              class="shortcuts-key nav-text"
              aria-hidden="true">{compactKeys(shortcutsHotkey)}</span
            ></button
          >
        </div>
      {/if}
      <span class="version">v{version}</span>
    </div>
  </aside>
  <main inert={refreshOverlay}>
    <div class="toolbar">
      <span
        >Workspace / {screen === 'dashboard'
          ? 'Dashboard'
          : screen === 'snoozed'
            ? 'Snoozed'
            : screen === 'completed'
              ? 'Completed'
              : screen === 'labels'
                ? 'Labels'
                : `Labels / ${selectedLabel?.name ?? ''}`}</span
      >
      <div>
        {#if refreshed}<span class="refresh-time">Updated {refreshed}</span>{/if}<button
          disabled={refreshBusy || saving}
          onclick={manualRefresh}
          aria-keyshortcuts={refreshHotkey ? ariaKeyShortcut(refreshHotkey) : null}
          class:refreshing={refreshBusy}
          ><RefreshCw size={13} />
          {refreshBusy ? 'Refreshing…' : 'Refresh'}
          {#if refreshHotkey}<span class="refresh-hotkey" aria-hidden="true"
              >{compactKeys(refreshHotkey)}</span
            >{/if}</button
        >
      </div>
    </div>
    {#if error && !settingsOpen}<div class="alert" role="alert">
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
    {:else if screen === 'completed'}
      <Completed snapshot={completed} loading={completedLoading} {now} onopen={open} />
    {:else if screen === 'labels'}
      <Labels
        {preferences}
        busy={saving || loading}
        onselect={(id) => {
          selectedLabelId = id;
          screen = 'label';
        }}
        onlabel={label}
      />
    {:else if screen === 'label' && selectedLabel}
      <LabelPullRequests
        {preferences}
        {snapshot}
        label={selectedLabel}
        {login}
        {now}
        busy={saving || loading}
        onopen={open}
        onlabel={label}
        onback={() => (screen = 'labels')}
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
            ><i class={col.state}></i><b>{columnSizes[col.state]}</b>
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
      {#snippet card(item: ClassifiedPR, compact: boolean)}<PRCard
          bind:this={cards[item.pr.id]}
          {item}
          {compact}
          onhover={(id) => {
            if (id) hoveredId = id;
            else if (hoveredId === item.pr.id) hoveredId = null;
          }}
          {now}
          snoozeOptions={preferences.settings.snoozeOptions}
          busy={saving || loading}
          stale={snapshot.staleIds.includes(item.pr.id)}
          watching={preferences.watchedPullRequests.includes(item.pr.id)}
          labels={labelsFor(preferences, item.pr.id)}
          allLabels={preferences.labels}
          onopen={open}
          oncopy={copyUrl}
          oncopydebuginfo={copyDebugInfo}
          onaction={action}
          onlabel={label}
        />{/snippet}
      <div
        class="board"
        class:silent-refresh={loading && silentRefresh && !saving}
        aria-busy={showLoading}
      >
        {#if allClear}<AllClear />{:else}
          {#each columns as col}
            <section class="column">
              <header>
                <div>
                  <i class={col.state}></i>
                  <h2>{col.title}</h2>
                  <span class="column-count">{columnSizes[col.state]}</span>
                </div>
                <p>{col.subtitle}</p>
              </header>
              <div class="card-list">
                {#each entries.filter((e) => e.lead.state === col.state) as entry (entry.id)}{#if entry.stack}<PRStack
                      items={entry.items}
                      stack={entry.stack}
                      row={card}
                    />{:else}{@render card(entry.lead, false)}{/if}{:else}<div class="empty-column">
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
          {/each}{/if}
      </div>
      <footer>
        <span><ArrowUpRight size={11} /> Select a pull request to open it on GitHub</span><span
          >Only direct review requests need your attention</span
        >
      </footer>
    {/if}
  </main>
  {#if refreshOverlay}<RefreshOverlay />{/if}
</div>
<!-- Settings shows the toasts itself while open, since its modal dialog covers this one. -->
{#if !(settingsOpen && initialized)}<Toaster />{/if}
{#if initialized}
  <Settings
    open={settingsOpen}
    {login}
    {cliInfo}
    {cliInfoError}
    preferences={settingsView}
    saved={preferences}
    {snapshot}
    {now}
    busy={saving}
    listBusy={saving || loading}
    dirty={settingsDirty}
    {error}
    ondismisserror={() => (error = '')}
    onclose={closeSettings}
    onadd={add}
    onremove={remove}
    onaddcheckrule={addCheckRule}
    onremovecheckrule={removeCheckRule}
    onsave={saveSettings}
    ondiscard={discardSettings}
    onrefreshinterval={setRefreshInterval}
    ondockbadge={setDockBadge}
    interfaceScale={preferences.settings.interfaceScale}
    oninterfacescale={setInterfaceScale}
    onsnoozeoptions={setSnoozeOptions}
    onopen={open}
    onunignore={(id) => restore('ignored', id)}
    oncopydebuginfo={() => copyDebugInfo()}
    oncopyerror={copyError}
    oncopysettings={copySettings}
    onimportsettings={importSettings}
  />
{/if}
<UnsavedChanges
  open={confirmClose}
  busy={saving}
  onsave={() => void saveAndClose()}
  ondiscard={discardAndClose}
  oncancel={() => {
    if (!saving) confirmClose = false;
  }}
/>
<HotkeyHelp open={showHotkeys} onclose={() => (showHotkeys = false)} />

<PRConfirmation
  action={pendingAction}
  pr={actionPR}
  busy={saving || loading}
  error={actionError}
  status={actionStatus}
  onconfirm={confirmAction}
  oncancel={() => {
    if (!saving) actionPR = null;
  }}
/>
