<script lang="ts">
  import AlarmClock from '@lucide/svelte/icons/alarm-clock';
  import ArrowDownUp from '@lucide/svelte/icons/arrow-down-up';
  import BellDot from '@lucide/svelte/icons/bell-dot';
  import Bot from '@lucide/svelte/icons/bot';
  import Bug from '@lucide/svelte/icons/bug';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import FolderGit2 from '@lucide/svelte/icons/folder-git-2';
  import FunnelX from '@lucide/svelte/icons/funnel-x';
  import ListChecks from '@lucide/svelte/icons/list-checks';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Plug from '@lucide/svelte/icons/plug';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import X from '@lucide/svelte/icons/x';
  import ZoomIn from '@lucide/svelte/icons/zoom-in';
  import { githubErrorMessage } from '../lib/github/errors';
  import DockBadge from './DockBadge.svelte';
  import Ignored from './Ignored.svelte';
  import InterfaceScaleControl from './InterfaceScale.svelte';
  import RefreshInterval from './RefreshInterval.svelte';
  import SettingsTransfer from './SettingsTransfer.svelte';
  import SnoozeOptions from './SnoozeOptions.svelte';
  import type {
    AppState,
    CheckRule,
    DockBadgeMode,
    InterfaceScale,
    SettingsConfig,
    SnoozeOption,
    IgnoreRuleKind,
  } from '../lib/store/app-state';
  import type { DashboardSnapshot } from '../lib/github/refresh';
  import type { GhCliInfo } from '../lib/github/types';
  let {
    open,
    login,
    cliInfo,
    cliInfoError,
    preferences,
    saved,
    snapshot,
    now,
    busy,
    listBusy,
    dirty,
    error,
    ondismisserror,
    onclose,
    onadd,
    onremove,
    onaddcheckrule,
    onremovecheckrule,
    onsave,
    ondiscard,
    onrefreshinterval,
    ondockbadge,
    interfaceScale,
    oninterfacescale,
    onsnoozeoptions,
    onopen,
    onunignore,
    oncopydebuginfo,
    oncopysettings,
    onimportsettings,
  }: {
    open: boolean;
    login: string;
    cliInfo: GhCliInfo | null;
    cliInfoError: boolean;
    preferences: AppState;
    // The ignored list acts immediately, so it reads the saved preferences rather than the draft.
    saved: AppState;
    snapshot: DashboardSnapshot;
    now: number;
    busy: boolean;
    listBusy: boolean;
    dirty: boolean;
    // The app's alert sits behind the overlay, so Settings shows the same message itself.
    error: string;
    ondismisserror: () => void;
    onclose: () => void;
    onadd: (kind: 'repo' | 'pr' | 'bot' | IgnoreRuleKind, value: string) => Promise<boolean>;
    onremove: (kind: 'repo' | 'pr' | 'bot' | IgnoreRuleKind, value: string) => void;
    onaddcheckrule: (repository: string, check: string) => boolean;
    onremovecheckrule: (rule: CheckRule) => void;
    onsave: () => Promise<boolean>;
    ondiscard: () => void;
    onrefreshinterval: (minutes: number) => Promise<void>;
    ondockbadge: (mode: DockBadgeMode) => Promise<void>;
    interfaceScale: InterfaceScale;
    oninterfacescale: (scale: InterfaceScale) => Promise<void>;
    onsnoozeoptions: (options: SnoozeOption[]) => Promise<void>;
    onopen: (url: string) => void;
    onunignore: (id: string) => void;
    oncopydebuginfo: () => void;
    oncopysettings: () => void;
    onimportsettings: (config: SettingsConfig) => Promise<boolean>;
  } = $props();
  type Section =
    | 'github'
    | 'refresh'
    | 'badge'
    | 'scale'
    | 'snooze'
    | 'tracked'
    | 'watched'
    | 'bots'
    | 'ignore-rules'
    | 'ignored'
    | 'check-rules'
    | 'transfer'
    | 'troubleshooting';
  const groups: { label: string; items: { id: Section; title: string; icon: typeof Plug }[] }[] = [
    {
      label: 'GENERAL',
      items: [
        { id: 'github', title: 'GitHub', icon: Plug },
        { id: 'refresh', title: 'Automatic refresh', icon: RefreshCw },
        { id: 'badge', title: 'Dock badge', icon: BellDot },
        { id: 'scale', title: 'Interface size', icon: ZoomIn },
        { id: 'snooze', title: 'Snooze options', icon: AlarmClock },
      ],
    },
    {
      label: 'PULL REQUESTS',
      items: [
        { id: 'tracked', title: 'Tracked repositories', icon: FolderGit2 },
        { id: 'watched', title: 'Watched pull requests', icon: Eye },
        { id: 'bots', title: 'Known bots', icon: Bot },
        { id: 'ignore-rules', title: 'Ignore rules', icon: FunnelX },
        { id: 'ignored', title: 'Ignored pull requests', icon: EyeOff },
        { id: 'check-rules', title: 'Non-blocking checks', icon: ListChecks },
      ],
    },
  ];
  const transfer = { id: 'transfer', title: 'Import & export', icon: ArrowDownUp } as const;
  const troubleshooting = { id: 'troubleshooting', title: 'Troubleshooting', icon: Bug } as const;
  const titles = Object.fromEntries(
    [...groups.flatMap((g) => g.items), transfer, troubleshooting].map((i) => [i.id, i.title]),
  ) as Record<Section, string>;
  // Kept while the app runs, so reopening Settings returns to the section last used.
  let section = $state<Section>('github');
  let dialog = $state<HTMLDialogElement>();
  // showModal() brings the focus trap, inert background and top-layer stacking with it.
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) {
      dialog.close();
      // A field inside the closed dialog would otherwise keep focus and swallow the app's hotkeys.
      if (document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement))
        document.activeElement.blur();
    }
  });
  let ignoreKind = $state<IgnoreRuleKind>('repository');
  const ignoreLabels = { repository: 'Repository', author: 'PR author', title: 'PR title' };
  let ignoreValue = $state(''),
    repository = $state(''),
    pr = $state('');
  let checkRepository = $state(''),
    checkName = $state('');
  let bot = $state('');
  let repositoryError = $state('');
  // Adding a repository or a watched PR asks GitHub whether it exists before the value joins the
  // draft, so each of those two fields shows its own in-field progress while that check runs.
  let checking = $state({ repo: false, pr: false, bot: false });

  function heading(label: string, count: number): string {
    return count > 0 ? `${label} · ${count}` : label;
  }
  async function submit(field: 'repo' | 'pr' | 'bot', value: string) {
    if (checking[field]) return;
    checking[field] = true;
    if (field === 'repo') repositoryError = '';
    try {
      if (await onadd(field, value)) {
        if (field === 'repo') repository = '';
        else if (field === 'bot') bot = '';
        else pr = '';
      }
    } catch (error) {
      if (field === 'repo') repositoryError = githubErrorMessage(error);
      else throw error;
    } finally {
      checking[field] = false;
    }
  }
</script>

{#snippet navItem(item: { id: Section; title: string; icon: typeof Plug })}
  <button
    type="button"
    class:active={section === item.id}
    aria-current={section === item.id ? 'page' : undefined}
    onclick={() => (section = item.id)}><item.icon size={15} /> {item.title}</button
  >
{/snippet}

<dialog
  bind:this={dialog}
  class="settings-dialog"
  aria-labelledby="settings-title"
  oncancel={(event) => {
    // Escape asks to close rather than closing outright, so unsaved edits can be confirmed first.
    event.preventDefault();
    onclose();
  }}
>
  <div class="settings-sidebar">
    <button type="button" class="quiet settings-back" onclick={onclose}
      ><ChevronLeft size={14} /> Back<kbd aria-hidden="true">esc</kbd></button
    >
    <h1 id="settings-title">Settings</h1>
    <p>Choose what belongs on your desk.</p>
    <nav aria-label="Settings sections">
      {#each groups as group (group.label)}
        <div class="nav-label">{group.label}</div>
        {#each group.items as item (item.id)}{@render navItem(item)}{/each}
      {/each}
      <div class="settings-nav-bottom">
        {@render navItem(transfer)}{@render navItem(troubleshooting)}
      </div>
    </nav>
  </div>
  <div class="settings-content">
    <div class="toolbar">
      <span>Settings / {titles[section]}</span>
    </div>
    {#if error}<div class="alert" role="alert">
        {error}<button onclick={ondismisserror} aria-label="Dismiss error"><X size={14} /></button>
      </div>{/if}
    <div class="settings">
      {#if section === 'github'}
        <section
          id="settings-section-github"
          class="settings-section github-info"
          aria-labelledby="settings-section-heading"
        >
          <h2 id="settings-section-heading">GitHub</h2>
          <p>The account and GitHub CLI that PR Desk reads pull requests through.</p>
          <dl>
            <div>
              <dt>Dashboard account</dt>
              <dd>@{login}</dd>
            </div>
            <div>
              <dt>Host</dt>
              <dd>github.com</dd>
            </div>
            <div>
              <dt>GitHub CLI</dt>
              <dd aria-live="polite">
                {cliInfo ? cliInfo.version : cliInfoError ? 'Unavailable' : 'Loading…'}
              </dd>
            </div>
            {#if cliInfo}
              <div>
                <dt>Executable</dt>
                <dd><code>{cliInfo.path}</code></dd>
              </div>
            {/if}
          </dl>
          {#if cliInfoError}
            <p role="status">Couldn’t read GitHub CLI details. Reopen Settings to try again.</p>
          {/if}
          <p>
            Authentication is managed by gh. Restart PR Desk after switching accounts in Terminal.
          </p>
          <p class="settings-note">
            GitHub.com · Authentication managed by gh · Preferences stored on this Mac
          </p>
        </section>
      {:else if section === 'refresh'}
        <section
          id="settings-section-refresh"
          class="settings-section"
          aria-labelledby="settings-section-heading"
        >
          <h2 id="settings-section-heading">Automatic refresh</h2>
          <p>Refresh GitHub data while the app is running. Manual refresh is always available.</p>
          <RefreshInterval
            minutes={preferences.settings.automaticRefreshMinutes}
            {busy}
            onsave={onrefreshinterval}
          />
        </section>
      {:else if section === 'badge'}
        <section
          id="settings-section-badge"
          class="settings-section"
          aria-labelledby="settings-section-heading"
        >
          <h2 id="settings-section-heading">Dock badge</h2>
          <p>Show a count on the PR Desk Dock icon.</p>
          <DockBadge mode={preferences.settings.dockBadge} {busy} onsave={ondockbadge} />
        </section>
      {:else if section === 'scale'}
        <section
          id="settings-section-scale"
          class="settings-section"
          aria-labelledby="settings-section-heading"
        >
          <h2 id="settings-section-heading">Interface size</h2>
          <p>Scale the whole interface up or down.</p>
          <InterfaceScaleControl scale={interfaceScale} {busy} onsave={oninterfacescale} />
        </section>
      {:else if section === 'snooze'}
        <section
          id="settings-section-snooze"
          class="settings-section"
          aria-labelledby="settings-section-heading"
        >
          <h2 id="settings-section-heading">
            {heading('Snooze options', preferences.settings.snoozeOptions.length)}
          </h2>
          <p>
            Choose up to five snooze choices for the PR card menu. Custom date is always offered and
            does not count toward the five.
          </p>
          <SnoozeOptions
            options={preferences.settings.snoozeOptions}
            {busy}
            onsave={onsnoozeoptions}
          />
        </section>
      {:else if section === 'tracked'}
        <section
          id="settings-section-tracked"
          class="settings-section"
          aria-labelledby="settings-section-heading"
        >
          <h2 id="settings-section-heading">
            {heading('Tracked repositories', preferences.trackedRepositories.length)}
          </h2>
          <p>
            Show all open PRs from these repositories under Needs attention. Drafts stay in Waiting.
          </p>
          <form
            onsubmit={(e) => {
              e.preventDefault();
              void submit('repo', repository);
            }}
          >
            <span class="settings-field">
              <input
                aria-label="Repository"
                autocapitalize="off"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                aria-invalid={repositoryError ? true : undefined}
                aria-describedby={repositoryError ? 'repository-error' : undefined}
                oninput={() => (repositoryError = '')}
                placeholder="owner/repository"
                bind:value={repository}
                required
                disabled={busy}
              />
              {#if checking.repo}<LoaderCircle
                  class="field-spinner"
                  size={14}
                  role="status"
                  aria-label="Checking repository on GitHub"
                />{/if}
            </span><button class="primary-button" disabled={busy || checking.repo}
              >Add repository</button
            >
          </form>
          {#if repositoryError}
            <p id="repository-error" class="field-error" role="alert">{repositoryError}</p>
          {/if}
          {#each preferences.trackedRepositories as repo}<div class="setting-row">
              <code>{repo}</code><button disabled={busy} onclick={() => onremove('repo', repo)}
                >Remove</button
              >
            </div>{:else}<p class="empty-setting">No repositories tracked yet.</p>{/each}
        </section>
      {:else if section === 'watched'}
        <section
          id="settings-section-watched"
          class="settings-section"
          aria-labelledby="settings-section-heading"
        >
          <h2 id="settings-section-heading">
            {heading('Watched pull requests', preferences.watchedPullRequests.length)}
          </h2>
          <p>Keep an individual PR here, even if you don’t track its repository.</p>
          <form
            onsubmit={(e) => {
              e.preventDefault();
              void submit('pr', pr);
            }}
          >
            <span class="settings-field">
              <input
                aria-label="Pull request URL"
                autocapitalize="off"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                placeholder="https://github.com/owner/repo/pull/123"
                bind:value={pr}
                required
                disabled={busy}
              />
              {#if checking.pr}<LoaderCircle
                  class="field-spinner"
                  size={14}
                  role="status"
                  aria-label="Checking pull request on GitHub"
                />{/if}
            </span><button class="primary-button" disabled={busy || checking.pr}>Watch PR</button>
          </form>
          {#each preferences.watchedPullRequests as id}<div class="setting-row">
              <code>{id}</code><button disabled={busy} onclick={() => onremove('pr', id)}
                >Remove</button
              >
            </div>{:else}<p class="empty-setting">No individually watched PRs.</p>{/each}
        </section>
      {:else if section === 'bots'}
        <section
          id="settings-section-bots"
          class="settings-section"
          aria-labelledby="settings-section-heading"
        >
          <h2 id="settings-section-heading">
            {heading('Known bots', preferences.knownBots.length)}
          </h2>
          <p>
            PRs by these bots in tracked repositories or watched PRs move to Ready to merge once
            approved, and can be merged from PR Desk. Add a GitHub App as name[bot], such as
            renovate[bot], or a machine user account by its exact login.
          </p>
          <form
            onsubmit={(e) => {
              e.preventDefault();
              void submit('bot', bot);
            }}
          >
            <span class="settings-field">
              <input
                aria-label="Bot name"
                autocapitalize="off"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                placeholder="dependabot[bot]"
                bind:value={bot}
                required
                disabled={busy}
              />
            </span><button class="primary-button" disabled={busy}>Add bot</button>
          </form>
          {#each preferences.knownBots as name}<div class="setting-row">
              <code>{name}</code><button disabled={busy} onclick={() => onremove('bot', name)}
                >Remove</button
              >
            </div>{:else}<p class="empty-setting">No known bots.</p>{/each}
        </section>
      {:else if section === 'ignore-rules'}
        <section
          class="settings-section"
          id="settings-section-ignored-rules"
          aria-labelledby="settings-section-heading"
        >
          <h2 id="settings-section-heading">
            {heading('Ignore rules', preferences.ignoreRules.length)}
          </h2>
          <p>
            Hide PRs matching any rule, including your own, review requests, tracked and watched
            PRs. Remove a rule to make matching PRs eligible to appear on the next refresh.
          </p>
          <form
            onsubmit={async (e) => {
              e.preventDefault();
              if (await onadd(ignoreKind, ignoreValue)) ignoreValue = '';
            }}
          >
            <select aria-label="Ignore rule type" bind:value={ignoreKind} disabled={busy}>
              <option value="repository">Repository</option>
              <option value="author">PR author</option>
              <option value="title">PR title</option>
            </select>
            <input
              aria-label="Ignore rule"
              autocapitalize="off"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              aria-describedby="ignore-rule-help"
              placeholder={ignoreKind === 'repository'
                ? 'acme/*'
                : ignoreKind === 'author'
                  ? 'dependabot[bot]'
                  : 'chore:*'}
              bind:value={ignoreValue}
              required
              disabled={busy}
            />
            <button class="primary-button" disabled={busy}>Add ignore rule</button>
          </form>
          <p id="ignore-rule-help">
            {#if ignoreKind === 'repository'}
              Use owner/repository, acme/*, */docs, or acme/service-?.
            {:else if ignoreKind === 'author'}
              Use an exact GitHub login without @, such as octocat or dependabot[bot].
            {:else}
              Use chore:* for titles starting with “chore:”, or *dependenc* for titles containing
              “dependenc”.
            {/if}
            Matching is case-insensitive.
            {#if ignoreKind !== 'author'}
              Patterns match the entire {ignoreKind === 'repository' ? 'repository name' : 'title'}:
              * matches zero or more characters; ? matches exactly one. All other characters are
              literal.
            {/if}
          </p>
          {#each preferences.ignoreRules as rule}<div class="setting-row">
              <span>{ignoreLabels[rule.kind]}: <code>{rule.value}</code></span><button
                disabled={busy}
                onclick={() => onremove(rule.kind, rule.value)}>Remove</button
              >
            </div>{:else}<p class="empty-setting">No ignore rules.</p>{/each}
          <p>
            PRs ignored one at a time with Ignore PR are listed under Ignored pull requests.
            Unignoring one there leaves any rule above in effect.
          </p>
        </section>
      {:else if section === 'ignored'}
        <section
          id="settings-section-ignored"
          class="settings-section"
          aria-labelledby="settings-section-heading"
        >
          <h2 id="settings-section-heading">
            {heading('Ignored pull requests', Object.keys(saved.ignoredPullRequests).length)}
          </h2>
          <p>
            Unignore a pull request to make it eligible for the dashboard again. Closed or
            inaccessible PRs stay listed here.
          </p>
          <Ignored
            preferences={saved}
            {snapshot}
            {login}
            {now}
            busy={listBusy}
            {onopen}
            {onunignore}
          />
        </section>
      {:else if section === 'check-rules'}
        <section
          class="settings-section"
          id="settings-section-check-rules"
          aria-labelledby="settings-section-heading"
        >
          <h2 id="settings-section-heading">
            {heading('Non-blocking checks', preferences.checkRules.length)}
          </h2>
          <p>
            A pending check matching a rule no longer keeps an approved PR out of Ready to merge.
            Failed checks still need attention. These PRs have no Merge button here, so open them on
            GitHub to finish, for example with atlantis apply.
          </p>
          <form
            onsubmit={(e) => {
              e.preventDefault();
              if (onaddcheckrule(checkRepository, checkName)) checkRepository = checkName = '';
            }}
          >
            <input
              aria-label="Check rule repository"
              autocapitalize="off"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              placeholder="acme/terraform-*"
              bind:value={checkRepository}
              required
              disabled={busy}
            />
            <input
              aria-label="Check rule check name"
              autocapitalize="off"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              placeholder="policy-bot"
              bind:value={checkName}
              required
              disabled={busy}
            />
            <button class="primary-button" disabled={busy}>Add check rule</button>
          </form>
          <p>
            Both fields are case-insensitive and accept * and ? wildcards, such as atlantis/* for
            the check name.
          </p>
          {#each preferences.checkRules as rule}<div class="setting-row">
              <span><code>{rule.repository}</code> · <code>{rule.check}</code></span><button
                disabled={busy}
                onclick={() => onremovecheckrule(rule)}>Remove</button
              >
            </div>{:else}<p class="empty-setting">No check rules.</p>{/each}
        </section>
      {:else if section === 'transfer'}
        <section
          id="settings-section-transfer"
          class="settings-section"
          aria-labelledby="settings-section-heading"
        >
          <h2 id="settings-section-heading">Import &amp; export</h2>
          <SettingsTransfer {busy} {dirty} oncopy={oncopysettings} onimport={onimportsettings} />
        </section>
      {:else}
        <section
          id="settings-section-troubleshooting"
          class="settings-section"
          aria-labelledby="settings-section-heading"
        >
          <h2 id="settings-section-heading">Troubleshooting</h2>
          <p>
            Copy the current board, refresh results and saved preferences as JSON, including how
            each PR was placed. It contains repository names, PR titles and logins, but no
            credentials.
          </p>
          <button type="button" class="settings-action" onclick={oncopydebuginfo}
            ><Bug size={13} /> Copy debug info</button
          >
        </section>
      {/if}
    </div>
    {#if dirty}
      <div class="settings-save-bar" role="region" aria-label="Unsaved settings">
        <span>Unsaved changes. Tracking takes effect after you save.</span>
        <div>
          <button type="button" disabled={busy} onclick={ondiscard}>Discard</button>
          <button type="button" class="primary-button" disabled={busy} onclick={() => void onsave()}
            >{busy ? 'Saving…' : 'Save changes'}</button
          >
        </div>
      </div>
    {/if}
  </div>
</dialog>
