<script lang="ts">
  import { SUGGESTED_TITLE_TAG_RULES, titleTags } from '../lib/pr/title-tags';
  import type { PullRequest } from '../lib/pr/types';
  import type { TitleTagRule } from '../lib/store/app-state';
  let {
    rules,
    prs,
    busy,
    onadd,
    onremove,
  }: {
    rules: TitleTagRule[];
    prs: PullRequest[];
    busy: boolean;
    // Throws the validation message, which shows under the field.
    onadd: (pattern: string) => boolean;
    onremove: (rule: TitleTagRule) => void;
  } = $props();
  let pattern = $state('');
  let patternError = $state('');
  function add(value: string): boolean {
    patternError = '';
    try {
      return onadd(value);
    } catch (error) {
      patternError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }
  function preview(rule: TitleTagRule): string {
    const perPR = prs.map((pr) => titleTags(pr.title, [rule]));
    const matched = perPR.filter((tags) => tags.length).length;
    if (!matched) return 'No matches on the board';
    const names = [...new Set(perPR.flat().map((tag) => tag.name))];
    const shown = names.slice(0, 5).join(', ') + (names.length > 5 ? ', …' : '');
    return `${shown} · ${matched} PR${matched === 1 ? '' : 's'}`;
  }
</script>

<form
  onsubmit={(e) => {
    e.preventDefault();
    if (add(pattern)) pattern = '';
  }}
>
  <span class="settings-field">
    <input
      aria-label="Title tag pattern"
      autocapitalize="off"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      aria-invalid={patternError ? true : undefined}
      aria-describedby={patternError ? 'title-tag-error' : undefined}
      oninput={() => (patternError = '')}
      placeholder="\b([A-Z]+-\d+)\b"
      bind:value={pattern}
      required
      disabled={busy}
    />
  </span><button class="primary-button" disabled={busy}>Add rule</button>
</form>
{#if patternError}
  <p id="title-tag-error" class="field-error" role="alert">{patternError}</p>
{/if}
{#each rules as rule (rule.pattern)}<div class="setting-row">
    <span><code>{rule.pattern}</code><small>{preview(rule)}</small></span><button
      disabled={busy}
      onclick={() => onremove(rule)}>Remove</button
    >
  </div>{:else}<p class="empty-setting">No title tag rules.</p>{/each}
<h3>Suggested rules</h3>
{#each SUGGESTED_TITLE_TAG_RULES as suggestion (suggestion.pattern)}
  {@const added = rules.some((rule) => rule.pattern === suggestion.pattern)}
  {@const [tag] = titleTags(suggestion.example, [suggestion])}
  <div class="setting-row">
    <span
      >{suggestion.description}<small
        >{suggestion.example} →
        <span class="badge title-tag" style:--tag-color={tag.color}>{tag.name}</span></small
      ><small><code>{suggestion.pattern}</code></small></span
    ><button
      disabled={busy || added}
      aria-label={added ? undefined : `Add rule: ${suggestion.description}`}
      onclick={() => add(suggestion.pattern)}>{added ? 'Added' : 'Add'}</button
    >
  </div>
{/each}
