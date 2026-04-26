# Patched Archivo Fonts

These TTFs are derived from `@expo-google-fonts/archivo` with **corrected vertical
metrics** to fix descender clipping on iOS (RN issues #34012, #30463).

## Why the patch exists

The upstream Archivo TTFs ship with:

```
hhea.ascender   = 878   (87.8% of em)
hhea.descender  = -210  (21% of em)
usWinDescent    = 410   (actual glyph extent below baseline)
```

iOS uses `hhea.descender` to compute line bounds, but the actual descenders
of `y`, `g`, `p`, `j` extend to ~410 units below baseline. This 200-unit
gap causes descenders to be clipped in `TextInput` placeholders, tight
buttons, badges, and any UI with constrained vertical space.

## What the patch changes

```
hhea.ascender   878 → 920
hhea.descender  -210 → -420
hhea.lineGap    0 (unchanged)

OS/2.sTypoAscender   → 920
OS/2.sTypoDescender  → -420
OS/2.sTypoLineGap    → 0

usWinAscent / usWinDescent are kept ≥ the new values.
```

Net effect: iOS now allocates enough vertical space for full descenders.
Layouts that depended on the old (too-tight) line height get ~21 extra units
per em above and ~210 below — visually about 4% taller text rows.

## How to regenerate

If `@expo-google-fonts/archivo` updates, regenerate with:

```bash
python3 backend/../scripts/patch_archivo.py
```

(Or run the inline patch script that originally created these files —
see `front/src/app/_layout.tsx` comment for context.)

## Files

- `Archivo_400Regular.ttf`  — body text (regular)
- `Archivo_500Medium.ttf`   — medium emphasis
- `Archivo_600SemiBold.ttf` — headings, labels
- `Archivo_700Bold.ttf`     — strong emphasis
