#!/usr/bin/env bash
# Runs the timeline editor's pure-logic tests (region editing model, clip
# effects patch) with Node's built-in test runner. No jest/vitest is
# configured in this project, so the test file is compiled to CJS in a temp
# dir and executed with `node --test`. Usage: npm run test:timeline
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
cat > "$OUT/tsconfig.json" <<EOF
{
  "extends": "$PWD/tsconfig.json",
  "compilerOptions": {
    "noEmit": false, "outDir": "$OUT/out", "rootDir": "$PWD",
    "typeRoots": ["$PWD/node_modules/@types"],
    "module": "nodenext", "moduleResolution": "nodenext"
  },
  "include": [],
  "files": ["$PWD/src/features/timeline/utils/__tests__/regionOps.test.ts"]
}
EOF
npx tsc -p "$OUT/tsconfig.json"
NODE_PATH="$PWD/node_modules" node --test "$OUT/out/src/features/timeline/utils/__tests__/regionOps.test.js"
