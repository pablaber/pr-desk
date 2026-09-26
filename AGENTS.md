# Agent guide

Working conventions for automated agents and new contributors. `README.md` is the
user-facing documentation — features, installation, architecture detail, release
setup; this file covers how to work in the repository without re-reading all of it.

## What this is

PR Desk is a macOS pull request dashboard: a Tauri 2 (Rust) shell around a Svelte 5 +
TypeScript + Vite frontend. All GitHub access goes through the user's authenticated
`gh` CLI — the app never handles tokens itself. Reviewing and merging happen on GitHub; the app opens PRs in the browser.
The confirmed Close as stale action closes stale PRs with a fixed automatic comment.

Pinned and expected versions: Rust 1.94.0 (`rust-toolchain.toml`, installed by rustup
without changing your global default), Node 22.12+ or 24+ (CI uses 24), Svelte 5,
Vite 7, Vitest 4, Prettier 3, Playwright. Anything Tauri needs macOS with the Xcode
Command Line Tools.

## Commands

Run everything from the repository root.

```sh
npm ci                 # install; matches CI. Use npm install only to change dependencies
npm run tauri dev      # native dev window (needs an authenticated gh)
npm run dev            # frontend only; shows a native-app setup message
npm run tauri build    # ad-hoc signed local app → src-tauri/target/release/bundle/macos/
```

Verification — the same set CI runs, so run all of it before pushing:

```sh
npm run format         # rewrite; CI runs format:check and fails on unformatted files
npm run check          # svelte-check + TypeScript
npm test               # vitest, src only
node --test scripts/update-homebrew.test.mjs
npm run build          # vite build

cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Playwright (`npx playwright install chromium` once, then `npm run test:e2e`) is part of
CI but not part of this local pre-push list — agents should skip it and let CI run it,
unless the change includes significant UI-visible changes or touches `e2e/` directly,
in which case run it locally too before pushing.

For UI changes reflected on the main home dashboard screen, run
`npm run screenshot:readme` before pushing to refresh `docs/assets/pr-desk-dashboard.png`.
Inspect the generated screenshot and include the updated image in the change.

## Layout

| Path                                | What lives there                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/main.rs`             | the entire Rust bridge: `gh auth status` and read-only GraphQL                                                        |
| `src/lib/github/`                   | `queries.ts` GraphQL text, `normalize.ts` raw → domain, `refresh.ts` orchestration/concurrency, `client.ts` transport |
| `src/lib/pr/`                       | `signals.ts` → `dashboard-rules.ts` → `classify.ts` → `card-view-model.ts`                                            |
| `src/lib/store/app-state.ts`        | versioned preferences and all input validation                                                                        |
| `src/App.svelte`, `src/components/` | rendering only                                                                                                        |
| `src/test/fixtures.ts`              | shared unit-test fixtures (never shipped)                                                                             |
| `e2e/dashboard.spec.ts`             | Playwright against the real UI with the Tauri boundary mocked                                                         |
| `scripts/`                          | `install.sh`, `notarize-macos.sh`, `update-homebrew.mjs` (+ its `node --test` suite)                                  |
| `docs/macos-signing.md`             | signing and notarization reference                                                                                    |

## Where changes belong

- **Classification and dashboard rules live in `src/lib/pr/`, never in Svelte
  components.** Priorities, predicates, destination columns and labels are declarative
  in `dashboard-rules.ts`; sorting is centralized in `classify.ts`.
- Fetching and normalization belong in `src/lib/github/`. Components consume the
  normalized model, not raw GraphQL shapes.
- Persisted preference shape and canonical input validation belong in
  `src/lib/store/app-state.ts`. Changing the stored shape requires bumping
  `schemaVersion` and adding a migration; an unsupported future version must stop
  loading rather than overwrite the user's file.
- The Rust bridge is deliberately narrow: argument arrays rather than a shell, a
  45-second timeout, read-only GraphQL, and it never returns authentication output or
  tokens. The separate close_stale_pr command only closes open PRs with red staleness
  and a fixed comment; keep mutations limited to that action.

## Code style

Prettier owns formatting — don't hand-format, and don't argue with it. Config is
`.prettierrc.json` (single quotes, 100 columns, `prettier-plugin-svelte`); Rust uses
`cargo fmt` and must be clippy-clean under `-D warnings`.

Interface icons come from `@lucide/svelte` only — no hand-typed Unicode glyphs as icons.
Import each icon by path (`@lucide/svelte/icons/clock`), pass only `size`, and leave
stroke, colour and alignment to the `.lucide` rule in `src/style.css`. The PR Desk brand
mark and Tauri app icons stay project artwork. See
[`docs/development.md`](docs/development.md).

Beyond formatting, match the surrounding code: small focused modules, shared types in
each folder's `types.ts`, derived data as pure functions, and comments reserved for
reasons the code cannot state — for example in `src/lib/pr/classify.ts`:

```ts
// GitHub does not expose when a PR first entered a triage state. updatedAt is the v1 approximation.
```

## Testing

- Unit tests sit next to the code as `*.test.ts`. `npm test` only scans `src`, so the
  Homebrew automation test runs separately via `node --test`.
- New dashboard rules, signals, normalization branches and validation paths need unit
  tests; UI-visible behavior needs an `e2e/` case.
- Playwright mocks the Tauri boundary rather than calling GitHub. Keep mock fixtures
  out of the shipped bundle.

## Boundaries

Never edit by hand — Release Please owns them:

- the `version` field in `package.json` (the version source of truth; Tauri reads
  `../package.json`), `.release-please-manifest.json`, and `CHANGELOG.md`.
- the `pr-desk` crate version in `src-tauri/Cargo.toml` stays `0.0.0`; it is unrelated
  to the app version.

Never:

- commit secrets, tokens, or certificates, or make the bridge return `gh auth` output;
- widen the Rust bridge into a general shell or mutating-API escape hatch;
- work around Gatekeeper with `xattr -d com.apple.quarantine`, `spctl --master-disable`
  or `--no-quarantine` in the cask — releases must stay Developer ID signed and notarized;
- edit generated or ignored trees: `dist/`, `src-tauri/target/`, `src-tauri/gen/`,
  `src-tauri/icons/`.

Ask before:

- changing the persisted preferences schema, or the GraphQL query surface;
- touching anything signing-related — `bundle.macOS` in `src-tauri/tauri.conf.json`,
  the `release` job in `.github/workflows/release-please.yml`, or
  `scripts/notarize-macos.sh`. **Read [`docs/macos-signing.md`](docs/macos-signing.md)
  first.** It documents the credentials, the non-obvious failure modes (Tauri only
  _warns_ when notarization credentials are missing; Keychain Access does not export
  the certificate chain), and how to verify a build.
- adding dependencies, especially Rust crates or Tauri plugins — each one widens the
  app's capability surface.

## Pull requests

Branch commits need not follow any convention; PRs are **squash merged** and GitHub is
configured to use the PR title as the squash commit subject. That makes the PR title
the only thing Release Please ever sees.

Before opening a PR: run the full verification list above, and state in the description
what you actually ran.

### Title

Enforced by `.github/workflows/pr-validate.yml` (`amannn/action-semantic-pull-request`):

- format `type: subject`, optionally `type(scope): subject`; scope is not required;
- **the subject must start with a lowercase letter** (`subjectPattern: ^(?![A-Z]).+$`),
  so `feat: Add snooze menu` fails and `feat: add snooze menu` passes;
- imperative mood, no trailing period, short enough to read as a changelog line;
- only the types in the table below are accepted;
- any type may carry `!` (`fix!:`, `refactor!:`) to mark a breaking change; `!` on any
  type bumps the major, so it outranks whatever the type would have done alone.

Choose the prefix matching the largest user-visible impact in the PR — a PR that adds a
feature and also refactors is `feat:`.

### Prefix → release effect

From `release-please-config.json` (`release-type: node`, `bump-minor-pre-major: false`,
`bump-patch-for-minor-pre-major: false`) plus Release Please's default changelog
sections. Both `bump-*-pre-major` flags are off deliberately, so pre-1.0 behaves exactly
like post-1.0: breaking changes go to the major, features to the minor. Examples assume
the current `0.2.0`.

| Prefix                                    | Use for                                                                                   | Version bump        | Changelog                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------- | ----------------------------- |
| `feat!:` (or a `BREAKING CHANGE:` footer) | removing or incompatibly changing behavior, config, or the stored preference shape        | **major** → `1.0.0` | Features + ⚠ BREAKING CHANGES |
| `feat:`                                   | new or extended user-facing capability                                                    | **minor** → `0.3.0` | Features                      |
| `fix:`                                    | user-visible bug fix                                                                      | **patch** → `0.2.1` | Bug Fixes                     |
| `perf:`                                   | faster or cheaper with no behavior change (fewer GraphQL requests, less work per refresh) | **patch**           | Performance Improvements      |
| `revert:`                                 | reverting a previously released change                                                    | **patch**           | Reverts                       |
| `docs:`                                   | `README.md`, `AGENTS.md`, `docs/` only                                                    | none                | hidden                        |
| `refactor:`                               | restructuring with identical behavior                                                     | none                | hidden                        |
| `test:`                                   | unit, browser or script tests only                                                        | none                | hidden                        |
| `build:`                                  | dependencies, Vite/Tauri/TypeScript build config, toolchain pins                          | none                | hidden                        |
| `ci:`                                     | `.github/workflows/`, release automation, `scripts/` release helpers                      | none                | hidden                        |
| `style:`                                  | formatting or Prettier config, no logic change                                            | none                | hidden                        |
| `chore:`                                  | anything else with no user-facing effect                                                  | none                | hidden                        |

Consequences worth knowing:

- A push to `main` whose only new commits use no-release prefixes produces **no release
  PR at all** — Release Please logs "No user facing commits found" and skips. Work that
  users should learn about must not land as `chore:`.
- Conversely, a stray `fix:` on a docs-only change publishes a release. Prefer `docs:`.
- Mislabeling is only fixable before merge. Once the squash commit is on `main`, the
  changelog and version are decided.
- `deps` appears in Release Please's default headings but is not an accepted title type
  here; use `build:` for dependency bumps.
- `Release-As: x.y.z` in the squash commit body forces a specific version. Ask first.

### Description

- What changed and why; link issues (`Fixes #12`).
- Manual verification, with screenshots for UI changes — CI cannot run the native window.
- Flag preference-schema changes, new dependencies, and anything touching signing.
- If the change is breaking and the title has no `!`, add a `BREAKING CHANGE:` footer.

### Required checks

**Validate PR Title**, **Unit and browser tests**, and **Rust checks and tests** are
required in branch protection for `main`.

## Releases

Push to `main` → tests → Release Please opens or updates a release PR → merging it tags
a GitHub Release → a macOS job builds, signs and notarizes the bundles → the
`pablaber/homebrew-tap` cask is updated. Release Please and the tap update both
authenticate through a GitHub App (`RELEASE_PLEASE_APP_CLIENT_ID` /
`RELEASE_PLEASE_APP_PRIVATE_KEY`), not a PAT. Only a real `release_created` output
starts the build; a failed tap update can be re-run from that workflow run.
`README.md` covers the required variables and secrets.

## Gotchas

- `npm run dev` cannot reach GitHub or persist anything; it exists to render the setup
  message. Use `npm run tauri dev` for real behavior.
- Local `tauri build` output is ad-hoc signed (`signingIdentity: "-"`) and shows the
  usual Gatekeeper warning. Only release builds are notarized.
- The dev app shares real preferences with the installed app — no separate demo storage.
- Pending or unknown checks never count as passing, and team review requests never
  create attention. Tests assert both.
