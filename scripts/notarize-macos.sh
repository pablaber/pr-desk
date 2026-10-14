#!/bin/bash
# Notarize and staple the release DMG, then prove the built app and DMG pass Gatekeeper.
# Tauri already signs, notarizes and staples the .app, but it only *warns* when
# notarization credentials are missing, and it never notarizes the DMG itself.
set -euo pipefail

# shellcheck source=macos-verify.sh
source "$(dirname "${BASH_SOURCE[0]}")/macos-verify.sh"

bundle_dir="${1:?Usage: notarize-macos.sh <bundle directory>}"
: "${APPLE_API_KEY_PATH:?App Store Connect key path is required}"
: "${APPLE_API_KEY:?App Store Connect key ID is required}"
: "${APPLE_API_ISSUER:?App Store Connect issuer ID is required}"

app="$bundle_dir/macos/PR Desk.app"
[[ -d "$app" ]] || fail "Missing built application: $app"
shopt -s nullglob
dmgs=("$bundle_dir/dmg/"*.dmg)
[[ ${#dmgs[@]} -eq 1 ]] || fail 'Expected exactly one built DMG.'
dmg="${dmgs[0]}"

# The disk image is the artifact users and Homebrew actually download, so it needs
# its own notarization ticket in addition to the one stapled inside the app.
xcrun notarytool submit "$dmg" \
  --key "$APPLE_API_KEY_PATH" \
  --key-id "$APPLE_API_KEY" \
  --issuer "$APPLE_API_ISSUER" \
  --wait --timeout 30m || fail 'Apple did not accept the DMG for notarization.'
xcrun stapler staple "$dmg" || fail 'Could not staple the notarization ticket to the DMG.'

verify_app "$app"
assess DMG --type open --context context:primary-signature "$dmg"

printf 'Notarized and stapled %s\n' "$dmg"
