#!/usr/bin/env bash
#
# upload-dsyms.sh — Sube los dSYMs de iOS a Sentry para symbolicar crashes nativos.
#
# Por qué existe: con `eas build --local` la fase de Sentry necesita un token en
# build-time. Si falla y `SENTRY_ALLOW_FAILURE=true`, el build pasa SIN símbolos y
# los crashes nativos quedan ilegibles. Este script re-sube símbolos a mano.
#
# Auth/org/project salen de ~/.sentryclirc (token con scope project:releases+write).
#
# Uso:
#   ./scripts/upload-dsyms.sh                 # todos los .xcarchive de ATTO en Xcode
#   ./scripts/upload-dsyms.sh /ruta/al/dSYMs  # una ruta concreta (carpeta/.xcarchive)
#
set -euo pipefail

CLI="$(cd "$(dirname "$0")/.." && pwd)/node_modules/@sentry/cli/bin/sentry-cli"
[ -x "$CLI" ] || { echo "❌ no encuentro sentry-cli en node_modules"; exit 1; }
[ -f "$HOME/.sentryclirc" ] || { echo "❌ falta ~/.sentryclirc con [auth] token=..."; exit 1; }

if [ "$#" -ge 1 ]; then
  TARGETS=("$@")
else
  # Default: todos los archives de ATTO de Xcode (maneja espacios en los nombres).
  TARGETS=("$HOME"/Library/Developer/Xcode/Archives/*/*ATTO*.xcarchive/dSYMs)
fi

echo "Subiendo dSYMs a Sentry (atto-sound/react-native)…"
"$CLI" debug-files upload "${TARGETS[@]}"
echo "✅ listo. Revisa: Sentry → Settings → Projects → react-native → Debug Files"
