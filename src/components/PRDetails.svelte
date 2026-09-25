<script lang="ts">
  import { cardViewModel } from '../lib/pr/card-view-model';
  import type { ClassifiedPR } from '../lib/pr/classify';
  let { item, now, stale }: { item: ClassifiedPR; now: number; stale: boolean } = $props();
  let card = $derived(cardViewModel(item, now));
</script>

<span class="repo"
  >{card.pr.repository} <span class="number">#{card.pr.number}</span>
  <span class="author">{card.pr.author}</span></span
>
<strong>{card.pr.title}</strong>
<span class="badges"
  >{#each card.badges as badge}<span class="badge">{badge}</span>{/each}{#if card.reviewBadge}<span
      class="badge review {card.reviewBadge.tone}">{card.reviewBadge.label}</span
    >{/if}{#if card.staleness}<span class="badge staleness {card.staleness}">Stale</span>{/if}</span
>
<span class="status {card.state}"
  >{card.state === 'ready-to-merge' ? '✓' : card.state === 'needs-attention' ? '!' : '◷'}
  {card.primary}</span
>
{#if card.secondary}<span class="secondary">{card.secondary}</span>{/if}
<span class="age"
  >Updated {card.age}{#if stale}<span class="stale">
      · Refresh failed · may be out of date</span
    >{/if}</span
>
