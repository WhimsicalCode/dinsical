# Overlay

Per-glyph and per-kern overrides that survive upstream DINish updates.
All files here are version-controlled and re-applied automatically by
`tools/derive-sources.py` on every `make sources` run.

---

## Kern patch (`kern-patch.py`)

`overlay/kern-patch.py` defines Dinsical's intentional kern divergences from
the upstream DINish source, targeting DIN Next values.

It exposes a single `apply(fea: str) -> str` function that transforms the
derived `features.fea` text. Changes are applied in this order:

1. **Comma/period separation** — DIN Next doesn't kern before commas; `\comma`
   is removed from the period/comma second-groups in both lookup1 and lookup3.
2. **Round-LC group split** — `@kc6_second_13` (open bowl: c/e/o) is split
   from a new `@kc6_second_13b` (closed bowl: d/g/q) so T, F, K, Y can be
   kerned at different intensities for each shape.
3. **Specific pair overrides** — L+v/w/y and T+d/q are inserted before class
   rules so they take Format-1 subtable precedence over the class rules.
4. **Y kern group** — a complete Y-first kern group is added (`@kc6_first_12`).
   Upstream DINish has no Y kern pairs; DIN Next has ~28.
5. **Value adjustments** — L over-kerning reduced across UC and LC targets;
   T/F/P/U/V/W/X period values corrected; hyphen+V/Y tightened.
6. **Extra rule removal** — L/T/F/V/W/K + straight-LC extras removed (DIN Next
   lacks these); Z + d/g/q/a extras removed.
7. **Missing pairs** — TJ/PJ/VJ/FJ/WJ/YJ added; T+m/u, F+m/u, Y+z/m/u
   individual pairs added to lookup0.

### When upstream updates (`make update-upstream && make sources`)

- Kern pairs upstream adds that don't conflict with the patch → flow through.
- Kern pairs upstream changes that the patch also touches → patch wins.
- Review `git diff sources/` after `make sources` to audit what merged.

### How to add a new kern change

Edit `overlay/kern-patch.py`, add to the relevant section (`_VALUE_CHANGES`,
`_LINES_TO_REMOVE`, `_NEW_LOOKUP0_PAIRS`, etc.), then run:

```
make sources && make build
```

---

## Glyph overrides

### How to add an override

1. Place a `.glif` file in the matching weight directory:

```
overlay/sources/Dinsical/Dinsical-Regular.ufo/glyphs/myGlyph.glif
overlay/sources/Dinsical/Dinsical-Bold.ufo/glyphs/myGlyph.glif
```

2. The filename must match the name used in `sources/Dinsical/Dinsical-{weight}.ufo/glyphs/contents.plist`.

3. Run `make sources` (or `make release`) to apply the overlay and rebuild.

### Notes

- Overlay glyphs are copied **after** the full transform pipeline (rename + UPM
  rescale + metric override + glyph scale), so they are used **as-is** with no
  further scaling. If your glyph was designed at 1000 UPM with the Dinsical scale
  factor already baked in, it will drop in correctly.
- Both weights must be provided if the glyph exists in both masters and you want
  interpolation to work correctly in the variable font.
