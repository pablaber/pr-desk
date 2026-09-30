<script lang="ts">
  import { pauseToasts, resumeToasts, toasts } from '../lib/toast/toasts.svelte';
</script>

<div class="toasts" role="status" onmouseenter={pauseToasts} onmouseleave={resumeToasts}>
  {#each toasts as toast (toast.id)}
    <div class="toast"><toast.icon size={14} /><span>{toast.message}</span></div>
  {/each}
</div>
