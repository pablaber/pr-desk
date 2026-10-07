# PR states

A quick reference for how a pull request ends up in the **Ready to merge**, **Needs attention**,
or **Waiting** column, or off the dashboard entirely. The source of truth is the code; this page
mirrors it:

| Step                       | File                            |
| -------------------------- | ------------------------------- |
| Hidden before any rule     | `src/lib/pr/classify.ts`        |
| Raw PR → signals           | `src/lib/pr/signals.ts`         |
| Signals → rules and column | `src/lib/pr/dashboard-rules.ts` |
| Sorting within a column    | `src/lib/pr/classify.ts`        |
| Card badges and extras     | `src/lib/pr/card-view-model.ts` |
| Check state normalization  | `src/lib/github/normalize.ts`   |

Update this page whenever any of those change.

## How a PR gets on the desk

A PR is fetched when at least one source finds it. Its source badges on the card come from
these, independent of the column.

| Source                | Badge          | Found by                                         |
| --------------------- | -------------- | ------------------------------------------------ |
| Owned                 | Mine           | search `is:pr is:open author:@me`                |
| Direct review request | Review request | search `is:pr is:open user-review-requested:@me` |
| Tracked repository    | Tracked repo   | every open PR in a repository listed in Settings |
| Watched               | Watching       | a PR added individually in Settings              |

Cards for known-bot PRs (see **bot** below) also carry a Bot badge. Only individual (`User`)
review requests count; team review requests never do. A PR stays on the desk only while some
source still finds it.

## Step 1: hidden PRs

These are checked in order before any column rule runs. A hidden PR appears in no column and is
not counted in the Dock badge.

| Order | Hidden reason  | Condition                                          | Where to find it                 |
| ----- | -------------- | -------------------------------------------------- | -------------------------------- |
| 1     | `not-open`     | PR is closed or merged                             | Merged PRs: Completed screen     |
| 2     | `ignore-rule`  | matches a repository, author, or title ignore rule | Settings → Ignore rules          |
| 3     | `ignored`      | individually ignored                               | Settings → Ignored pull requests |
| 4     | `snoozed`      | snoozed and the snooze has not expired             | Snoozed screen                   |
| 5     | `others-draft` | draft authored by someone else (including bots)    | —                                |

Repository ignore rules also narrow discovery, so those PRs are usually never fetched at all.
Your own drafts are **not** hidden; they fall through to Waiting.

## Step 2: signals

Each visible PR is reduced to a handful of booleans. The terms used in the rule table:

| Signal                    | True when                                                                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **owned**                 | the PR author is you                                                                                                                                                                                                                                                      |
| **bot**                   | not owned, the author is in Settings → Known bots, **and** the PR comes from a tracked repository or is watched                                                                                                                                                           |
| **managed**               | owned **or** bot — the PRs you are responsible for landing                                                                                                                                                                                                                |
| **review requested**      | you personally are in the PR's requested reviewers                                                                                                                                                                                                                        |
| **active threads**        | unresolved review threads that are not outdated (outdated unresolved threads only show as secondary text)                                                                                                                                                                 |
| **changes requested**     | GitHub's aggregate `reviewDecision` is `CHANGES_REQUESTED`                                                                                                                                                                                                                |
| **failed checks**         | any check on the latest commit failed — including optional and non-blocking checks                                                                                                                                                                                        |
| **conflict**              | `mergeable` is `CONFLICTING`                                                                                                                                                                                                                                              |
| **queued**                | the PR is in a merge queue                                                                                                                                                                                                                                                |
| **auto-merge**            | auto-merge is enabled                                                                                                                                                                                                                                                     |
| **non-blocking pending**  | a check matching a Settings → Non-blocking checks rule for this repository is still pending                                                                                                                                                                               |
| **approved**              | managed, not a draft, `reviewDecision` is `APPROVED`, every check passes (ignoring non-blocking pending ones), and `mergeable` is `MERGEABLE`                                                                                                                             |
| **ready**                 | approved, not queued, no auto-merge, **no** non-blocking pending checks, and `mergeStateStatus` is `CLEAN`, `HAS_HOOKS` or `UNSTABLE`                                                                                                                                     |
| **ready, pending checks** | approved, not queued, no auto-merge, **some** non-blocking pending checks, and `mergeStateStatus` is `BLOCKED`, `CLEAN`, `HAS_HOOKS` or `UNSTABLE`                                                                                                                        |
| **approvable**            | bot, not a draft, `reviewDecision` is neither `APPROVED` nor `CHANGES_REQUESTED`, every check passes (non-blocking pending ones included), `mergeable` is `MERGEABLE`, not queued, no auto-merge, and `mergeStateStatus` is `BLOCKED`, `CLEAN`, `HAS_HOOKS` or `UNSTABLE` |

### Check states

| GitHub status or conclusion                                                                 | Counts as |
| ------------------------------------------------------------------------------------------- | --------- |
| `SUCCESS`, `NEUTRAL`, `SKIPPED`                                                             | passing   |
| `FAILURE`, `ERROR`, `CANCELLED`, `TIMED_OUT`, `ACTION_REQUIRED`, `STARTUP_FAILURE`, `STALE` | failed    |
| anything else, including in-progress and unknown                                            | pending   |

Every check counts, required or not. A PR with no checks passes. Pending checks block readiness
unless a non-blocking check rule matches them; failures always count.

## Step 3: rules and columns

Every rule is evaluated. The **highest-priority match** decides the column and the card's primary
label; other matching rules (except the `waiting` catch-all) show as secondary status text.

| Priority | Rule                   | Column              | Condition                                                               | Primary label                 |
| -------: | ---------------------- | ------------------- | ----------------------------------------------------------------------- | ----------------------------- |
|      100 | `review`               | **Needs attention** | review requested from you                                               | Review requested              |
|       90 | `threads`              | **Needs attention** | owned and has active threads                                            | _N_ unresolved thread(s)      |
|       80 | `changes`              | **Needs attention** | owned and changes requested                                             | Changes requested             |
|       70 | `checks`               | **Needs attention** | managed and any failed check                                            | Checks failed                 |
|       60 | `conflict`             | **Needs attention** | managed and conflict                                                    | Merge conflict                |
|       55 | `queued`               | **Waiting**         | queued (anyone's PR)                                                    | Queued to merge · #_position_ |
|       54 | `auto-merge`           | **Waiting**         | auto-merge enabled and not queued (anyone's PR)                         | Auto-merge enabled            |
|       50 | `ready`                | **Ready to merge**  | ready                                                                   | Ready to merge                |
|       50 | `ready-pending-checks` | **Ready to merge**  | ready, pending checks                                                   | Ready · _check names_ pending |
|       10 | `tracked-repository`   | **Needs attention** | from a tracked repository, not owned, not draft, not an approved bot PR | Waiting for your review       |
|        0 | `waiting`\*            | **Waiting**         | always (fallback)                                                       | see below                     |

\* Catch-all rule: it explains why the PR is on the desk and never appears in secondary status.

The Waiting fallback picks its label from the first that applies:

| Condition                         | Label                         |
| --------------------------------- | ----------------------------- |
| draft (only your own reach here)  | Draft                         |
| checks pending (not non-blocking) | Checks running                |
| managed and approved on GitHub    | Waiting on merge requirements |
| managed                           | Waiting for review            |
| otherwise                         | No action needed              |

### Consequences worth knowing

- Attention rules outrank queued and auto-merge, so a queued PR of yours with a failed check or
  conflict sits in Needs attention, not Waiting.
- Once you review someone else's PR, the review-request search stops returning it, so it leaves
  the desk — unless it is watched (Waiting, "No action needed") or in a tracked repository
  (Needs attention, "Waiting for your review").
- A known bot's PR is only treated as managed when it comes from a tracked repository or is
  watched. In a tracked repository it needs attention as "Waiting for your review", like any
  other PR that is not yours; once approved it is Ready to merge or, if GitHub still blocks it,
  Waiting. A watched bot PR outside your tracked repositories waits for review in Waiting.
- A known bot is a GitHub App, entered as `name[bot]`, or a machine user account, entered as its
  bare login. The author's account type must match, so a user account never counts as an App
  with the same name.
- "Waiting for your review" is a status: when a higher rule such as "Checks failed" is primary,
  it still shows beneath it.
- Thread and changes-requested rules apply only to owned PRs, not bot PRs.
- An owned draft can still need attention (for example, a review thread or a failed check), but
  it never becomes Ready to merge.
- `BEHIND`, `DIRTY`, `UNKNOWN`, and `DRAFT` merge states keep a PR out of Ready to merge.
  `BLOCKED` is tolerated only while a non-blocking check is pending, because GitHub does not say
  which rule is blocking.
- An approvable bot PR accepts `BLOCKED`, since the missing review is what blocks it.

## Quick lookup

The common situations, from your point of view:

| Situation                                                                          | Column          |
| ---------------------------------------------------------------------------------- | --------------- |
| Someone asked you to review                                                        | Needs attention |
| Your PR has unresolved comments, requested changes, a failing check, or a conflict | Needs attention |
| A known bot's PR you track has a failing check or a conflict                       | Needs attention |
| Someone else's open PR in a repository you track, including unapproved bot PRs     | Needs attention |
| Your PR or tracked bot PR is approved, green, and mergeable                        | Ready to merge  |
| Same, but a non-blocking check is still pending                                    | Ready to merge  |
| Any PR in a merge queue or with auto-merge on                                      | Waiting         |
| Your draft                                                                         | Waiting         |
| Your PR waiting on review or still running checks                                  | Waiting         |
| A watched PR by someone else with nothing for you to do                            | Waiting         |
| Someone else's draft, a closed PR, an ignored or a snoozed PR                      | Hidden          |

## In-app actions

| Action                 | Offered when                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Merge…**             | the `ready` rule placed the card in Ready to merge and its data is fresh. Never for "Ready · … pending" cards. Re-validated before merging.                                                                                                                                                                                                       |
| **Approve and merge…** | approvable and its data is fresh; the card stays where its rules put it, usually Needs attention as "Waiting for your review". Re-validated before approving; the approval is pinned to the confirmed commit, and the merge waits until GitHub reports the PR ready. If GitHub still blocks the merge, the approval stays and the dialog says so. |
| **Close as stale…**    | red staleness: not updated for more than 28 days                                                                                                                                                                                                                                                                                                  |

## Sorting

| Column          | Order                                                   |
| --------------- | ------------------------------------------------------- |
| Needs attention | rule priority (highest first), then oldest update first |
| Ready to merge  | oldest update first                                     |
| Waiting         | newest update first                                     |

GitHub does not expose when a PR entered a state, so `updatedAt` approximates time in state.

## Card extras

These do not affect the column:

| Extra             | Shown when                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| Secondary status  | other matching non-catch-all rules; "Checks failed" on any PR with a failed check; outdated threads |
| Checks badge      | at least one check, and every check passes                                                          |
| Approved badge    | `reviewDecision` is `APPROVED`                                                                      |
| Changes badge     | `reviewDecision` is `CHANGES_REQUESTED`                                                             |
| Staleness         | not updated for more than 7 days (low), 14 days (medium), or 28 days (high, red)                    |
| Stale data marker | the last refresh could not fetch this PR, so it shows previous results                              |

For any single PR, the card menu's debug info copies the matched rules, signals and hidden reason.
