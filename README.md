# PR Desk

A compact macOS pull request dashboard built with Tauri 2, Svelte 5, TypeScript, and Vite. GitHub remains the place to review, comment, and merge; selecting a card opens the PR in your default browser.

## Run

Requires macOS with Xcode Command Line Tools, Node.js 22.12+ (or 24+), rustup, and an authenticated GitHub CLI. The repository pins Rust 1.94.0; rustup installs it without changing your global default.

```sh
npm ci
# If necessary, complete GitHub CLI setup in Terminal:
brew install gh
gh auth login --hostname github.com
npm run tauri dev
```

Run these commands from the repository root. `npm run tauri dev` starts Vite and opens a native PR Desk window. Svelte, TypeScript, and CSS edits update automatically; Rust edits trigger a rebuild and restart. Stop the development session with `Ctrl+C` in the terminal.

To verify your existing GitHub sign-in, run `gh auth status --hostname github.com`. The development app uses your real GitHub account and shares saved preferences with the packaged app; it does not use separate demo data or storage.

`npm run dev` runs the frontend alone and displays a native-app setup message. GitHub access and persistence require Tauri.

```sh
npm run tauri build
# App: src-tauri/target/release/bundle/macos/PR Desk.app
```

This produces an ad-hoc signed local app; Developer ID signing and notarization run only in the release workflow (see [`docs/macos-signing.md`](docs/macos-signing.md)). `npm run tauri build -- --debug` creates a faster development bundle under `src-tauri/target/debug/bundle/macos/`.

Contributors and agents should also read [`AGENTS.md`](AGENTS.md) for working
conventions, and [`docs/macos-signing.md`](docs/macos-signing.md) before changing
anything related to code signing.

## Architecture

- `src-tauri/src/main.rs`: narrow asynchronous command bridge for `gh auth status` and read-only GraphQL requests. Discovers `gh` in `/opt/homebrew/bin`, `/usr/local/bin`, and inherited PATH. Commands use argument arrays, never a shell, have a 45-second timeout, and do not return authentication output or retrieve tokens.
- `src/lib/github/`: replaceable `GitHubService`, query construction, pagination, raw response types, normalization, and refresh orchestration. At most four source/detail requests run concurrently. A failed source or PR retains its last in-memory result and displays a stale warning. Successful refreshes replace prior source memberships.
- `src/lib/pr/`: normalized model → derived signals → declarative dashboard rules → classification/sorting → card view models. No classification rules live in Svelte components.
- `src/lib/store/`: versioned local preferences and canonical input validation.
- `src/components/` and `src/App.svelte`: dashboard, source filters, compact cards, menus, setup/error states, and settings.

## GitHub access

All requests run through the installed authenticated `gh` CLI against GitHub.com:

```text
gh auth status --hostname github.com
gh api --hostname github.com graphql -f query=...
```

GraphQL queries fetch:

- `viewer { login }` for the current user.
- Search `is:pr is:open author:@me` for owned PRs.
- Search `is:pr is:open user-review-requested:@me` for **individual** review requests.
- `repository.pullRequests(states: OPEN)` for tracked repositories.
- `repository.pullRequest(number: ...)` for each unique PR, including watched PRs.
- Aggregate `reviewDecision`, `mergeable`, `mergeStateStatus`, draft/state/update fields, reviewer requests, review threads, and the latest commit’s status-check rollup.
- `CheckRun.isRequired(pullRequestNumber: ...)` and `StatusContext.isRequired(...)` distinguish required from optional checks. Pending/unknown checks never count as passing.

Searches, repository lists, review requests, review threads, and check contexts are paginated. Only `User` reviewers contribute direct requests; team requests never trigger attention. GitHub search’s 1,000-result ceiling is reported as an error rather than silently truncating. Detail query failures are reported individually.

References: [GitHub check fields](https://docs.github.com/en/graphql/reference/checks), [Tauri Store](https://v2.tauri.app/plugin/store/), [Tauri Opener](https://v2.tauri.app/plugin/opener/).

## Local state

Tauri Store writes `preferences.json` to the app data directory (on macOS, `~/Library/Application Support/dev.prdesk.desktop/`). The `state` key contains:

```json
{
  "schemaVersion": 2,
  "trackedRepositories": ["owner/repository"],
  "watchedPullRequests": ["owner/repository#123"],
  "ignoredPullRequests": {
    "owner/repository#456": { "ignoredAt": "2026-09-24T12:00:00Z" }
  },
  "snoozedPullRequests": {
    "owner/repository#789": { "until": "2026-09-25T13:00:00Z" }
  },
  "settings": { "automaticRefreshMinutes": 5 }
}
```

No PR titles, GitHub status, or credentials are persisted. Repository and PR identifiers are canonicalized to lowercase. Unsupported storage versions stop loading without overwriting the file. Closed/merged PRs disappear from the board; local preferences for closed/deleted/inaccessible PRs remain available for manual removal/restoration. This avoids losing user intent after a temporary access failure.

Snoozes offer one hour, four hours, tomorrow at 9 AM, next Monday at 9 AM, and a custom local date/time. An in-memory clock checks expiry every 15 seconds. Settings exposes snoozed and ignored PRs for restoration.

## Rules and sorting

Edit `src/lib/pr/dashboard-rules.ts` to change priorities, predicates, destination states, or labels. Ignore/current snooze/closed state hides a PR before rules run. All matching actionable labels are retained; the highest-priority rule determines the column and primary label:

1. Direct individual review request.
2. Active unresolved threads on an owned PR.
3. GitHub’s aggregate changes-requested decision on an owned PR.
4. Failed required checks on an owned PR.
5. Merge conflicts on an owned PR.
6. Owned, non-draft, approved, required checks passing, mergeable, and a compatible GitHub merge state → Ready to Merge.
7. Waiting fallback.

Unknown, blocked, behind, draft, and otherwise non-ready merge states prevent Ready to Merge. Optional failures may be displayed without creating attention. Source badges are independent of classification.

Sorting is centralized in `classify.ts`: attention priority then oldest update; ready oldest update; waiting newest update. GitHub does not provide when a PR entered these derived states, so `updatedAt` approximates “oldest attention/ready” in v1.

## Refresh behavior

Automatic GitHub refresh defaults to five minutes while the app is running. Settings pairs a slider with a numeric input and stepper for whole-minute intervals from 1 to 60. A separate Never checkbox disables automatic refresh (stored as zero). Slider changes save on release; typed values save on Enter or leaving the field. Each interval starts after the previous refresh finishes; manual refresh and setting changes restart the timer, and requests never overlap. Version 1 preferences migrate to the five-minute default because its reserved zero was not a user-selected Never. Version 2 preserves an explicit Never choice. The separate 15-second clock updates ages and snooze visibility.

## Verification

```sh
npm run check
npm test
npx playwright install chromium
npm run test:e2e
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

Unit tests cover every attention rule, ready/waiting states, team versus individual requests, multiple matching rules, ignored/snoozed/closed PRs, sorting, normalization, detail/discovery pagination, de-duplication, partial failures, input validation, and snooze dates. Playwright exercises the real Svelte UI with a mocked Tauri boundary, including source filters, opening GitHub, settings validation, watch/track, snooze/ignore/restoration, and persistence across reloads. Mock fixtures never ship in the app.

## Current limits

- One active GitHub.com account; no Enterprise hostname/account selector.
- Detail queries run per unique PR. Very large dashboards may need batching or incremental refresh to reduce API cost.
- Search indexing and GitHub mergeability computation can lag. Refresh again for updated results.
- Previously loaded cards remain visible and explicitly marked stale when refresh fails; inspect GitHub before acting on stale readiness.
- State timestamps are approximated by PR update time. Exact time-in-state would need an additional history policy.

## Releases and installation

The first release is **v0.1.0**. `release-please-config.json` explicitly sets
`initial-version` to `0.1.0`; the initially empty manifest means no version has
been released yet. Do not seed it with `0.1.0`: Release Please maintains the
manifest after release. Subsequent `feat:` commits increment the minor version,
`fix:` commits increment the patch version, and breaking changes (`feat!:` or a
`BREAKING CHANGE:` footer) increment the major version, including before 1.0.
Release Please generates `CHANGELOG.md` in its first release PR.

`package.json` is the application version source of truth. Release Please updates
it and `package-lock.json`; Tauri reads `../package.json` directly. The unpublished
Rust implementation crate uses Cargo's default internal version (`0.0.0`), which
is independent of the application version and is not a release version.

### Repository setup

Use squash merging and configure GitHub's default squash commit message to use
the PR title. Require **Validate PR Title**, **Unit and browser tests**, and
**Rust checks and tests** in branch protection for `main`. The title check uses
the same `amannn/action-semantic-pull-request` action as
[`pablaber/snuffboard`](https://github.com/pablaber/snuffboard/blob/main/.github/workflows/pr-validate.yml),
accepting standard Conventional Commit types, optional scopes, and `!` for
breaking changes. Intermediate branch commits need not follow this convention.

Release authentication follows
[`snuffboard`'s Release Please workflow](https://github.com/pablaber/snuffboard/blob/main/.github/workflows/release-please.yml):
`actions/create-github-app-token` generates an installation token and passes it to
`googleapis/release-please-action`, using the pinned revisions in the workflow:

- Repository **variable** `RELEASE_PLEASE_APP_CLIENT_ID`: the GitHub App’s **Client ID**
  (starts with `Iv23li`), copied from the
  [`shipit-please` App settings](https://github.com/settings/apps/shipit-please).
  This is a public identifier, so store it as a variable.
- Repository **secret** `RELEASE_PLEASE_APP_PRIVATE_KEY`: the App's PEM private key.
- Install the App on `pablaber/pr-desk`, granting repository Contents, Issues,
  and Pull requests read/write permissions. Ensure repository policies permit
  the App to open release PRs and create release tags.
- In [GitHub App installation settings](https://github.com/settings/installations),
  configure the same App to also access `pablaber/homebrew-tap`. The tap token is
  explicitly scoped to that repository with **Contents: read/write** only. Allow
  the App to push to the tap's default branch. No additional secret or PAT is needed.
  Installation access must be confirmed by the repository owner; creating the tap
  does not automatically add it to an installation limited to selected repositories.

The App token allows release PRs to trigger normal CI. The workflow preserves
`snuffboard`'s permission pattern; artifact upload and release metadata verification
use the ordinary Actions `GITHUB_TOKEN`. Tap writes use the scoped App token.

#### Apple signing credentials

Release builds are Developer ID signed and notarized, so the macOS build job also
needs Apple credentials. All of these are read by Tauri's built-in macOS signing
support; the workflow fails early with a named error if any is missing.
[`docs/macos-signing.md`](docs/macos-signing.md) covers creating, verifying,
renewing and troubleshooting them in detail.

- Repository **variable** `APPLE_SIGNING_IDENTITY`: the full certificate common
  name, `Developer ID Application: <Name> (<Team ID>)`. Not sensitive; it is
  embedded in every signed binary. It overrides `bundle.macOS.signingIdentity`
  from `tauri.conf.json`, which stays `"-"` so local builds remain ad-hoc signed.
- Repository **secret** `APPLE_CERTIFICATE`: the Developer ID Application
  certificate _and its private key_, exported from Keychain Access as a `.p12`
  and base64 encoded.
- Repository **secret** `APPLE_CERTIFICATE_PASSWORD`: the password chosen when
  exporting that `.p12`.
- Repository **secret** `APPLE_API_KEY`: the App Store Connect API **Key ID**.
- Repository **secret** `APPLE_API_ISSUER`: the App Store Connect **Issuer ID**.
- Repository **secret** `APPLE_API_KEY_BASE64`: the base64-encoded `.p8` private
  key downloaded once when the App Store Connect key was created. The workflow
  decodes it to `$RUNNER_TEMP/AuthKey.p8`, points `APPLE_API_KEY_PATH` at it, and
  deletes it when the job ends.

No keychain password secret is needed: Tauri creates and tears down its own
temporary keychain when `APPLE_CERTIFICATE` is present.

Every push to `main` runs the reusable frontend, browser, and Rust checks before
Release Please runs. Conventional commits update its release PR; merging that
PR creates the tag and GitHub Release. Only an actual `release_created` output
starts the macOS build, checking out the released SHA and attaching artifacts to
that release ID with the official Tauri action. Builds target
`aarch64-apple-darwin` and produce a `.dmg` and an `.app.tar.gz` archive. The
release may briefly exist without assets while the build runs. Inspect the
Release Please workflow if installation reports missing assets.

Tauri signs the app with the Developer ID Application certificate under the
hardened runtime and a secure timestamp, submits it to Apple's notary service,
staples the ticket into the bundle, then signs the DMG that carries it.
`scripts/notarize-macos.sh` then notarizes and staples the DMG itself, because
Tauri only notarizes the app, and re-verifies both artifacts: stapled ticket,
valid signature, `spctl` reporting `source=Notarized Developer ID`, a Developer
ID authority, a secure timestamp, and the hardened runtime flag. That explicit
check matters because Tauri only logs a warning when notarization credentials
are missing, which would otherwise ship a signed but unnotarized build. The
stapled DMG replaces the uploaded asset before the checksum is computed, so the
Homebrew cask always points at the notarized bytes, and any notarization or
verification failure fails the build job and leaves the tap untouched.

After the build/upload succeeds, the build job hashes the local DMG and verifies
its name, release tag, published status, and uploaded asset digest via GitHub's
release API. Only non-secret version/checksum outputs pass to `update-homebrew`,
which requires both `release_created` and a successful build. That job mints a
fresh GitHub App token, checks out the tap's default branch, updates only the
version and SHA-256 stanzas in `Casks/pr-desk.rb`, validates them and Ruby syntax,
and commits as the App bot. The URL interpolates the version. An unchanged cask
produces no commit; a failed tap update can be retried with **Re-run failed jobs**
on that release's workflow run after fixing installation permissions. A new push
without a new release does not update the tap.

### Install (recommended)

On an Apple Silicon Mac with Homebrew:

```sh
brew install --cask pablaber/tap/pr-desk
```

This automatically adds the public [`pablaber/homebrew-tap`](https://github.com/pablaber/homebrew-tap)
and installs `PR Desk.app` into `/Applications`. Downloading the release requires
no GitHub authentication. To use PR Desk, install and authenticate the GitHub CLI:

```sh
brew install gh
gh auth login --hostname github.com
```

### Upgrade

Quit PR Desk, then run:

```sh
brew update
brew upgrade --cask pr-desk
```

### Alternative: installation script

On an Apple Silicon Mac with `gh` installed and authenticated to an account with
repository access:

```sh
gh auth login --hostname github.com
gh repo clone pablaber/pr-desk
cd pr-desk
./scripts/install.sh
```

Run the script again to upgrade to the latest published release. It downloads the
Apple Silicon DMG using authenticated `gh`, verifies the app's signature and
identifier, and installs into `~/Applications/PR Desk.app`. Quit PR Desk first.
The old installation is retained until replacement succeeds; app preferences are
preserved. Set `PR_DESK_INSTALL_DIR` to choose another writable application
directory. No `sudo` is needed with the default directory.

Published releases are Developer ID signed and notarized by Apple, with the
notarization ticket stapled into both the app and the DMG, so they launch without
a Gatekeeper prompt and work offline. Neither the Homebrew cask nor the
installation script disables Gatekeeper or removes quarantine attributes. Local
`npm run tauri build` output is still ad-hoc signed
(`bundle.macOS.signingIdentity: "-"`) and will show the usual warning. To check a
published build yourself:

```sh
spctl --assess --type execute --verbose=4 "/Applications/PR Desk.app"
```

It should report `source=Notarized Developer ID`. See
[`docs/macos-signing.md`](docs/macos-signing.md) for how signing and notarization
work and how to debug them. No in-app updater is configured.
