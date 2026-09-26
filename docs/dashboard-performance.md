# Discovery fetching verification

The all-check policy is an incompatible status-policy change: failed checks previously
considered optional now create attention for owned PRs and prevent readiness. GitHub
branch-protection settings and saved preferences are unchanged.

## Live comparison

Measured September 26, 2026 using the same authenticated account and saved preferences,
read without modification. Five sequential runs of the previous implementation followed
by five of the new implementation, through the actual service and refresh orchestration
with an injected `gh api graphql` runner. Each run returned the same ten PRs, with three
discovery sources and no warnings. Authentication was measured separately at 385 ms;
viewer lookup and native rendering are excluded from these refresh measurements.

| Median           | Previous | Discovery seeds |
| ---------------- | -------: | --------------: |
| Discovery        |   836 ms |        1,332 ms |
| Completion       | 2,363 ms |         0.37 ms |
| Total refresh    | 3,116 ms |        1,333 ms |
| GraphQL requests |       13 |               3 |
| Detail requests  |       10 |               0 |

Phase medians are computed independently and need not sum to the total median.
Total refresh times across the five runs were 2,954 / 3,116 / 2,993 / 3,263 / 3,752 ms
before and 1,271 / 1,439 / 1,237 / 1,357 / 1,333 ms after. Rich discovery costs more per
request but removes routine per-PR detail requests. This workload shows no median
regression; it does not establish a fixed speedup for other accounts or larger queries.
Raw measurements and the local runner are retained under `.context/`.

## Deterministic request scaling

Fixtures use two overlapping discovery searches and complete initial connection pages.
The extended case adds one thread continuation and one undiscovered watched PR.

| Discovered PRs | Extra cases                 | Previous requests | New requests |
| -------------- | --------------------------- | ----------------: | -----------: |
| 25             | None                        |                27 |            2 |
| 100            | None                        |               102 |            2 |
| 25             | Continuation + watched-only |                29 |            4 |
| 100            | Continuation + watched-only |               104 |            4 |

All fixture runs returned the expected records without warnings. In-memory elapsed
times ranged from 0.39 to 1.42 ms; they are orchestration evidence, not GitHub latency
measurements. Unit tests enforce request scaling, four-worker concurrency, seed
selection, selective pagination, commit consistency, and stale recovery. Browser tests
assert complete snapshot publication, previous cards remaining visible, check labels,
and zero ordinary detail calls.

## Validation

Passed formatting, Svelte/TypeScript checks, 126 unit tests, three Homebrew script tests,
Vite production build, Rust formatting and Clippy, two Rust tests, and 31 browser tests.
The README screenshot was regenerated and visually inspected.

The native development app built and launched successfully. Manual in-window startup
and refresh verification remains outstanding: macOS denied the automation process
Accessibility access. Live service checks above exercised GitHub fetching independently.
