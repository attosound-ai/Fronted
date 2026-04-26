#!/usr/bin/env python3
"""
Patch the Archivo TTFs from @expo-google-fonts/archivo so iOS does not
clip descenders (y, g, p, j) in TextInputs and tight layouts.

Background: the upstream Archivo font ships with hhea.descender=-210
while glyphs actually extend to -410 below baseline (see usWinDescent).
iOS uses hhea.descender for layout, so descenders get clipped.

Run:
    python3 scripts/patch-archivo-fonts.py

Requires:
    pip install fonttools

Reads from:  node_modules/@expo-google-fonts/archivo/<weight>/<name>.ttf
Writes to:   assets/fonts/<name>.ttf

Re-run this whenever @expo-google-fonts/archivo updates.
"""

import os
import sys

try:
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit("ERROR: install fonttools first → pip install fonttools")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FRONT_DIR = os.path.dirname(SCRIPT_DIR)

SRC_DIR = os.path.join(FRONT_DIR, "node_modules/@expo-google-fonts/archivo")
DST_DIR = os.path.join(FRONT_DIR, "assets/fonts")

WEIGHTS = [
    ("400Regular", "Archivo_400Regular.ttf"),
    ("500Medium", "Archivo_500Medium.ttf"),
    ("600SemiBold", "Archivo_600SemiBold.ttf"),
    ("700Bold", "Archivo_700Bold.ttf"),
]

# Targets:
#   ascender 920 (was 878) — small bump for visual symmetry with descender
#   descender -420 (was -210) — covers actual glyph extent (usWinDescent=410) + 10 buffer
#   lineGap 0 (unchanged) — iOS ignores lineGap anyway
NEW_ASCENDER = 920
NEW_DESCENDER = -420
NEW_LINEGAP = 0

os.makedirs(DST_DIR, exist_ok=True)

for src_subdir, ttf_name in WEIGHTS:
    src_path = os.path.join(SRC_DIR, src_subdir, ttf_name)
    dst_path = os.path.join(DST_DIR, ttf_name)

    if not os.path.exists(src_path):
        print(f"MISSING: {src_path}")
        continue

    font = TTFont(src_path)

    font["hhea"].ascent = NEW_ASCENDER
    font["hhea"].descent = NEW_DESCENDER
    font["hhea"].lineGap = NEW_LINEGAP

    font["OS/2"].sTypoAscender = NEW_ASCENDER
    font["OS/2"].sTypoDescender = NEW_DESCENDER
    font["OS/2"].sTypoLineGap = NEW_LINEGAP

    font["OS/2"].usWinAscent = max(font["OS/2"].usWinAscent, NEW_ASCENDER)
    font["OS/2"].usWinDescent = max(font["OS/2"].usWinDescent, abs(NEW_DESCENDER))

    font.save(dst_path)
    print(f"patched: {ttf_name}  (asc={NEW_ASCENDER}, desc={NEW_DESCENDER})")

print(f"\nDone. {len(WEIGHTS)} fonts written to {DST_DIR}")
