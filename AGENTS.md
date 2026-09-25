# Agent guide

Context for automated agents and new contributors working in this repository.
`README.md` is the user-facing documentation; this file covers working conventions.

## What this is

A macOS pull request dashboard built with Tauri 2, Svelte 5, TypeScript and Vite.
All GitHub access goes through the user's authenticated `gh` CLI — the app never
handles tokens itself. Reviewing, commenting and merging happen on GitHub; the app
opens PRs in the browser.

## Commands

```sh
npm ci                 # install
npm run tauri dev      # native dev window (needs authenticated gh)
npm run dev            # frontend only; shows a native-app setup message
npm test               # unit tests (vitest)
npm run check          # svelte-check + TypeScript
npm run format:check   # prettier; CI fails on unformatted files
npm run test:e2e       # playwright
npm run tauri build    # ad-hoc signed local app
node --test scripts/update-homebrew.test.mjs
```

Rust checks, run from the repository root:

```sh
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Rust is pinned to 1.94.0 by `rust-toolchain.toml`. Node 22.12+ or 24+.

## Conventions

- **Conventional Commit PR titles are enforced** by `.github/workflows/pr-validate.yml`
  and drive Release Please versioning. `feat:` bumps the minor version, `fix:` the
  patch, `feat!:` or a `BREAKING CHANGE:` footer the major — including before 1.0.
  Intermediate branch commits need not follow the convention; PRs are squash merged.
- `package.json` is the version source of truth. Release Please maintains it and
  `.release-please-manifest.json`; do not hand-edit either. Tauri reads
  `../package.json`. The `pr-desk` crate version (`0.0.0`) is unrelated to the app version.
- Prettier formats everything not in `.prettierignore`. Run `npm run format` before pushing.
- Classification and dashboard rules live in `src/lib/pr/`, never in Svelte components.
  `src/lib/github/` owns fetching and normalization; `src/lib/store/` owns versioned
  preferences and input validation.
- The Rust bridge in `src-tauri/src/main.rs` is deliberately narrow: argument arrays
  rather than a shell, a 45-second timeout, read-only GraphQL, and it never returns
  authentication output or tokens. Keep it that way.

## Releases

Push to `main` → tests → Release Please opens or updates a release PR → merging it
tags a GitHub Release → a macOS job builds, signs and notarizes the bundles → the
`pablaber/homebrew-tap` cask is updated. Release Please and the tap update both
authenticate through a GitHub App (`RELEASE_PLEASE_APP_ID` /
`RELEASE_PLEASE_APP_PRIVATE_KEY`), not a PAT.

**Read [`docs/macos-signing.md`](docs/macos-signing.md) before touching anything
related to code signing** — `bundle.macOS` in `src-tauri/tauri.conf.json`, the
`release` job in `.github/workflows/release-please.yml`, or `scripts/notarize-macos.sh`.
It documents the Developer ID and notarization credentials, the non-obvious failure
modes (Tauri only _warns_ when notarization credentials are missing; Keychain Access
does not export the certificate chain), and how to verify a build.

Releases must be Developer ID signed and notarized. Never work around Gatekeeper
with `xattr -d com.apple.quarantine`, `spctl --master-disable`, or `--no-quarantine`
in the cask.
