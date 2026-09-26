<script lang="ts">
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import type { AppState } from '../lib/store/app-state';
  import type { DashboardSnapshot } from '../lib/github/refresh';
  import { ignoredPullRequests } from '../lib/pr/ignored';
  import IgnoredRow from './IgnoredRow.svelte';
  let {
    preferences,
    snapshot,
    login,
    now,
    busy,
    onopen,
    onunignore,
    onback,
  }: {
    preferences: AppState;
    snapshot: DashboardSnapshot;
    login: string;
    now: number;
    busy: boolean;
    onopen: (url: string) => void;
    onunignore: (id: string) => void;
    onback: () => void;
  } = $props();
  let rows = $derived(ignoredPullRequests(preferences, snapshot.prs, login));
</script>

<div class="dashboard-heading">
  <div>
    <div class="eyebrow">HIDDEN ONE AT A TIME</div>
    <h1>Ignored pull requests</h1>
    <p>Unignore a pull request to make it eligible for the dashboard again.</p>
  </div>
  <button class="quiet" onclick={onback}><ChevronLeft size={13} /> Back to settings</button>
</div>
<div class="ignored-list" aria-busy={busy}>
  <div class="ignored-summary">
    <span>{rows.length} ignored pull request{rows.length === 1 ? '' : 's'}</span><span
      >Broad rules stay in Settings</span
    >
  </div>
  {#each rows as row (row.id)}
    <IgnoredRow
      {row}
      {now}
      {busy}
      stale={snapshot.staleIds.includes(row.id)}
      {onopen}
      {onunignore}
    />
  {:else}
    <div class="empty-column">
      <span><EyeOff size={24} /></span>
      <p>Nothing individually ignored</p>
      <small>Choose Ignore PR from a pull request’s dashboard menu to hide it from the board.</small
      >
    </div>
  {/each}
</div>
