# Overlay

Per-glyph overrides that survive upstream DINish updates.

## How to add an override

1. Place a `.glif` file in the matching weight directory:

```
overlay/sources/Dinsy/Dinsy-Regular.ufo/glyphs/myGlyph.glif
overlay/sources/Dinsy/Dinsy-Bold.ufo/glyphs/myGlyph.glif
```

2. The filename must match the name used in `sources/Dinsy/Dinsy-{weight}.ufo/glyphs/contents.plist`.

3. Run `make sources` (or `make release`) to apply the overlay and rebuild.

## Notes

- Overlay glyphs are copied **after** the full transform pipeline (rename + UPM
  rescale + metric override + glyph scale), so they are used **as-is** with no
  further scaling. If your glyph was designed at 1000 UPM with the Dinsy scale
  factor already baked in, it will drop in correctly.
- Both weights must be provided if the glyph exists in both masters and you want
  interpolation to work correctly in the variable font.
