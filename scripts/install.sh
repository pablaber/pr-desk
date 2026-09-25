#!/bin/bash
# Install the latest published Apple Silicon build using authenticated GitHub access.
set -euo pipefail

fail() { printf 'PR Desk: %s\n' "$*" >&2; exit 1; }
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || fail 'Requires an Apple Silicon Mac (run outside Rosetta).'
command -v gh >/dev/null 2>&1 || fail 'Install GitHub CLI first: brew install gh'
gh auth status --hostname github.com >/dev/null 2>&1 || fail 'Authenticate first: gh auth login --hostname github.com'

repo=pablaber/pr-desk
install_dir="${PR_DESK_INSTALL_DIR:-$HOME/Applications}"
app="$install_dir/PR Desk.app"
[[ ! -L "$app" ]] || fail "Refusing to replace symlink: $app"
if /usr/bin/pgrep -x pr-desk >/dev/null; then
  fail 'Quit PR Desk before installing or upgrading.'
fi

# Keep staging and backup on the destination filesystem for atomic renames.
mkdir -p "$install_dir"
work="$(mktemp -d "$install_dir/.pr-desk-install.XXXXXX")"
cleanup() {
  if [[ -d "$work/previous.app" && ! -e "$app" ]]; then
    mv "$work/previous.app" "$app" || { printf 'Restore backup manually from %s\n' "$work/previous.app" >&2; return; }
  fi
  rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

tag="$(gh release view --repo "$repo" --json tagName --jq .tagName)" || fail "Cannot find a published release in $repo. Check repository access."
printf 'Downloading PR Desk %s…\n' "$tag"
gh release download "$tag" --repo "$repo" --pattern '*_aarch64.dmg' --dir "$work" || fail 'No Apple Silicon DMG is available yet. Check the release build and try again.'
shopt -s nullglob
dmgs=("$work/"*.dmg)
[[ ${#dmgs[@]} -eq 1 ]] || fail 'Expected exactly one Apple Silicon DMG.'
mkdir "$work/mount"
/usr/bin/hdiutil attach "${dmgs[0]}" -readonly -nobrowse -mountpoint "$work/mount" >/dev/null
# Always detach the mounted image before cleaning up.
cleanup_mounted() {
  if /usr/bin/hdiutil detach "$work/mount" >/dev/null 2>&1; then
    cleanup
  else
    printf 'Could not detach disk image; staging retained at %s\n' "$work" >&2
  fi
}
trap cleanup_mounted EXIT
[[ -d "$work/mount/PR Desk.app" ]] || fail 'The disk image does not contain PR Desk.app.'
/usr/bin/ditto "$work/mount/PR Desk.app" "$work/new.app"
/usr/bin/hdiutil detach "$work/mount" >/dev/null
trap cleanup EXIT
/usr/bin/codesign --verify --deep --strict "$work/new.app" || fail 'The downloaded app has an invalid signature.'
identifier="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$work/new.app/Contents/Info.plist")"
[[ "$identifier" == dev.prdesk.desktop ]] || fail 'Unexpected application identifier.'
if [[ -e "$app" ]]; then
  [[ -d "$app" ]] || fail "Destination is not an application directory: $app"
  mv "$app" "$work/previous.app"
fi
mv "$work/new.app" "$app"
printf 'Installed PR Desk %s to %s\n' "$tag" "$app"
printf 'Open with: open "%s"\n' "$app"
