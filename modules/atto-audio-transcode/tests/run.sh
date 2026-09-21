#!/bin/sh
# Builds the range processing core together with the command line harness
# and runs it. Needs only the Swift toolchain that ships with Xcode:
#   sh modules/atto-audio-transcode/tests/run.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
MODULE="$(dirname "$HERE")"
BUILD="${TMPDIR:-/tmp}/atto-range-harness"
mkdir -p "$BUILD"
xcrun swiftc -O -swift-version 5 \
  "$MODULE"/ios/core/*.swift \
  "$MODULE"/ios/AttoAtomicFile.swift \
  "$HERE"/harness/main.swift \
  -o "$BUILD/harness"
"$BUILD/harness"
