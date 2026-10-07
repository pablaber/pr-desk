<script lang="ts">
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Check from '@lucide/svelte/icons/check';
  import Clock from '@lucide/svelte/icons/clock';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import X from '@lucide/svelte/icons/x';
  import { cardViewModel } from '../lib/pr/card-view-model';
  import type { ClassifiedPR } from '../lib/pr/classify';
  import type { PRLabel } from '../lib/store/app-state';
  let {
    item,
    now,
    stale,
    labels = [],
  }: { item: ClassifiedPR; now: number; stale: boolean; labels?: PRLabel[] } = $props();
  let card = $derived(cardViewModel(item, now));
  const checksTitles = {
    passing: 'Checks passing',
    pending: 'Checks running',
    failed: 'Checks failed',
  };
</script>

<span class="repo"
  >{card.pr.repository} <span class="number">#{card.pr.number}</span>
  <span class="author">{card.pr.author}</span></span
>
<strong>{card.pr.title}</strong>
<span class="badges"
  >{#each card.badges as badge}<span class="badge">{badge}</span>{/each}{#if card.reviewBadge}<span
      class="badge review {card.reviewBadge.tone}">{card.reviewBadge.label}</span
    >{/if}{#if card.checksBadge}<span
      class="badge checks {card.checksBadge}"
      title={checksTitles[card.checksBadge]}
      aria-label={checksTitles[card.checksBadge]}
      >{#if card.checksBadge === 'passing'}<Check
          size={10}
        />{:else if card.checksBadge === 'pending'}<LoaderCircle size={10} />{:else}<X
          size={10}
        />{/if} Checks</span
    >{/if}{#if card.staleness}<span class="badge staleness {card.staleness}">Stale</span
    >{/if}{#each labels as label (label.id)}<span class="badge label"
      ><i class="label-dot" style:--label-color={label.color}></i>{label.name}</span
    >{/each}</span
>
<span class="status {card.state}"
  >{#if card.state === 'ready-to-merge'}<Check
      size={12}
    />{:else if card.state === 'needs-attention'}<CircleAlert size={12} />{:else}<Clock
      size={12}
    />{/if}
  {card.primary}</span
>
{#if card.secondary}<span class="secondary">{card.secondary}</span>{/if}
<span class="age"
  >Updated {card.age}{#if stale}<span class="stale">
      · Refresh failed · may be out of date</span
    >{/if}</span
>
