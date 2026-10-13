# shellcheck shell=bash
# Shared Gatekeeper and signature checks for macOS artifacts. Source this file; it is not run directly.

fail() { printf '%s: %s\n' "${0##*/}" "$*" >&2; exit 1; }

assess() {
  local label="$1" output
  shift
  output="$(spctl --assess --verbose=4 "$@" 2>&1)" || fail "Gatekeeper rejected the $label:"$'\n'"$output"
  grep -q 'source=Notarized Developer ID' <<<"$output" ||
    fail "The $label is signed but not notarized:"$'\n'"$output"
}

# Proves an app bundle is a stapled, hardened-runtime, Developer ID signed build that Gatekeeper accepts.
verify_app() {
  local app="$1" signature
  # A missing ticket here means the build silently skipped notarization.
  xcrun stapler validate "$app" || fail 'The app has no stapled notarization ticket.'
  codesign --verify --deep --strict "$app" || fail 'The app signature is invalid.'
  assess app --type execute "$app"

  signature="$(codesign --display --verbose=4 "$app" 2>&1)"
  grep -q 'Authority=Developer ID Application:' <<<"$signature" ||
    fail 'The app is not signed with a Developer ID Application certificate.'
  grep -q '^Timestamp=' <<<"$signature" || fail 'The app signature has no secure timestamp.'
  grep -qE '^CodeDirectory .*flags=.*runtime' <<<"$signature" ||
    fail 'The app was signed without the hardened runtime.'
}
