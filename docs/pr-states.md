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
| Stacked PR grouping        | `src/lib/pr/stacks.ts`          |
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

Your own PR in a tracked repository shows Mine but not Tracked repo, and appears under the Mine
filter but not the Tracked repos filter, because the owned rules apply to it. Cards for
known-bot PRs (see **bot** below) also carry a Bot badge. Only individual (`User`) review
requests count; team review requests never do. A PR stays on the desk only while some source
still finds it.

The repository filter narrows the board to one repository on top of the source filter. Its menu
counts every PR the source filter shows, so each layer of a stack counts. The choice lasts for the
session and clears once no PR from that repository is on the desk.

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

| Signal                         | True when                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **owned**                      | the PR author is you                                                                                                                                                                                                                                                                                                  |
| **bot**                        | not owned, the author is in Settings → Known bots, **and** the PR comes from a tracked repository or is watched                                                                                                                                                                                                       |
| **managed**                    | owned **or** bot — the PRs you are responsible for landing                                                                                                                                                                                                                                                            |
| **last pushed by you**         | not owned, and you authored the PR's latest non-merge commit. Merge commits, such as those from updating the branch, are skipped; only the last three commits are looked at                                                                                                                                           |
| **latest commit by the bot**   | bot, and the bot authored the PR's latest non-merge commit: a machine user's commit links to its account, and a GitHub App's carries the git author name `name[bot]` with no linked account                                                                                                                           |
| **review requested**           | you personally are in the PR's requested reviewers                                                                                                                                                                                                                                                                    |
| **active threads**             | unresolved review threads that are not outdated (outdated unresolved threads only show as secondary text)                                                                                                                                                                                                             |
| **changes requested**          | GitHub's aggregate `reviewDecision` is `CHANGES_REQUESTED`                                                                                                                                                                                                                                                            |
| **failed checks**              | any check on the latest commit failed — including optional and non-blocking checks, except those matching a rule that allows failures                                                                                                                                                                                 |
| **conflict**                   | `mergeable` is `CONFLICTING`                                                                                                                                                                                                                                                                                          |
| **behind**                     | `mergeStateStatus` is `BEHIND` — GitHub only reports this when branch protection requires an up-to-date branch                                                                                                                                                                                                        |
| **queued**                     | the PR is in a merge queue                                                                                                                                                                                                                                                                                            |
| **auto-merge**                 | auto-merge is enabled                                                                                                                                                                                                                                                                                                 |
| **non-blocking pending**       | a check matching a Settings → Non-blocking checks rule for this repository is still pending                                                                                                                                                                                                                           |
| **allowed failures**           | a check matching a Non-blocking checks rule with Allow failures on for this repository has failed                                                                                                                                                                                                                     |
| **approved**                   | managed, not a draft, `reviewDecision` is `APPROVED`, every check passes (ignoring non-blocking pending ones and allowed failures), and `mergeable` is `MERGEABLE`                                                                                                                                                    |
| **ready**                      | approved, not queued, no auto-merge, **no** non-blocking pending checks or allowed failures, and `mergeStateStatus` is `CLEAN`, `HAS_HOOKS` or `UNSTABLE`                                                                                                                                                             |
| **ready, non-blocking checks** | approved, not queued, no auto-merge, **some** non-blocking pending checks or allowed failures, and `mergeStateStatus` is `BLOCKED`, `CLEAN`, `HAS_HOOKS` or `UNSTABLE`                                                                                                                                                |
| **updatable**                  | managed, not a draft, behind, `mergeable` is `MERGEABLE`, not queued, no auto-merge; checks may be in any state                                                                                                                                                                                                       |
| **approvable**                 | latest commit by the bot, not a draft, `reviewDecision` is neither `APPROVED` nor `CHANGES_REQUESTED`, every check passes (non-blocking pending checks and allowed failures included), `mergeable` is `MERGEABLE`, not queued, no auto-merge, and `mergeStateStatus` is `BLOCKED`, `CLEAN`, `HAS_HOOKS` or `UNSTABLE` |

### Check states

| GitHub status or conclusion                                                                 | Counts as |
| ------------------------------------------------------------------------------------------- | --------- |
| `SUCCESS`, `NEUTRAL`, `SKIPPED`                                                             | passing   |
| `FAILURE`, `ERROR`, `CANCELLED`, `TIMED_OUT`, `ACTION_REQUIRED`, `STARTUP_FAILURE`, `STALE` | failed    |
| anything else, including in-progress and unknown                                            | pending   |

Every check counts, required or not. A PR with no checks passes. Pending checks block readiness
unless a non-blocking check rule matches them. Failures count unless a matching rule has Allow
failures on; any matching rule with it on is enough.

## Step 3: rules and columns

Every rule is evaluated. The **highest-priority match** decides the column and the card's primary
label; other matching rules (except the `waiting` catch-all) show as secondary status text.

| Priority | Rule                        | Column              | Condition                                                                             | Primary label                                        |
| -------: | --------------------------- | ------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
|      100 | `review`                    | **Needs attention** | review requested from you                                                             | Review requested                                     |
|       90 | `threads`                   | **Needs attention** | owned and has active threads                                                          | _N_ unresolved thread(s)                             |
|       80 | `changes`                   | **Needs attention** | owned and changes requested                                                           | Changes requested                                    |
|       70 | `checks`                    | **Needs attention** | managed and any failed check                                                          | Checks failed                                        |
|       60 | `conflict`                  | **Needs attention** | managed and conflict                                                                  | Merge conflict                                       |
|       58 | `behind`                    | **Needs attention** | managed and behind                                                                    | Behind _base branch_                                 |
|       55 | `queued`                    | **Waiting**         | queued (anyone's PR)                                                                  | Queued to merge · #_position_                        |
|       54 | `auto-merge`                | **Waiting**         | auto-merge enabled and not queued (anyone's PR)                                       | Auto-merge enabled                                   |
|       50 | `ready`                     | **Ready to merge**  | ready                                                                                 | Ready to merge                                       |
|       50 | `ready-non-blocking-checks` | **Ready to merge**  | ready, non-blocking checks                                                            | Ready · _check names_ pending · _check names_ failed |
|       50 | `approvable`                | **Ready to merge**  | approvable                                                                            | Ready to approve and merge                           |
|       10 | `tracked-repository`        | **Needs attention** | from a tracked repository, not owned, not last pushed by you, not draft, not approved | Waiting for your review                              |
|        0 | `waiting`\*                 | **Waiting**         | always (fallback)                                                                     | see below                                            |

\* Catch-all rule: it explains why the PR is on the desk and never appears in secondary status.

The Waiting fallback picks its label from the first that applies:

| Condition                         | Label                         |
| --------------------------------- | ----------------------------- |
| draft (only your own reach here)  | Draft                         |
| checks pending (not non-blocking) | Checks running                |
| managed and approved on GitHub    | Waiting on merge requirements |
| managed and last pushed by you    | Waiting for another reviewer  |
| managed                           | Waiting for review            |
| otherwise                         | No action needed              |

### Consequences worth knowing

- Attention rules outrank queued and auto-merge, so a queued PR of yours with a failed check or
  conflict sits in Needs attention, not Waiting.
- Once you review someone else's PR, the review-request search stops returning it, so it leaves
  the desk — unless it is watched (Waiting, "No action needed") or in a tracked repository
  (Waiting once approved, with "Checks running" or "No action needed"). An explicit personal
  review request still needs attention, even when the aggregate review decision is approved.
- A known bot's PR is only treated as managed when it comes from a tracked repository or is
  watched. In a tracked repository it needs attention as "Waiting for your review", like any
  other PR that is not yours, unless it is approvable: then it is Ready to merge as "Ready to
  approve and merge". Once approved it is Ready to merge or, if GitHub still blocks it, Waiting. A watched bot PR outside your tracked repositories waits for review in Waiting, unless it
  is approvable.
- Branch protection can require the most recent push to be approved by someone other than its
  pusher. GitHub does not say whether a repository requires this, or who pushed, so once you
  author the latest commit on a PR that is not yours, it stops asking for your review: a bot PR
  waits as "Waiting for another reviewer". Someone else's approval makes it Ready to merge as
  usual.
- A bot PR is approvable only while the bot made its latest non-merge commit. Once anyone else
  pushes to it, including you from a git email GitHub cannot link to your account, it needs a
  review on GitHub and is not approvable.
- A known bot is a GitHub App, entered as `name[bot]`, or a machine user account, entered as its
  bare login. The author's account type must match, so a user account never counts as an App
  with the same name.
- "Waiting for your review" is a status: when a higher rule such as "Checks failed" is primary,
  it still shows beneath it.
- Thread and changes-requested rules apply only to owned PRs, not bot PRs.
- An owned draft can still need attention (for example, a review thread or a failed check), but
  it never becomes Ready to merge.
- `BEHIND`, `DIRTY`, `UNKNOWN`, and `DRAFT` merge states keep a PR out of Ready to merge.
  `BLOCKED` is tolerated only while a non-blocking check is pending or an allowed failure is
  present, because GitHub does not say which rule is blocking.
- An approvable bot PR accepts `BLOCKED`, since the missing review is what blocks it. An explicit
  personal review request outranks it, so such a PR stays in Needs attention.
- GitHub reports `BEHIND` ahead of `BLOCKED`, so a bot PR behind its base is not approvable even
  when its review is the other thing missing. Updating the branch re-runs its checks; once they
  pass it becomes approvable.

## Quick lookup

The common situations, from your point of view:

| Situation                                                                          | Column          |
| ---------------------------------------------------------------------------------- | --------------- |
| Someone asked you to review                                                        | Needs attention |
| Your PR has unresolved comments, requested changes, a failing check, or a conflict | Needs attention |
| A known bot's PR you track has a failing check or a conflict                       | Needs attention |
| Your PR or a tracked bot PR is behind a base branch that must be up to date        | Needs attention |
| Someone else's unapproved open PR in a repository you track, including bot PRs     | Needs attention |
| Your PR or tracked bot PR is approved, green, and mergeable                        | Ready to merge  |
| Same, but a non-blocking check is still pending, or failed under Allow failures    | Ready to merge  |
| A tracked bot PR waiting for review with passing checks that GitHub can merge      | Ready to merge  |
| A tracked bot PR whose latest commit you authored, waiting for review              | Waiting         |
| Any PR in a merge queue or with auto-merge on                                      | Waiting         |
| Your draft                                                                         | Waiting         |
| Your PR waiting on review or still running checks                                  | Waiting         |
| A watched PR by someone else with nothing for you to do                            | Waiting         |
| Someone else's draft, a closed PR, an ignored or a snoozed PR                      | Hidden          |

## In-app actions

| Action                 | Offered when                                                                                                                                                                                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Merge…**             | the `ready` rule placed the card in Ready to merge and its data is fresh. Never for "Ready · … pending" cards. Re-validated before merging.                                                                                                                                                                                 |
| **Approve and merge…** | approvable and its data is fresh; the card is usually in Ready to merge as "Ready to approve and merge". Re-validated before approving; the approval is pinned to the confirmed commit, and the merge waits until GitHub reports the PR ready. If GitHub still blocks the merge, the approval stays and the dialog says so. |
| **Update branch…**     | updatable and its data is fresh. Re-validated before updating; GitHub merges the base branch into the PR, pinned to the confirmed head commit, and the dashboard refreshes. The card stays on the desk while checks re-run.                                                                                                 |
| **Close as stale…**    | red staleness: not updated for more than 28 days                                                                                                                                                                                                                                                                            |

## Sorting

| Column          | Order                                                   |
| --------------- | ------------------------------------------------------- |
| Needs attention | rule priority (highest first), then oldest update first |
| Ready to merge  | oldest update first                                     |
| Waiting         | newest update first                                     |

GitHub does not expose when a PR entered a state, so `updatedAt` approximates time in state.

## Stacks

A PR is stacked on another open PR in the same repository when its base branch is that PR's head
branch. Fork heads never count, and a base branch that is the head of more than one open PR links
to nothing. Chains that loop back on themselves stay unstacked.

Visible PRs in one stack share a single stack card, newest layer first and the base branch last.
Hidden, snoozed or filtered-out layers are not shown but still connect the layers around them; a
stack with only one visible layer is an ordinary card. The stack sits in the column of its most
urgent layer (Needs attention, then Ready to merge, then Waiting), ordered within that column by
that layer as above. Column and summary counts include every PR the column shows.

Stacking changes only placement. Each layer keeps its own rules, status, merge actions and Dock
badge contribution. In-app merge refuses a layer of a GitHub stack that sits above other open PRs,
because GitHub would merge those with it; merge the bottom layer first.

## Card extras

These do not affect the column:

| Extra             | Shown when                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| Secondary status  | other matching non-catch-all rules; "Checks failed" on any PR with a failed check; outdated threads |
| Checks badge      | at least one check; red if any failed, otherwise amber if any are pending, otherwise green          |
| Approved badge    | `reviewDecision` is `APPROVED`                                                                      |
| Changes badge     | `reviewDecision` is `CHANGES_REQUESTED`                                                             |
| Staleness         | not updated for more than 7 days (low), 14 days (medium), or 28 days (high, red)                    |
| Stale data marker | the last refresh could not fetch this PR, so it shows previous results                              |

For any single PR, the card menu's debug info copies the matched rules, signals and hidden reason.
