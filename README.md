# Dinsy

Dinsy is a variable font derived from [DINish](https://github.com/playbeing/dinish)
(itself a fork of Altinn-DIN / D-DIN), tuned for pixel-accurate canvas and web
rendering.

## Why Dinsy exists

Two specific problems with the upstream DINish font motivated this fork:

1. **Line height is not pixel-aligned.**  
   DINish uses 1024 UPM.  At 100 px font-size the natural line height is
   `(1050 + 248) / 1024 × 100 = 126.37 px` — a non-integer that causes
   sub-pixel rendering differences across browsers and canvas implementations.  
   Dinsy uses 1000 UPM with line metrics copied from DIN Next, giving
   exactly **120.000 px** at 100 px (`(750 + 250 + 200) / 1000 × 100`).

2. **Glyph bodies are 1.5 % too large compared to DIN Next.**  
   Outlines are scaled down by **0.985×** so that `font-size: 1000px` in Dinsy
   renders identically to `font-size: 1000px` in DIN Next.

## Font metrics

| Metric | Value |
|---|---|
| UPM | 1000 |
| hhea ascender / descender / lineGap | 830 / −170 / 200 |
| sTypo ascender / descender / lineGap | 750 / −250 / 200 |
| OS/2 WinAscent / WinDescent | 850 / 350 |
| **Line height @ 100 px** | **120.000 px** |

## Variable font axes

| Axis | Tag | Range |
|---|---|---|
| Weight | `wght` | 300 (Light) – 900 (Black) |
| Slant | `slnt` | 0 (upright) – −12 (italic) |

Static instances: Light, Regular, Medium, SemiBold, Bold, Heavy, Black
(+ Italic variants of each).

## Repository structure

```
dinsy-new/
├── VERSION                       Version number (e.g. "1.001")
├── CHANGELOG.md                  Release history
├── Makefile                      Build targets (see below)
├── Dinsy-Variable.designspace    Variable font designspace
├── Dinsy-Variable.stylespace     STAT table definitions
│
├── dinish/                       git submodule — upstream DINish sources
│                                 (read-only; never edit directly)
│
├── overlay/
│   └── sources/Dinsy/
│       ├── Dinsy-Regular.ufo/glyphs/   ← drop .glif overrides here
│       └── Dinsy-Bold.ufo/glyphs/      ← same for Bold
│
├── sources/                      Derived UFO masters (committed)
│   └── Dinsy/
│       ├── Dinsy-Regular.ufo/
│       ├── Dinsy-Bold.ufo/
│       └── upright-in-italic-dinsy.enc
│
├── fonts/                        Built font files (committed, release only)
│   ├── ttf/Dinsy/
│   ├── otf/Dinsy/
│   ├── woff/Dinsy/
│   ├── woff2/Dinsy/
│   └── variable/
│
└── tools/
    ├── derive-sources.py         Upstream → Dinsy transformation pipeline
    ├── release.py                Automated release workflow
    ├── build-ephemeral-ufos.sh   Full build (interpolate + italic + VF + static)
    ├── update-version.sh         Embed version + git hash into fontinfo
    ├── process-font.sh           OTF/TTF/woff/woff2 compilation
    ├── copy-missing-italics.py   Generate italic UFOs from upright masters
    ├── interpolate-font.py       Interpolate intermediate weights
    ├── nuke-inconsistent-anchors.py  Pre-flight anchor fix
    └── sync-features.sh          Keep features.fea in sync across masters
```

## Prerequisites

```bash
brew install uv gsed rename woff2 gftools statmake ttfautohint fontmake
uv tool install fontmake --with skia-pathops --with fontparts --with xmltodict
```

## Make targets

| Target | Description |
|---|---|
| `make sources` | Re-derive `sources/` from `dinish/` submodule + overlay |
| `make full` | Full build — all weights, italics, variable font (syncs to `fonts/`) |
| `make build` | Quick static-only build from current `sources/` masters |
| `make release` | Full release pipeline (see below) |
| `make update-upstream` | Pull latest upstream DINish into `dinish/` submodule |
| `make clean` | Remove scratch build directory |
| `make dist-clean` | Remove scratch + built fonts |

## Derivation pipeline (`make sources`)

`tools/derive-sources.py` transforms the upstream DINish sources into Dinsy sources:

1. **Copy** `dinish/sources/DINish/DINish-{Regular,Bold}.ufo`
   → `sources/Dinsy/Dinsy-{Regular,Bold}.ufo`
2. **Rename** `DINish` → `Dinsy` in all text content (family names, PS names, class names)
3. **Scale** all glyph coordinates and advance widths by `(1000/1024) × 0.985 = 0.9619…`
4. **Set UPM** to 1000; **override line metrics** with exact DIN Next values
5. **Apply overlay** — copy any `.glif` files from `overlay/sources/Dinsy/` on top

## Per-glyph overrides

To override a specific glyph while keeping everything else from upstream:

1. Place your `.glif` file in the matching weight directory:
   ```
   overlay/sources/Dinsy/Dinsy-Regular.ufo/glyphs/H_.glif
   overlay/sources/Dinsy/Dinsy-Bold.ufo/glyphs/H_.glif
   ```
2. The filename must match the entry in
   `sources/Dinsy/Dinsy-{weight}.ufo/glyphs/contents.plist`
3. Run `make sources` to apply, then `make full` to rebuild fonts.

Overlay glyphs are applied **after** all transformations, so they are used
as-is. Design at 1000 UPM with the Dinsy scale factor already baked in.

## Release workflow (`make release`)

`tools/release.py` runs the full automated pipeline:

1. Assert clean git working tree
2. Bump `VERSION` (e.g. `1.000` → `1.001`)
3. Run `make sources` (derive from current `dinish/` submodule + overlay)
4. Generate a `CHANGELOG.md` entry (upstream commits + source diff)
5. **Commit** `sources/`, `VERSION`, `CHANGELOG.md`  →  `"Release v1.001: derive sources"`
6. **Tag** `v1.001`
7. Build fonts (sees clean tree + matching tag → embeds `release` in version string)
8. **Commit** `fonts/`, `ofl/`  →  `"Release v1.001: built fonts"`
9. **Force-move tag** to the fonts commit

After release:
```bash
git push && git push --tags
```

## Pulling upstream changes

```bash
make update-upstream          # advances dinish/ submodule to latest upstream
git -C dinish log --oneline HEAD@{1}..HEAD   # review what changed
make release                  # derive + build + commit + tag
```

If upstream changes break something, pin to a known-good commit:
```bash
git -C dinish checkout <hash>
git add dinish && git commit -m "Pin dinish to <hash>"
```

## Language support

Dinsy inherits DINish's full glyph set:
243 Latin-based languages supported, full European Latin coverage, Cyrillic
(Russian, Bulgarian, Serbian), Old-style numerals, tabular numerals.

## OpenType features

| Feature | Description |
|---|---|
| `tnum` | Tabular figures (for spreadsheets / code) |
| `onum` | Old-style numerals |
| `frac` | Diagonal fractions |
| `ss01` | Stylistic set 1 (Dutch IJ) |
| `ss02` | Alternate `a` (activated automatically in italics) |

## License

SIL Open Font License, Version 1.1 — see [OFL.txt](OFL.txt).

Copyright © 2023–2024 Stefan Peev  
Copyright © 2021–2025 Bert Driehuis  
Copyright © 2019 Altinn  
Copyright © 2017 Datto Inc.
