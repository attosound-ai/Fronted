#!/bin/bash
# Release gate (Oct 3 2026). Build 228 shipped without a real call test and
# answering a cold call crashed the app for a creator the same day. A
# production build now needs, committed in docs/pruebas/release/:
#   <sha>.md   the record of the device tests run on commit <sha>, one line
#              per case of CASOS_CRITICOS.txt: | <ID> | OK | <evidence> |
# and nothing may have changed outside docs/ between <sha> and HEAD, so the
# binary that ships is the one that was tested.
set -euo pipefail
cd "$(dirname "$0")/.."
# Every profile: a patch edited without refreshing pnpm-lock.yaml fails the
# EAS install step (ERR_PNPM_LOCKFILE_CONFIG_MISMATCH) after a full upload
# (Oct 3, fix5). Catch it here in seconds. Only in the repository, where
# build:ios runs; the EAS copy installs right after anyway.
if git rev-parse --git-dir >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1; then
  if ! pnpm install --frozen-lockfile --lockfile-only --ignore-scripts >/dev/null 2>&1; then
    echo "[release-gate] REFUSED: pnpm-lock.yaml is out of date (patch or dependency changed). Run pnpm install and commit the lockfile."; exit 1
  fi
fi
PROFILE="${EAS_BUILD_PROFILE:-${1:-}}"
# Build 245 (Oct 26 2026) was archived with Xcode 27 and closed on launch on
# every iOS 27 phone: UIKit requires the scene life cycle from apps linked with
# the iOS 27 SDK (_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption),
# and ATTO has no UIApplicationSceneManifest. David's and Anthony's phones ran
# iOS 26, so every test passed. Until the app adopts scenes, nothing shipped or
# tested is built with Xcode 27 or later; EAS cloud builds use the Xcode 26
# image pinned in eas.json, and so pass. Not even the emergency override skips
# this, because the binary cannot open on half the users' phones.
if command -v xcodebuild >/dev/null 2>&1 && [ "$(uname)" = "Darwin" ]; then
  XCODE_MAJOR=$(xcodebuild -version 2>/dev/null | awk '/^Xcode/{split($2,v,".");print v[1]}')
  if [ -n "$XCODE_MAJOR" ] && [ "$XCODE_MAJOR" -ge 27 ] && ! grep -q "UIApplicationSceneManifest" app.json; then
    if [ "$PROFILE" = "production" ]; then
      echo "[release-gate] REFUSED: Xcode $XCODE_MAJOR builds against the iOS 27 SDK and the app has no scene life cycle; it would close on launch on iOS 27. Build in the EAS cloud (image pinned in eas.json) or with Xcode 26."; exit 1
    fi
    echo "[release-gate] WARNING: Xcode $XCODE_MAJOR without scene life cycle: this build closes on launch on iOS 27 phones. Test it on iOS 26 only, and never ship it."
  fi
fi
if [ "$PROFILE" != "production" ]; then echo "[release-gate] profile '$PROFILE': no gate"; exit 0; fi
if [ "${ATTO_RELEASE_GATE_OVERRIDE:-}" = "emergency" ]; then
  echo "[release-gate] OVERRIDE emergency: shipping without a complete test record"; exit 0
fi
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  # Inside an EAS working copy without history: the gate already ran in the
  # repository through npm run build:ios, the only way production is built.
  echo "[release-gate] no git history in this copy; enforced by npm run build:ios"; exit 0
fi
DIR=docs/pruebas/release
CASES=$(grep -v '^#' $DIR/CASOS_CRITICOS.txt | awk 'NF{print $1}')
best=""
for f in $(ls -t $DIR/*.md 2>/dev/null); do
  sha=$(basename "$f" .md)
  git cat-file -e "$sha^{commit}" 2>/dev/null || continue
  changed=$(git diff --name-only "$sha" HEAD | grep -v '^docs/' || true)
  if [ -n "$changed" ]; then continue; fi
  best="$f"; break
done
if [ -z "$best" ]; then
  echo "[release-gate] REFUSED: no test record for a commit whose code equals HEAD."
  echo "  Run the device tests on HEAD and commit $DIR/<sha>.md (see CASOS_CRITICOS.txt)."
  exit 1
fi
missing=""
for c in $CASES; do
  if ! grep -Eq "^\|[[:space:]]*$c[[:space:]]*\|[[:space:]]*OK[[:space:]]*\|[[:space:]]*[^|[:space:]]" "$best"; then missing="$missing $c"; fi
done
if [ -n "$missing" ]; then
  echo "[release-gate] REFUSED: $best lacks OK with evidence for:$missing"; exit 1
fi
echo "[release-gate] OK: $best covers every critical case"
