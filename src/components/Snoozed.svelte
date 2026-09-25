<script lang="ts">
  import type { AppState } from '../lib/store/app-state';
  import type { DashboardSnapshot } from '../lib/github/refresh';
  import { snoozedPullRequests } from '../lib/pr/snoozed';
  import SnoozedRow from './SnoozedRow.svelte';
  let {
    preferences,
    snapshot,
    login,
    now,
    busy,
    onopen,
    onaction,
    onrestore,
  }: {
    preferences: AppState;
    snapshot: DashboardSnapshot;
    login: string;
    now: number;
    busy: boolean;
    onopen: (url: string) => void;
    onaction: (id: string, action: string, until?: string) => void;
    onrestore: (id: string) => void;
  } = $props();
  let rows = $derived(snoozedPullRequests(preferences, snapshot.prs, login, now));
</script>

<div class="dashboard-heading">
  <div>
    <div class="eyebrow">SET ASIDE FOR LATER</div>
    <h1>Snoozed</h1>
    <p>Pull requests return automatically when their snooze expires.</p>
  </div>
</div>
<div class="snoozed-list" aria-busy={busy}>
  <div class="snoozed-summary">
    <span>{rows.length} snoozed pull request{rows.length === 1 ? '' : 's'}</span><span
      >Returning soonest first</span
    >
  </div>
  {#each rows as row (row.id)}
    <SnoozedRow
      {row}
      {now}
      {busy}
      stale={snapshot.staleIds.includes(row.id)}
      snoozeOptions={preferences.settings.snoozeOptions}
      {onopen}
      {onaction}
      {onrestore}
    />
  {:else}
    <div class="empty-column">
      <span aria-hidden="true">◷</span>
      <p>Nothing snoozed</p>
      <small>Snooze a pull request from its dashboard menu to set it aside for later.</small>
    </div>
  {/each}
</div>
