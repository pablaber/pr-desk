#!/bin/bash
# Notarize and staple the release DMG, then prove the built app and DMG pass Gatekeeper.
# Tauri already signs, notarizes and staples the .app, but it only *warns* when
# notarization credentials are missing, and it never notarizes the DMG itself.
set -euo pipefail

fail() { printf 'notarize-macos: %s\n' "$*" >&2; exit 1; }

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

assess() {
  local label="$1" output
  shift
  output="$(spctl --assess --verbose=4 "$@" 2>&1)" || fail "Gatekeeper rejected the $label:"$'\n'"$output"
  grep -q 'source=Notarized Developer ID' <<<"$output" ||
    fail "The $label is signed but not notarized:"$'\n'"$output"
}

# A missing ticket here means the build silently skipped notarization.
xcrun stapler validate "$app" || fail 'The app has no stapled notarization ticket.'
codesign --verify --deep --strict "$app" || fail 'The app signature is invalid.'
assess app --type execute "$app"
assess DMG --type open --context context:primary-signature "$dmg"

signature="$(codesign --display --verbose=4 "$app" 2>&1)"
grep -q 'Authority=Developer ID Application:' <<<"$signature" ||
  fail 'The app is not signed with a Developer ID Application certificate.'
grep -q '^Timestamp=' <<<"$signature" || fail 'The app signature has no secure timestamp.'
grep -qE '^CodeDirectory .*flags=.*runtime' <<<"$signature" ||
  fail 'The app was signed without the hardened runtime.'

printf 'Notarized and stapled %s\n' "$dmg"
