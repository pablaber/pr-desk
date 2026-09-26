# PR Desk

<p align="center">
  <img src="docs/assets/pr-desk-dashboard.png" alt="PR Desk showing a dashboard of mock pull requests" width="700">
</p>

A compact macOS pull request dashboard. PR Desk shows what needs your attention, what
is ready to merge, and what can wait. GitHub remains the place to review, comment, and
merge; selecting a card opens the pull request in your default browser.

## Installation

### Prerequisites

PR Desk currently supports Apple Silicon Macs. You will need
[Homebrew](https://brew.sh/) and the [GitHub CLI](https://cli.github.com/) authenticated
with the GitHub.com account whose pull requests you want to see.

```sh
brew install gh
gh auth login --hostname github.com
gh auth status --hostname github.com
```

The final command verifies that authentication is working. The account needs access to
each private organization and repository you want PR Desk to display; if your
organization uses SAML SSO, authorize the GitHub CLI for that organization as well.

### Install with Homebrew

```sh
brew install --cask pablaber/tap/pr-desk
```

Homebrew adds the public
[`pablaber/homebrew-tap`](https://github.com/pablaber/homebrew-tap) and installs
`PR Desk.app` in `/Applications`. Published releases are Developer ID signed and
notarized by Apple.

To upgrade, quit PR Desk and run:

```sh
brew update
brew upgrade --cask pr-desk
```

PR Desk has no in-app updater.

## Key features

- Sorts pull requests into Ready to merge, Needs attention, and Waiting based on
  reviews, all checks, unresolved threads, conflicts, and draft state.
- Combines your own PRs, direct review requests, tracked repositories, and individually
  watched PRs in one dashboard.
- Filters by source and supports snoozing or individually ignoring PRs. Individually ignored
  PRs live on their own screen, reached from Settings → Ignored, where each can be unignored.
  Settings → Ignored also hides PRs by repository, exact author login (including bots), or title. Repository and
  title rules use case-insensitive whole-value globs: `*` matches zero or more characters and
  `?` matches one. For example, `acme/*`, `*/docs`, or title `chore:*`; use `*dependenc*`
  to match text anywhere in a title. Any matching rule hides a PR from every dashboard source.
  Exact repository exclusions still narrow GitHub searches; repository patterns filter before
  detail fetching, and author/title rules use already-fetched details without extra requests.
- Offers configurable automatic refresh while keeping failed refresh results visible
  and clearly marked as stale.
- Stores preferences locally and uses your existing GitHub CLI authentication.
- Closes PRs with red staleness (over 28 days) after confirmation, leaving an automated
  comment with their inactivity in days. Enter confirms; Escape cancels.

## GitHub access

All requests run through the installed authenticated `gh` CLI against GitHub.com:

```text
gh auth status --hostname github.com
gh api --hostname github.com graphql -f query=...
```

PR Desk never handles a GitHub token itself. GraphQL queries fetch:

- `viewer { login }` for the current user.
- Search `is:pr is:open author:@me` for owned PRs.
- Search `is:pr is:open user-review-requested:@me` for **individual** review requests.
- `repository.pullRequests(states: OPEN)` for tracked repositories.
- `repository.pullRequest(number: ...)` for missing connection pages and PRs absent from
  discovery (watched PRs or IDs retained from failed sources).
- Aggregate `reviewDecision`, `mergeable`, `mergeStateStatus`, draft/state/update
  fields, reviewer requests, review threads, and the latest commit's status-check
  rollup.
- Every check contributes to status. Pending/unknown checks never count as passing;
  success, neutral, and skipped checks pass. Empty check sets also pass. PR Desk can
  withhold readiness when GitHub permits merging because an optional check failed.

Searches, repository lists, review requests, review threads, and check contexts are
paginated. Complete discovery records need no detail request. Refresh finishes all
fetching before publishing one snapshot; existing cards remain visible until then.
Only `User` reviewers contribute direct requests; team requests never
trigger attention. GitHub search's 1,000-result ceiling is reported as an error rather
than silently truncating. Detail query failures are reported individually.

References: [GitHub check fields](https://docs.github.com/en/graphql/reference/checks),
[Tauri Store](https://v2.tauri.app/plugin/store/), and
[Tauri Opener](https://v2.tauri.app/plugin/opener/).

## Current limits

- One active GitHub.com account; there is no Enterprise hostname or account selector.
- Discovery includes complete card fields. Large dashboards with paginated nested
  connections still need additional time and API quota.
- GitHub search indexing and mergeability computation can lag. Refresh again to fetch
  updated results.
- Previously loaded cards remain visible and are marked stale when refresh fails;
  inspect GitHub before acting on stale readiness.
- State timestamps use the PR update time as an approximation.

## Development

See [Development](docs/development.md) for local setup and run commands, architecture,
testing, local builds, and release maintenance. Contributors and automated agents
should also read [AGENTS.md](AGENTS.md).
