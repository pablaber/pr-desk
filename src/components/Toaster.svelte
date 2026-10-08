<script lang="ts">
  import { onDestroy } from 'svelte';
  import { pauseToasts, resumeToasts, toasts } from '../lib/toast/toasts.svelte';
  // Removed while hovered, this toaster never sees mouseleave, so the timers must resume here.
  onDestroy(resumeToasts);
</script>

<div class="toasts" role="status" onmouseenter={pauseToasts} onmouseleave={resumeToasts}>
  {#each toasts as toast (toast.id)}
    <div class="toast"><toast.icon size={14} /><span>{toast.message}</span></div>
  {/each}
</div>
