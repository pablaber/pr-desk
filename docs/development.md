# Development

PR Desk is a Tauri 2 (Rust) shell around a Svelte 5, TypeScript, and Vite frontend.
This guide covers local development, architecture, testing, and release maintenance.
For installation and product behavior, start with the [README](../README.md).

## Prerequisites

Development requires macOS with the Xcode Command Line Tools, Node.js 22.12+ or 24+
(CI uses 24), rustup, and an authenticated GitHub CLI. The repository pins Rust 1.94.0;
rustup installs it without changing your global default.

```sh
brew install gh
gh auth login --hostname github.com
gh auth status --hostname github.com
```

## Run locally

Run commands from the repository root:

```sh
npm ci
npm run tauri dev
```

`npm run tauri dev` starts Vite and opens a native PR Desk window. Svelte, TypeScript,
and CSS edits update automatically; Rust edits trigger a rebuild and restart. Stop the
development session with `Ctrl+C` in the terminal.

The development app uses your real GitHub account and shares saved preferences with
the packaged app; it does not use separate demo data or storage.

`npm run dev` runs only the frontend and displays a native-app setup message. GitHub
access and persistence require Tauri.

## Architecture

- `src-tauri/src/main.rs`: narrow asynchronous bridge for `gh auth status` and
  read-only GraphQL. It discovers `gh` in `/opt/homebrew/bin`, `/usr/local/bin`, and the
  inherited `PATH`. Commands use argument arrays, never a shell, have a 45-second
  timeout, and never return authentication output or retrieve tokens.
- `src/lib/github/`: replaceable `GitHubService`, queries, pagination, raw response
  types, normalization, and refresh orchestration. At most four source/detail requests
  run concurrently. Failed sources or PRs retain their last in-memory results and show
  a stale warning.
- `src/lib/pr/`: normalized model → signals → declarative dashboard rules →
  classification and sorting → card view models.
- `src/lib/store/`: versioned local preferences and canonical input validation.
- `src/components/` and `src/App.svelte`: dashboard, filters, cards, menus, setup and
  error states, and settings.

### Icons

Interface icons come from [`@lucide/svelte`](https://lucide.dev/guide/svelte) (ISC
licensed), the single icon library for the app. Import each icon by its own path — for
example `import Clock from '@lucide/svelte/icons/clock'` — so only the icons actually
used enter the bundle. Icons compile to inline SVG, so nothing is fetched at runtime.

Call sites pass only `size`; stroke weight, colour and text alignment come from the one
`.lucide` rule in `src/style.css`. Lucide marks an icon `aria-hidden` unless it is given
an `aria-*`, `role` or `title` prop, which is what decorative icons beside a text label
want; icon-only controls carry their own `aria-label` on the surrounding button.

The PR Desk brand mark (`src-tauri/icons/source.svg`) and the Tauri app icons are
project artwork and are not part of this set.

## Local state

Tauri Store writes `preferences.json` to the app data directory (on macOS,
`~/Library/Application Support/dev.prdesk.desktop/`). The `state` key contains:

```json
{
  "schemaVersion": 4,
  "trackedRepositories": ["owner/repository"],
  "watchedPullRequests": ["owner/repository#123"],
  "ignoredRepositories": [],
  "ignoredPullRequests": {
    "owner/repository#456": { "ignoredAt": "2026-09-24T12:00:00Z" }
  },
  "snoozedPullRequests": {
    "owner/repository#789": { "until": "2026-09-25T13:00:00Z" }
  },
  "settings": {
    "automaticRefreshMinutes": 5,
    "snoozeOptions": [
      { "kind": "duration", "amount": 1, "unit": "hours" },
      { "kind": "next", "day": "monday", "hour": 9 }
    ]
  }
}
```

No PR titles, GitHub status, or credentials are persisted. Repository and PR
identifiers are canonicalized to lowercase. Unsupported storage versions stop loading
without overwriting the file. Closed, merged, deleted, or temporarily inaccessible PRs
do not erase their saved preferences.

Ignoring a repository overrides every source, including owned PRs, direct review
requests, tracked repositories, and watched PRs. Removing the ignore restores normal
tracking without losing tracked or watched preferences.

Settings holds up to five snooze options. Each can be a duration or a `Next` time
anchor; cards also offer a custom local date/time. An in-memory clock checks expiry
every 15 seconds. The Snoozed screen restores snoozed PRs, and Settings → Ignored links to
the Ignored pull requests screen, whose only PR action is unignoring an individual PR;
broad repository, author, and title rules stay in Settings.

## Rules and sorting

Edit `src/lib/pr/dashboard-rules.ts` to change priorities, predicates, destination
states, or labels. Ignore, active snooze, and closed state hide a PR before rules run.
All matching actionable labels are retained; the highest-priority rule determines the
column and primary label:

1. Direct individual review request.
2. Active unresolved threads on an owned PR.
3. GitHub's aggregate changes-requested decision on an owned PR.
4. Failed required checks on an owned PR.
5. Merge conflicts on an owned PR.
6. Owned, non-draft, approved, required checks passing, mergeable, and a compatible
   GitHub merge state → Ready to Merge.
7. Any other non-draft PR from a tracked repository → Needs Attention, labelled
   “Open in a tracked repository”.
8. Waiting fallback.

Unknown, blocked, behind, draft, and otherwise non-ready merge states prevent Ready to
Merge. Tracked-repository and waiting are catch-alls and do not appear in a card's
secondary status list. Optional failures may be displayed without creating attention.
Source badges are independent of classification.

Sorting is centralized in `classify.ts`: attention priority then oldest update; ready
oldest update; waiting newest update. GitHub does not expose when a PR entered these
derived states, so `updatedAt` approximates time in state.

## Refresh behavior

Automatic refresh defaults to five minutes and can be configured from 1 to 60 minutes
or disabled. Each interval begins after the previous refresh completes; manual refresh
and setting changes restart the timer, and requests never overlap. A separate 15-second
clock updates ages and snooze visibility.

## Verification

Run the same checks used by CI before pushing:

```sh
npm run format
npm run check
npm test
node --test scripts/update-homebrew.test.mjs
npm run build

cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Playwright is part of CI but is normally skipped locally. Run it for significant
UI-visible changes or edits to `e2e/`:

```sh
npx playwright install chromium
npm run test:e2e
```

Playwright exercises the real Svelte UI with a mocked Tauri boundary. Mock fixtures
never ship in the app.

### Update the README screenshot

After a meaningful dashboard UI change, regenerate the screenshot from the same mock
data used by the browser tests:

```sh
npm run screenshot:readme
```

The command runs the focused dashboard test and replaces
`docs/assets/pr-desk-dashboard.png` only after the test passes. Review the resulting
image before committing it.

## Local builds

```sh
npm run tauri build
# App: src-tauri/target/release/bundle/macos/PR Desk.app
```

This produces an ad-hoc signed local app. `npm run tauri build -- --debug` creates a
faster development bundle under `src-tauri/target/debug/bundle/macos/`. Developer ID
signing and notarization run only in the release workflow.

An alternative installation script can install the latest published release into
`~/Applications` for an authenticated account with repository access:

```sh
gh repo clone pablaber/pr-desk
cd pr-desk
./scripts/install.sh
```

Run the script again to upgrade. It verifies the app's signature and identifier before
replacement and preserves preferences. Set `PR_DESK_INSTALL_DIR` to choose another
writable directory.

## Release maintenance

Release Please owns `package.json`'s version, `.release-please-manifest.json`, and
`CHANGELOG.md`. The unpublished Rust crate remains at `0.0.0`. Squash merges must use
the PR title as their commit subject; `feat:` releases a minor version, `fix:` releases
a patch, and a breaking change releases a major version, including before 1.0.

Every push to `main` runs frontend, browser, and Rust checks before Release Please.
Merging a release PR creates the tag and GitHub Release. The macOS job then builds,
signs, notarizes, and uploads Apple Silicon artifacts before updating
`pablaber/homebrew-tap`.

Release Please and the tap update authenticate through a GitHub App:

- Repository variable `RELEASE_PLEASE_APP_CLIENT_ID`: the App's Client ID.
- Repository secret `RELEASE_PLEASE_APP_PRIVATE_KEY`: the App's PEM private key.
- The App installation needs read/write access to contents, issues, and pull requests
  in `pablaber/pr-desk`, plus contents read/write in `pablaber/homebrew-tap`.

Release builds also require:

- Repository variable `APPLE_SIGNING_IDENTITY`: the full Developer ID Application
  certificate common name.
- Repository secret `APPLE_CERTIFICATE`: the certificate and private key exported as a
  base64-encoded `.p12`.
- Repository secret `APPLE_CERTIFICATE_PASSWORD`: that `.p12` export password.
- Repository secret `APPLE_API_KEY`: the App Store Connect API key ID.
- Repository secret `APPLE_API_ISSUER`: the App Store Connect issuer ID.
- Repository secret `APPLE_API_KEY_BASE64`: the base64-encoded `.p8` private key.

Read [macOS signing and notarization](macos-signing.md) before changing signing config,
the release workflow, or `scripts/notarize-macos.sh`. It documents credential setup,
artifact verification, and non-obvious failure modes. Contributors and automated
agents should also follow [AGENTS.md](../AGENTS.md).
