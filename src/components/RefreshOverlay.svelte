<script lang="ts">
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
</script>

<div class="refresh-overlay" role="status">
  <div class="refresh-overlay-card">
    <RefreshCw size={26} />
    <b>Refreshing pull requests…</b>
    <small>Fetching the latest from GitHub</small>
  </div>
</div>
