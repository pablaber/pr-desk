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

This produces a local app; distribution signing and notarization are not configured. `npm run tauri build -- --debug` creates a faster development bundle under `src-tauri/target/debug/bundle/macos/`.

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
  "schemaVersion": 1,
  "trackedRepositories": ["owner/repository"],
  "watchedPullRequests": ["owner/repository#123"],
  "ignoredPullRequests": {
    "owner/repository#456": { "ignoredAt": "2026-09-24T12:00:00Z" }
  },
  "snoozedPullRequests": {
    "owner/repository#789": { "until": "2026-09-25T13:00:00Z" }
  },
  "settings": { "automaticRefreshMinutes": 0 }
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
- Manual network refresh only. `automaticRefreshMinutes` is reserved and defaults to zero; the clock only updates ages and snooze visibility.
- Detail queries run per unique PR. Very large dashboards may need batching or incremental refresh to reduce API cost.
- Search indexing and GitHub mergeability computation can lag. Refresh again for updated results.
- Previously loaded cards remain visible and explicitly marked stale when refresh fails; inspect GitHub before acting on stale readiness.
- State timestamps are approximated by PR update time. Exact time-in-state would need an additional history policy.
