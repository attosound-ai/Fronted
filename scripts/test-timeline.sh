#!/usr/bin/env bash
# Runs the pure logic unit tests (timeline region editing model, clip effects
# patch, call playback stem specs and the call playback controller state
# machine) with Node's built in test runner. No jest/vitest is configured in
# this project, so the test files are compiled to CJS in a temp dir and
# executed with `node --test`. Usage: npm run test:timeline
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
TEST_FILES=(
  "src/features/timeline/utils/__tests__/regionOps.test.ts"
  "src/lib/callAudio/session/__tests__/mixSpec.test.ts"
  "src/lib/callAudio/session/__tests__/CallPlaybackController.test.ts"
  "src/features/feed/utils/__tests__/coverArt.test.ts"
  "src/lib/telemetry/__tests__/memorySurge.test.ts"
  "src/features/feed/utils/__tests__/splashLogo.test.ts"
  "src/features/messages/thread/__tests__/threadModel.test.ts"
  "src/features/timeline/utils/__tests__/gainSlider.test.ts"
  "src/features/messages/stores/__tests__/conversationPrefsModel.test.ts"
)
FILES_JSON=""
for f in "${TEST_FILES[@]}"; do
  FILES_JSON+="\"$PWD/$f\","
done
FILES_JSON="${FILES_JSON%,}"
cat > "$OUT/tsconfig.json" <<EOF
{
  "extends": "$PWD/tsconfig.json",
  "compilerOptions": {
    "noEmit": false, "outDir": "$OUT/out", "rootDir": "$PWD",
    "typeRoots": ["$PWD/node_modules/@types"],
    "module": "nodenext", "moduleResolution": "nodenext"
  },
  "include": [],
  "files": [$FILES_JSON]
}
EOF
npx tsc -p "$OUT/tsconfig.json"
COMPILED=()
for f in "${TEST_FILES[@]}"; do
  COMPILED+=("$OUT/out/${f%.ts}.js")
done
NODE_PATH="$PWD/node_modules" node --test "${COMPILED[@]}"
