<script lang="ts">
  import GitMerge from '@lucide/svelte/icons/git-merge';
  import type { CompletedSnapshot } from '../lib/github/completed';
  import { COMPLETED_DAYS } from '../lib/github/completed';
  import { completedGroups } from '../lib/pr/completed';
  let {
    snapshot,
    loading,
    now,
    onopen,
  }: {
    snapshot: CompletedSnapshot | null;
    loading: boolean;
    now: number;
    onopen: (url: string) => void;
  } = $props();
  let groups = $derived(completedGroups(snapshot?.prs ?? [], now));
  let count = $derived(snapshot?.prs.length ?? 0);
</script>

<div class="dashboard-heading">
  <div>
    <div class="eyebrow">RECENTLY MERGED</div>
    <h1>Completed</h1>
    <p>Pull requests merged in the last {COMPLETED_DAYS} days that you authored or reviewed.</p>
  </div>
</div>
<div class="completed-list" aria-busy={loading}>
  {#each snapshot?.warnings ?? [] as warning (warning)}
    <div class="alert" role="status">{warning}</div>
  {/each}
  {#if snapshot}
    <div class="completed-summary">
      <span>{count} merged pull request{count === 1 ? '' : 's'}</span><span>Most recent first</span>
    </div>
  {/if}
  {#each groups as group (group.key)}
    <section class="completed-group" aria-label={group.label}>
      <h2>{group.label}</h2>
      {#each group.prs as pr (pr.id)}
        <button
          class="card-main completed-row"
          aria-label={`Open ${pr.title} on GitHub`}
          onclick={() => onopen(pr.url)}
        >
          <span class="repo"
            >{pr.repository} <span class="number">#{pr.number}</span>
            <span class="author">{pr.author}</span></span
          >
          <strong>{pr.title}</strong>
          <span class="secondary"
            >Merged
            {new Date(pr.mergedAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}{#if pr.mergedBy}
              by {pr.mergedBy}{/if}</span
          >
        </button>
      {/each}
    </section>
  {:else}
    <div class="empty-column">
      <span><GitMerge size={24} /></span>
      <p>{loading ? 'Loading merged pull requests…' : 'Nothing merged recently'}</p>
      {#if !loading}<small
          >Pull requests you authored, reviewed or were asked to review appear here for {COMPLETED_DAYS}
          days after they merge.</small
        >{/if}
    </div>
  {/each}
</div>
