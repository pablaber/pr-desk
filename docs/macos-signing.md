# macOS signing and notarization

How PR Desk releases are Developer ID signed, notarized by Apple, and verified.
Read this before changing anything under `bundle.macOS` in `src-tauri/tauri.conf.json`,
the `release` job in `.github/workflows/release-please.yml`, `scripts/notarize-macos.sh`,
or the updater release files described in [Updater artifacts](#updater-artifacts).

The goal is that `brew install --cask pablaber/tap/pr-desk` installs an app that
launches with no Gatekeeper prompt. Gatekeeper bypasses are not an acceptable
substitute: no `xattr -d com.apple.quarantine`, no `spctl --master-disable`, no
`--no-quarantine` in the cask.

## Identities

| Value               |                                                               |
| ------------------- | ------------------------------------------------------------- |
| Apple team          | Tasting Grounds, LLC                                          |
| Team ID             | `Q8V7YUM976`                                                  |
| Signing identity    | `Developer ID Application: Tasting Grounds, LLC (Q8V7YUM976)` |
| Certificate type    | Developer ID Application (G2 Sub-CA)                          |
| Certificate expires | September 16, 2031                                            |
| Bundle identifier   | `dev.prdesk.desktop`                                          |
| Account Holder      | `patrick@tastinggrounds.com`                                  |

Developer ID Application is the correct certificate because PR Desk ships outside
the Mac App Store. Mac Development certificates only run on registered machines
and Mac App Distribution certificates only work through the App Store.

Creating or revoking a Developer ID certificate requires the **Account Holder**
Apple ID. Team members, even Admins, see the option greyed out.

## Credentials

Set on `pablaber/pr-desk`. The release job fails fast with a named error if any is missing.

| Name                         | Kind     | Value                                                                                 |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `APPLE_SIGNING_IDENTITY`     | variable | The full identity string above. Not sensitive; it is embedded in every signed binary. |
| `APPLE_CERTIFICATE`          | secret   | Base64 of the Developer ID Application `.p12` (certificate **and** private key).      |
| `APPLE_CERTIFICATE_PASSWORD` | secret   | Password chosen when exporting that `.p12`.                                           |
| `APPLE_API_KEY`              | secret   | App Store Connect API **Key ID** (10 characters).                                     |
| `APPLE_API_ISSUER`           | secret   | App Store Connect **Issuer ID** (UUID).                                               |
| `APPLE_API_KEY_BASE64`       | secret   | Base64 of the `AuthKey_<KeyID>.p8` downloaded when the key was created.               |

There is deliberately **no** `KEYCHAIN_PASSWORD`. Tauri creates and tears down its
own randomly named temporary keychain whenever `APPLE_CERTIFICATE` is set, so the
manual `security create-keychain` steps in Tauri's own documentation are unnecessary
here. Adding them would create a second keychain that nothing reads.

Notarization uses App Store Connect API keys rather than Apple ID plus
app-specific password: the key survives Apple ID password and 2FA changes, and is
revocable on its own. Do not configure both — `notarize_auth()` checks the
`APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` triple _first_, so a stray `APPLE_ID`
would silently take precedence over the API key.

Backups live in 1Password. The GitHub secrets are write-only and are not backups.
The real recovery path for the certificate is the private key in the login keychain
of the Mac that created it, which can be re-exported at any time.

## Release pipeline

Unchanged from the existing flow apart from the signing stage:

```text
squash merge to main → Release Please → release PR merged → GitHub Release
  → macOS build job (sign, notarize, staple, verify, publish updater metadata last)
  → Homebrew tap updated
```

Inside the `release` job:

0. **Check updater signing secrets** — fails fast if `TAURI_SIGNING_PRIVATE_KEY` or
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is missing; see [Updater artifacts](#updater-artifacts).
1. **Stage the App Store Connect notarization key** — checks every credential is
   present, decodes the `.p8` to `$RUNNER_TEMP/AuthKey.p8`, and exports its path.
2. **Install Apple's Developer ID G2 intermediate certificate** — see below.
3. **`tauri-apps/tauri-action`** — builds, signs the app with the hardened runtime
   and a secure timestamp, notarizes it, staples the ticket into the bundle, then
   signs the DMG.
4. **`scripts/notarize-macos.sh`** — notarizes and staples the DMG itself, then
   verifies both artifacts.
5. **Replace the uploaded DMG** — `gh release upload --clobber`, because stapling
   changes the DMG's bytes after `tauri-action` already uploaded it.
6. **Homebrew metadata** — `scripts/update-homebrew.mjs` hashes the local DMG and
   asserts the uploaded asset's digest matches.
7. **Updater artifacts** — verify, then publish `latest.json` last; see below.

`update-homebrew` requires `needs.release.result == 'success'`, so any signing,
notarization or verification failure leaves the tap pointing at the previous
release rather than at an unnotarized artifact.

## Updater artifacts

In-app updates use a **separate signing key from Apple's**. Apple signing and
notarization make Gatekeeper accept the app; the Tauri updater key makes the installed app
accept an update. The updater verifies a minisign signature over the downloaded archive
against the public key embedded in the app (`plugins.updater.pubkey` in
`src-tauri/tauri.conf.json`) and refuses anything else, so a leaked Apple credential cannot
ship an update and a leaked updater key cannot make Gatekeeper accept anything.

| Name                                 | Kind   | Value                                                         |
| ------------------------------------ | ------ | ------------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | secret | Contents of the private key file from `tauri signer generate` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secret | Password chosen when generating it                            |

`src-tauri/tauri.release.conf.json` sets `bundle.createUpdaterArtifacts`. Only the release
workflow passes it (`--config src-tauri/tauri.release.conf.json`), so ordinary
`npm run tauri build` still needs no signing secrets. Key generation, backup and rotation are
in [Release maintenance](development.md#updater-signing-key).

With that overlay, Tauri archives the already signed, notarized and stapled app and signs the
archive. `tauri-action` uploads the files without a version in their names, and GitHub turns
the space into a dot:

| Built file (`bundle/macos/`)  | Release asset                    |
| ----------------------------- | -------------------------------- |
| `PR Desk.app.tar.gz`          | `PR.Desk_aarch64.app.tar.gz`     |
| `PR Desk.app.tar.gz.sig`      | `PR.Desk_aarch64.app.tar.gz.sig` |
| (generated by the final step) | `latest.json`                    |

`includeUpdaterJson` stays `false`: the action would write `latest.json` straight after
the build, before any verification. Instead, after the DMG and Homebrew metadata checks, the
job runs these steps in order and stops at the first failure:

1. `scripts/updater-release.mjs verify` — the release is published and tagged `v<version>`;
   the local `.sig` is a valid signature of the local archive under the public key in
   `tauri.conf.json` (a wrong or rotated private key fails here, not on users' machines);
   both uploaded assets have the exact bytes of the local files (GitHub's `sha256:` digest).
2. `scripts/verify-updater-archive.sh` — extracts the local archive and runs the same
   checks as for the DMG's app (`scripts/macos-verify.sh`: stapled ticket, `codesign`,
   `spctl` reporting `Notarized Developer ID`, hardened runtime, secure timestamp), plus the
   version and bundle identifier.
3. `scripts/updater-release.mjs latest` — writes `latest.json` (version, release notes, date,
   and the `darwin-aarch64` signature and URL under `releases/download/v<version>/`).
4. `gh release upload` publishes `latest.json`, the last asset.
5. `scripts/updater-release.mjs verify-latest` — the published file is the local file.

Release Please publishes the release before this job runs, so
`releases/latest/download/latest.json` returns 404 for the few minutes the build takes, and
until a failed build is re-run. The app treats that as a retryable check failure rather
than "up to date". Recovery steps are in
[Release maintenance](development.md#recovering-a-release-without-latestjson).

### Verifying updater artifacts by hand

Inspect a published release without trusting the workflow:

```sh
tag=v1.18.0
curl -fsSL "https://github.com/pablaber/pr-desk/releases/download/$tag/latest.json"
gh release view "$tag" --repo pablaber/pr-desk --json assets \
  -q '.assets[] | [.name, .digest] | @tsv'
```

`latest.json` must name `darwin-aarch64`, a URL under `/releases/download/$tag/`, and a
`signature` equal to the contents of `PR.Desk_aarch64.app.tar.gz.sig`. To re-run the full
script verification against downloaded assets, use the recovery procedure, which runs the same
scripts.

### Validating a real signed upgrade

The automated checks prove the artifacts are well formed; they cannot prove an installed
older build upgrades itself. Do that with two throwaway builds, a **test-only key** and a
GitHub **prerelease**. The production endpoint reads `releases/latest`, which ignores
prereleases, and the test builds point at the prerelease instead, so no production user is
offered a test build and no Release Please-managed file (`package.json`, the manifest,
`CHANGELOG.md`) changes. All overrides live in overlay files in a temporary directory.

Both builds use the production bundle identifier, so they share preferences with any
installed PR Desk. Quit the installed app first, and back up its data if it matters.

```sh
# Run from the repository root, on a branch that contains the updater.
tag=updater-test-1
test_dir="$(mktemp -d)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD='choose-a-throwaway-password'
export TAURI_SIGNING_PRIVATE_KEY_PATH="$test_dir/updater-test.key"
bundle="src-tauri/target/release/bundle/macos"

# 1. A throwaway key; never the production one.
npx tauri signer generate --ci -p "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD" -w "$TAURI_SIGNING_PRIVATE_KEY_PATH"

# 2. One overlay per version: a higher version, the test public key and the prerelease endpoint.
write_overlay() {
  cat > "$test_dir/tauri.$1.conf.json" <<EOF
{
  "version": "$1",
  "bundle": { "createUpdaterArtifacts": true },
  "plugins": {
    "updater": {
      "pubkey": "$(cat "$TAURI_SIGNING_PRIVATE_KEY_PATH.pub")",
      "endpoints": ["https://github.com/pablaber/pr-desk/releases/download/$tag/latest.json"]
    }
  }
}
EOF
}
write_overlay 99.0.0
write_overlay 99.0.1

# 3. Build the old version; keep a pristine copy and an installed copy to upgrade.
npm run tauri build -- --bundles app --config "$test_dir/tauri.99.0.0.conf.json"
ditto "$bundle/PR Desk.app" "$test_dir/old/PR Desk.app"
ditto "$test_dir/old/PR Desk.app" "$test_dir/install/PR Desk.app"

# 4. Build the new version and stage release assets under the names the workflow publishes.
npm run tauri build -- --bundles app --config "$test_dir/tauri.99.0.1.conf.json"
mkdir "$test_dir/assets"
cp "$bundle/PR Desk.app.tar.gz" "$test_dir/assets/PR.Desk_aarch64.app.tar.gz"
cat > "$test_dir/assets/latest.json" <<EOF
{
  "version": "99.0.1",
  "notes": "Updater validation build",
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platforms": {
    "darwin-aarch64": {
      "signature": "$(cat "$bundle/PR Desk.app.tar.gz.sig")",
      "url": "https://github.com/pablaber/pr-desk/releases/download/$tag/PR.Desk_aarch64.app.tar.gz"
    }
  }
}
EOF

# 5. Publish as a prerelease and confirm production does not see it.
gh release create "$tag" --repo pablaber/pr-desk --prerelease --target main \
  --title "Updater validation (do not install)" --notes "Test-only; deleted after validation." \
  "$test_dir/assets/latest.json" "$test_dir/assets/PR.Desk_aarch64.app.tar.gz"
curl -fsSL https://github.com/pablaber/pr-desk/releases/latest/download/latest.json | grep -c 99.0.1  # expect 0

# 6. Run the old build, set up repositories, snoozes and ignores, then use Check for updates.
open "$test_dir/install/PR Desk.app"
```

Expect the dialog to offer 99.0.1; after **Update and restart** the app relaunches as 99.0.1
with its repositories, settings, snoozes and ignores intact.

To confirm a bad signature is rejected, publish an archive that no longer matches its signature
and check again from a fresh copy of the old build. The app must show an error, stay on 99.0.0
and not relaunch:

```sh
mkdir "$test_dir/tampered"
cp "$test_dir/assets/PR.Desk_aarch64.app.tar.gz" "$test_dir/tampered/"
printf 'x' >> "$test_dir/tampered/PR.Desk_aarch64.app.tar.gz"
gh release upload "$tag" "$test_dir/tampered/PR.Desk_aarch64.app.tar.gz" --repo pablaber/pr-desk --clobber
rm -rf "$test_dir/install"
ditto "$test_dir/old/PR Desk.app" "$test_dir/install/PR Desk.app"
open "$test_dir/install/PR Desk.app"
```

Clean up:

```sh
gh release delete "$tag" --repo pablaber/pr-desk --cleanup-tag --yes
rm -rf "$test_dir"
```

These builds are ad-hoc signed, so this validates the updater's download, signature check,
install and relaunch, not Developer ID signing or notarization; the release workflow's checks
cover those. To exercise them too, sign the builds as described in [Local builds](#local-builds).

## Why the explicit verification exists

Tauri only _warns_ when notarization credentials are missing:

```rust
// crates/tauri-bundler/src/bundle/macos/app.rs
match notarize_auth() {
  Ok(auth) => { /* notarize and staple */ }
  Err(e) => {
    if matches!(e, NotarizeAuthError::MissingTeamId) { return Err(e.into()); }
    else { log::warn!("skipping app notarization, {e}"); }
  }
}
```

A build with a broken credential therefore _succeeds_, producing a signed but
unnotarized app that still trips Gatekeeper on users' machines. `scripts/notarize-macos.sh`
is what turns that into a hard failure. It checks:

- `stapler validate` on the app — a stapled ticket is present
- `codesign --verify --deep --strict` — the signature is intact
- `spctl --assess` on both app and DMG reports `source=Notarized Developer ID`
- `codesign --display` shows `Authority=Developer ID Application:`, a `Timestamp=`,
  and `flags=…(runtime)`

Checking for the exact `source=Notarized Developer ID` string matters: a local
Gatekeeper override ("Open Anyway") would also make `spctl` exit zero, but reports
a different source.

## The G2 intermediate

Keychain Access does not bundle the issuing chain into an exported `.p12` — the
export contains only the leaf certificate and private key. `codesign` merely
_warns_ when it cannot build a chain to a trusted root and then embeds an
incomplete chain, which Apple's notary service rejects.

macOS ships the older G1 intermediate in its system roots, but PR Desk's
certificate is issued by G2:

```text
issuer=CN=Developer ID Certification Authority, OU=G2, O=Apple Inc., C=US
```

So the workflow downloads and imports it explicitly rather than depending on the
runner image. The same fix applies to a developer machine where
`security find-identity -v -p codesigning` reports `0 valid identities found` and
Keychain Access shows "certificate is not trusted":

```sh
curl -fsSLO https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer
security import DeveloperIDG2CA.cer -k ~/Library/Keychains/login.keychain-db
```

The intermediate's Subject Key Identifier must match the certificate's Authority
Key Identifier (`F8:3A:0C:69:11:76:E0:ED:AC:D1:EB:A6:59:FA:37:D5:C4:55:B0:1E`).

## Local builds

`src-tauri/tauri.conf.json` keeps `bundle.macOS.signingIdentity: "-"`, so ordinary
`npm run tauri build` produces an ad-hoc signed app and needs no Apple credentials.
CI overrides it with the `APPLE_SIGNING_IDENTITY` environment variable, which takes
precedence over the config value (`tauri-cli/src/interface/rust.rs`).

Do not set the config value to the real identity: the DMG bundler skips signing
when the identity is exactly `"-"`, and the ad-hoc default keeps local builds fast
and offline.

To reproduce the full release signing locally:

```sh
export APPLE_SIGNING_IDENTITY="Developer ID Application: Tasting Grounds, LLC (Q8V7YUM976)"
export APPLE_API_KEY_PATH=~/.appstoreconnect/private_keys/AuthKey_<KeyID>.p8
export APPLE_API_KEY=<KeyID>
export APPLE_API_ISSUER=<IssuerID>

npm run tauri build -- --bundles app,dmg
./scripts/notarize-macos.sh src-tauri/target/release/bundle
```

`APPLE_CERTIFICATE` and `APPLE_CERTIFICATE_PASSWORD` are not needed locally; they
exist only so CI can reconstruct what is already in the login keychain.

## Troubleshooting

**`skipping app notarization` in the build log.** Tauri could not read the
notarization credentials. Check `APPLE_API_KEY`, `APPLE_API_ISSUER` and
`APPLE_API_KEY_PATH`, and that the path actually exists.

**Notarization rejected.** `notarytool` prints a submission ID; get the reason with

```sh
xcrun notarytool log <submission-id> \
  --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER"
```

Usual causes are a missing hardened runtime or an incomplete certificate chain.

**`0 valid identities found` / "certificate is not trusted".** Missing G2
intermediate; see above.

**`error:0308010C … RC2-40-CBC … unsupported` when inspecting a `.p12`.** Keychain
Access encrypts the certificate bag with RC2-40, which OpenSSL 3 moved to its
legacy provider. Pass `-legacy`, or use `/usr/bin/openssl` (LibreSSL). This affects
inspection only — macOS `security import` reads the file natively, so CI is unaffected.

**Verifying Gatekeeper behaviour.** A locally built app carries no quarantine
attribute, so it launches without any check regardless of notarization; double
clicking it proves nothing. Use `spctl --assess`, or quarantine a throwaway copy
the way a download would:

```sh
ditto "src-tauri/target/release/bundle/macos/PR Desk.app" "/tmp/gktest/PR Desk.app"
xattr -w com.apple.quarantine "0081;$(printf %x $(date +%s));Safari;$(uuidgen)" "/tmp/gktest/PR Desk.app"
open "/tmp/gktest/PR Desk.app"
```

An app already approved via "Open Anyway" records that approval in its own
quarantine flags (the `0x40` bit), so delete any existing `/Applications/PR Desk.app`
before an end-to-end install test.

## Renewal and rotation

**Certificate (before September 2031, or if revoked).** Create a CSR in Keychain
Access, create a new Developer ID Application certificate as the Account Holder,
install it, verify the private key is attached under **login → My Certificates**,
export a `.p12`, and update `APPLE_CERTIFICATE` and `APPLE_CERTIFICATE_PASSWORD`.
Update `APPLE_SIGNING_IDENTITY` only if the certificate's common name changed.
Already-published builds keep validating after expiry because they carry a secure
timestamp; expiry only blocks new signatures.

**Notarization key.** Create a replacement at
<https://appstoreconnect.apple.com/access/integrations/api> with **Developer**
access, update `APPLE_API_KEY`, `APPLE_API_ISSUER` and `APPLE_API_KEY_BASE64`, then
revoke the old key. The `.p8` is downloadable exactly once.
