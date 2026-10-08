<script lang="ts">
  import Bot from '@lucide/svelte/icons/bot';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Check from '@lucide/svelte/icons/check';
  import Clock from '@lucide/svelte/icons/clock';
  import Eye from '@lucide/svelte/icons/eye';
  import FileDiff from '@lucide/svelte/icons/file-diff';
  import FolderGit2 from '@lucide/svelte/icons/folder-git-2';
  import GitPullRequestArrow from '@lucide/svelte/icons/git-pull-request-arrow';
  import Hourglass from '@lucide/svelte/icons/hourglass';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import ThumbsUp from '@lucide/svelte/icons/thumbs-up';
  import UserRound from '@lucide/svelte/icons/user-round';
  import X from '@lucide/svelte/icons/x';
  import { cardViewModel, type SourceBadge } from '../lib/pr/card-view-model';
  import type { ClassifiedPR } from '../lib/pr/classify';
  import type { PRLabel } from '../lib/store/app-state';
  let {
    item,
    now,
    stale,
    labels = [],
    compact = false,
  }: {
    item: ClassifiedPR;
    now: number;
    stale: boolean;
    labels?: PRLabel[];
    // A stack names the repository once and drops each layer's source badges.
    compact?: boolean;
  } = $props();
  let card = $derived(cardViewModel(item, now));
  // Tracked, watched and bot icons match their Settings sections, tying each badge to its setting.
  const sourceIcons: Record<SourceBadge, typeof Bot> = {
    owned: UserRound,
    'direct-review-request': GitPullRequestArrow,
    'tracked-repository': FolderGit2,
    watched: Eye,
    bot: Bot,
  };
  const checksTitles = {
    passing: 'Checks passing',
    pending: 'Checks running',
    failed: 'Checks failed',
  };
</script>

<span class="repo"
  >{#if !compact}{card.pr.repository}{/if} <span class="number">#{card.pr.number}</span>
  <span class="author">{card.pr.author}</span></span
>
<strong>{card.pr.title}</strong>
<span class="badges"
  >{#each compact ? [] : card.badges as badge (badge.kind)}{@const Icon =
      sourceIcons[badge.kind]}<span class="badge"><Icon size={10} /> {badge.label}</span
    >{/each}{#if card.reviewBadge}<span class="badge review {card.reviewBadge.tone}"
      >{#if card.reviewBadge.tone === 'approved'}<ThumbsUp size={10} />{:else}<FileDiff
          size={10}
        />{/if}
      {card.reviewBadge.label}</span
    >{/if}{#if card.checksBadge}<span
      class="badge checks {card.checksBadge}"
      title={checksTitles[card.checksBadge]}
      aria-label={checksTitles[card.checksBadge]}
      >{#if card.checksBadge === 'passing'}<Check
          size={10}
        />{:else if card.checksBadge === 'pending'}<LoaderCircle size={10} />{:else}<X
          size={10}
        />{/if} Checks</span
    >{/if}{#if card.staleness}<span class="badge staleness {card.staleness}"
      ><Hourglass size={10} /> Stale</span
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
