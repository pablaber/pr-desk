<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy';
  import { sessionErrors, type SessionError } from '../lib/debug/session-errors.svelte';
  let { oncopy }: { oncopy: (error: SessionError) => void } = $props();
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  let newestFirst = $derived([...sessionErrors].reverse());
</script>

<h3>Errors this session{sessionErrors.length ? ` · ${sessionErrors.length}` : ''}</h3>
<p>Kept until PR Desk quits. Copy one error on its own, or all of them with the debug info.</p>
{#each newestFirst as error (`${error.source}\n${error.message}`)}<div
    class="setting-row session-error"
  >
    <span
      ><code>{error.message}</code><small
        >{error.source} · {time(error.lastAt)}{error.count > 1
          ? ` · ${error.count} times since ${time(error.firstAt)}`
          : ''}</small
      ></span
    ><button
      type="button"
      aria-label="Copy error"
      title="Copy error"
      onclick={() => oncopy($state.snapshot(error) as SessionError)}><Copy size={12} /></button
    >
  </div>{:else}<p class="empty-setting">No errors this session.</p>{/each}
