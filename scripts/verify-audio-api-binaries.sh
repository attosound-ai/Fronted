#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# ATTO SOUND — preflight: react-native-audio-api prebuilt binaries
# ══════════════════════════════════════════════════════════════════════════════
#
# WHY THIS EXISTS
#
# react-native-audio-api does not ship its native static libs on npm. Its podspec
# runs `scripts/download-prebuilt-binaries.sh` as a `prepare_command`, pulling
# ~107 MB of zips from a GitHub release during `pod install`. That upstream script
# has two defects that cost us a full build cycle on Aug 3 2026:
#
#   1. A failed download prints "Error: Download failed" and then `continue`s, so
#      the script still exits 0 and `pod install` reports success. The build then
#      dies ~20 minutes later at link time with `ld: library 'crypto' not found`,
#      an error that says nothing about a missing download.
#
#   2. It skips a download when the destination DIRECTORY exists, without checking
#      that it is complete. An interrupted unzip therefore leaves a partial tree
#      that is treated as done forever. It never self-heals.
#
# So we verify the artifacts ourselves, before burning a build. Run this after any
# `pod install` / prebuild, and before `eas build`.
#
# Exit 0 = every expected lib is present and plausibly sized.
# Exit 1 = something is missing or truncated; the message says how to repair it.

set -u

EXTERNAL_DIR="node_modules/react-native-audio-api/common/cpp/audioapi/external"

# Device slice only. The simulator slice is not linked into a TestFlight build,
# and demanding it would fail preflight on machines that only ever build for
# device.
DEVICE_DIR="${EXTERNAL_DIR}/iphoneos"

# The libs the iOS link step actually needs, with a floor on size. The floor
# catches a truncated or HTML-error-page download, which a mere -f test does not.
# Each floor is HALF the real size measured in the v0.11.7 tree that produced
# build 132, so a legitimate upstream version bump does not trip them but a
# truncated download does.
REQUIRED_LIBS=(
  "libcrypto.a:3957256"
  "libssl.a:803836"
  "libopus.a:312840"
  "libopusfile.a:34176"
  "libogg.a:18060"
  "libvorbis.a:124904"
  "libvorbisfile.a:18396"
  "libvorbisenc.a:345472"
)

if [ ! -d "$EXTERNAL_DIR" ]; then
  echo "❌ react-native-audio-api binaries missing entirely: $EXTERNAL_DIR"
  echo "   They are downloaded by pod install. Run a prebuild + pod install first."
  exit 1
fi

if [ ! -d "$DEVICE_DIR" ]; then
  echo "❌ Device slice missing: $DEVICE_DIR"
  echo "   REPAIR: rm -rf \"$EXTERNAL_DIR\" && npx expo prebuild -p ios --clean"
  exit 1
fi

failed=0
for entry in "${REQUIRED_LIBS[@]}"; do
  lib="${entry%%:*}"
  floor="${entry##*:}"
  path="${DEVICE_DIR}/${lib}"

  if [ ! -f "$path" ]; then
    echo "❌ MISSING  ${lib}"
    failed=1
    continue
  fi

  # stat is BSD on macOS, GNU on Linux/CI. Try both.
  size=$(stat -f%z "$path" 2>/dev/null || stat -c%s "$path" 2>/dev/null || echo 0)
  if [ "$size" -lt "$floor" ]; then
    echo "❌ TRUNCATED ${lib} (${size} bytes, expected at least ${floor})"
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  echo ""
  echo "react-native-audio-api's prebuilt binaries are incomplete."
  echo "Its downloader skips any directory that already exists, so a partial"
  echo "download never repairs itself. Delete the tree and let pod install refetch:"
  echo ""
  echo "  rm -rf \"$EXTERNAL_DIR\""
  echo "  npx expo prebuild -p ios --clean"
  echo ""
  echo "Then re-run this script. Building without this ends in"
  echo "\"ld: library 'crypto' not found\" about 20 minutes in."
  exit 1
fi

echo "✅ react-native-audio-api prebuilt binaries OK (${#REQUIRED_LIBS[@]} libs, device slice)"
exit 0
