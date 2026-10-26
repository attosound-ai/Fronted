#!/bin/bash
# Runs as the eas-build-post-install hook, inside the EAS working copy, right
# after its fresh install and before pod install.
#
# react-native-audio-api fetches its iOS libs and FFmpeg from a GitHub release
# in a prepare_command, and a failed download is skipped in silence (see
# verify-audio-api-binaries.sh). On Oct 25 2026, on a connection losing 20% of
# its packets, the FFmpeg zip never arrived in the EAS copy and the build died
# 20 minutes later at link time with "_avformat_open_input ... symbol(s) not
# found". Here the download is retried until every lib is really there, and
# the build stops within a minute when it cannot be done.

set -u
cd "$(dirname "$0")/.."

PKG="node_modules/react-native-audio-api"
FFMPEG_DIR="${PKG}/common/cpp/audioapi/external/ffmpeg_ios"
FFMPEG_LIBS="libavcodec libavformat libavutil libswresample"

if [ "${EAS_BUILD_PLATFORM:-ios}" != "ios" ]; then exit 0; fi
if [ ! -d "$PKG" ]; then echo "[audio-api] $PKG missing"; exit 1; fi

ffmpeg_ok() {
  for lib in $FFMPEG_LIBS; do
    local bin="${FFMPEG_DIR}/${lib}.xcframework/ios-arm64/${lib}.framework/${lib}"
    # A truncated zip leaves the folder without its binary; an empty one has no symbols.
    if [ ! -s "$bin" ] || [ -z "$(nm -gU "$bin" 2>/dev/null | head -1)" ]; then
      echo "[audio-api] missing or empty: $bin"
      return 1
    fi
  done
}

all_ok() { ffmpeg_ok && ./scripts/verify-audio-api-binaries.sh >/dev/null; }

for attempt in 1 2 3 4 5; do
  if all_ok; then
    echo "[audio-api] prebuilt libs and FFmpeg present (attempt $attempt)"
    exit 0
  fi
  echo "[audio-api] downloading prebuilt libs, attempt $attempt"
  # The upstream script skips any folder that exists, complete or not.
  ffmpeg_ok || rm -rf "$FFMPEG_DIR"
  (cd "$PKG" && bash scripts/download-prebuilt-binaries.sh ios >/dev/null) || true
  sleep $((attempt * 5))
done

if all_ok; then exit 0; fi
echo "[audio-api] REFUSED: could not download react-native-audio-api libs after 5 attempts (network?)."
exit 1
