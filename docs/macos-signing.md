# macOS signing and notarization

How PR Desk releases are Developer ID signed, notarized by Apple, and verified.
Read this before changing anything under `bundle.macOS` in `src-tauri/tauri.conf.json`,
the `release` job in `.github/workflows/release-please.yml`, or `scripts/notarize-macos.sh`.

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
  → macOS build job (sign, notarize, staple, verify) → Homebrew tap updated
```

Inside the `release` job:

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

`update-homebrew` requires `needs.release.result == 'success'`, so any signing,
notarization or verification failure leaves the tap pointing at the previous
release rather than at an unnotarized artifact.

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
