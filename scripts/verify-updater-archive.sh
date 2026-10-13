#!/bin/bash
# Prove the updater archive that will be published contains the notarized app, by extracting it
# the way the updater does and running the same checks as the release DMG's app.
set -euo pipefail

# shellcheck source=macos-verify.sh
source "$(dirname "${BASH_SOURCE[0]}")/macos-verify.sh"

bundle_dir="${1:?Usage: verify-updater-archive.sh <bundle directory> <version>}"
version="${2:?Expected app version is required}"

archive="$bundle_dir/macos/PR Desk.app.tar.gz"
[[ -f "$archive" ]] || fail "Missing updater archive: $archive"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
tar -xzf "$archive" -C "$work" || fail 'Could not extract the updater archive.'
shopt -s nullglob dotglob
entries=("$work"/*)
[[ ${#entries[@]} -eq 1 && "${entries[0]##*/}" == 'PR Desk.app' ]] ||
  fail 'The updater archive must contain exactly PR Desk.app.'
app="${entries[0]}"

verify_app "$app"

plist="$app/Contents/Info.plist"
actual="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")"
[[ "$actual" == "$version" ]] || fail "The archived app is version $actual, expected $version."
identifier="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")"
[[ "$identifier" == 'dev.prdesk.desktop' ]] || fail "Unexpected bundle identifier: $identifier"

printf 'Verified the notarized app inside %s\n' "$archive"
