#!/usr/bin/env bash
# Native decision logic tests, compiled with the Mac's clang and run directly.
# Today: the voice engine self heal policy (AttoHealPolicy.h, shipped by the
# patched @twilio/voice-react-native-sdk). Called from test-timeline.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
HEAL_DIR=node_modules/@twilio/voice-react-native-sdk/ios
if [ ! -f "$HEAL_DIR/AttoHealPolicy.h" ]; then
  echo "AttoHealPolicy.h missing: run pnpm install so the Twilio patch is applied" >&2
  exit 1
fi
clang -std=c11 -Wall -Wextra -Werror -I "$HEAL_DIR" native-tests/heal_policy_test.c -o "$OUT/heal_policy_test"
"$OUT/heal_policy_test"
