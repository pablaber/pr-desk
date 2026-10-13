<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import type { PullRequest } from '../lib/pr/types';
  let { pr, ondone }: { pr: PullRequest; ondone: () => void } = $props();
</script>

<!-- Clicks pass through, so the board stays usable while the overlay plays out. -->
<div
  class="merge-celebration"
  role="status"
  onanimationend={(event) => {
    // The disc, rings and caption animate too; only the overlay's own fade ends it.
    if (event.target === event.currentTarget) ondone();
  }}
>
  <div class="burst">
    <span class="ring"></span><span class="ring later"></span>
    <span class="disc"><Check size={64} /></span>
    <span class="caption"><strong>Merged</strong>{pr.repository} #{pr.number}</span>
  </div>
</div>

<style>
  .merge-celebration {
    position: fixed;
    inset: 0;
    z-index: 8;
    display: grid;
    place-items: center;
    background: #18202b66;
    pointer-events: none;
    animation: merge-celebration-fade 2.2s ease-in-out both;
  }
  .burst {
    position: relative;
    display: grid;
    justify-items: center;
  }
  .disc {
    display: grid;
    place-items: center;
    width: 132px;
    height: 132px;
    border-radius: 50%;
    background: #287a3e;
    color: white;
    box-shadow: 0 18px 50px #287a3e55;
    animation: merge-celebration-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  /* The Lucide check path is about 22.6 units long; dashing it lets the tick draw itself. */
  .disc :global(.lucide path) {
    stroke-dasharray: 23;
    stroke-dashoffset: 23;
    animation: merge-celebration-draw 0.42s 0.28s cubic-bezier(0.65, 0, 0.35, 1) forwards;
  }
  .ring {
    position: absolute;
    top: 0;
    width: 132px;
    height: 132px;
    border: 2px solid #5fae6e;
    border-radius: 50%;
    opacity: 0;
    animation: merge-celebration-ripple 1.1s 0.35s ease-out forwards;
  }
  .ring.later {
    animation-delay: 0.55s;
  }
  .caption {
    display: grid;
    justify-items: center;
    gap: 2px;
    margin-top: 22px;
    color: white;
    font-size: 13px;
    text-shadow: 0 1px 8px #0004;
    animation: merge-celebration-rise 0.4s 0.5s ease-out both;
  }
  .caption strong {
    font-size: 26px;
    font-weight: 650;
    letter-spacing: -0.5px;
  }
  @keyframes merge-celebration-fade {
    from,
    to {
      opacity: 0;
    }
    8%,
    84% {
      opacity: 1;
    }
  }
  @keyframes merge-celebration-pop {
    from {
      transform: scale(0.2);
      opacity: 0;
    }
  }
  @keyframes merge-celebration-draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes merge-celebration-ripple {
    from {
      transform: scale(1);
      opacity: 0.8;
    }
    to {
      transform: scale(2.3);
      opacity: 0;
    }
  }
  @keyframes merge-celebration-rise {
    from {
      transform: translateY(8px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .disc,
    .caption {
      animation: none;
    }
    .disc :global(.lucide path) {
      animation: none;
      stroke-dashoffset: 0;
    }
    .ring {
      display: none;
    }
  }
</style>
