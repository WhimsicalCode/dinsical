# Changelog

## [Unreleased]

## [1.009] - 2026-04-02

- Rename font family: Dinsy → Dinsical.
- Rename reference font: DINsical → DIN Next.

## [1.008] - 2026-04-02

- Italic slant angle reduced from 12° to 10° to match Dinsical. `slnt` axis range
  updated to −10–0; italic instances placed at −10. Applied via
  `tools/copy-missing-italics.py` and `tools/build-ephemeral-ufos.sh`.

## [1.007] - 2026-04-02

- Fix vertical alignment vs DIN Next in CSS layouts.
  Root cause: Chromium respects `USE_TYPO_METRICS` for TTF/variable fonts
  (uses sTypo asc=750) but falls back to hhea for CFF/OTF static fonts
  (uses hhea asc=830). DIN Next is CFF, so its effective CSS ascender is
  830; Dinsical (TTF variable) was using 750 — placing the baseline 13 px
  higher at 160 px font-size, causing visible vertical shift.
  Fix: set `sTypo` ascender/descender to match `hhea` (830/−170/200).
  Both tables now agree so the browser gets the same baseline regardless
  of which metric path it takes. `line-height: normal` is unchanged (still
  1.2× font-size: 830+170+200=1200 units).
- Tuned `WDTH_BLEND` from 0.28 to 0.20 (wdth 107 → 105) after visual review.
- Width blend: `tools/derive-sources.py` now interpolates the Dinsical (wdth=100)
  masters toward DINishExpanded by `WDTH_BLEND=0.20` before UPM scaling.
  This corresponds to approximately wdth=105 on the 75–125 axis, matching
  DIN Next letterform ink widths. Implemented via `_blend_roots()` (blends
  all outline points, advances, component offsets, anchors, and PS hints).
- Spacing patch mechanism: `overlay/spacing-patch.py` is now applied by
  `tools/derive-sources.py` after every `make sources` run, so Dinsical-specific
  sidebearing changes survive upstream DINish updates automatically.
- Set sidebearings for ~50 base glyphs (a–z, A–Z, punctuation) to match
  DIN Next's exact LSB/RSB values. Propagated automatically to ~190 composite
  glyphs (accented Latin, Cyrillic variants) via advance-width and
  combining-mark xOffset update.

## [1.006] - 2026-04-02

- Kern patch mechanism: `overlay/kern-patch.py` is now applied by
  `tools/derive-sources.py` after every `make sources` run, so Dinsical-specific
  kern changes survive upstream DINish updates automatically.
- Added complete Y kerning group (~26 pairs) — upstream DINish has none;
  Y. −96, Y- −92, Ya/c/d/e/g/o/q/s −56–−58, Yu −48, Yz −46, Yv/w/y −28,
  YJ −82, YA −59, Y:/; −53, Yx −43.
- Reduced L over-kerning: L+hyphen −133→−24, L+v/w/y −93→−34/−30/−16,
  L+V −103→−60, L+W −71→−36, L+T −117→−90, L+U −55→−30, L+Y −109→−90,
  L+round-UC −40→−30.
- Removed L+LC kern extras (L+a/b/c/d/e/g/h/i/k/l/m/n/o/p/q/r/u) —
  DIN Next does not kern L before lowercase letters.
- Comma/period separation: removed `\comma` from kern classes; DIN Next
  never kerns before commas. Period values adjusted: F −141→−100, P −115→−140,
  T −80→−98, U −40→−21, V −70→−90, W −57→−60.
- Added missing J pairs: TJ −96, PJ −79, VJ −66, FJ −59, WJ −55, YJ −82.
- Split round-LC kern group into open-bowl (c/e/o) and closed-bowl (d/g/q):
  T+c/e/o=−66, T+d/q=−40, T+g=0; F+c/e/o=−42, F+d/g/q=−14;
  K+c/e/o=−11, K+d/g/q=−8.
- Removed T/F/V/W/K + straight-LC kern extras (DIN Next has none).
- Added T+m/u −54, F+m/u −24/−30 (previously lumped with straight-LC at −12).
- T value corrections: v/w/y −61→−48, A −79→−72, a −84→−72, s −73→−50,
  x −61→−37, colon/semi −40→−20, round-UC −31→−24.
- Removed Z+d/g/q/a extras; reduced Z+c/e/o −36→−18.
- Fixed hyphen+V −40→−64, hyphen+Y −72→−92.
- Fixed X+round-UC −17→−7.
- Fixed kern-compare extraction script to respect Format-1 subtable precedence
  over Format-2 class rules (first-match-wins), matching layout engine behaviour.

## [1.005] - 2026-04-02

- Calibrated weight axis to match DIN Next stem weights — Regular, Medium, and Bold now have
  identical I-glyph stem widths to their DIN Next counterparts (89 / 118 / 147 units at 1000 UPM).
  Previously DIN Next Bold ≈ old Dinsical Heavy in visual weight.
- Weight interpolation changed from linear `(weight−4)/3` to a piecewise-linear calibration
  anchored at Regular (factor 0.298), Medium (0.807), Bold (1.316).

## [1.004] - 2026-04-02

- Restored `wdth` axis (75–100–125) in variable font, adding Condensed and Expanded variants.
  Condensed and Expanded are derived on-the-fly from upstream DINish during the build.

## [1.003] - 2026-04-02

- Flattened `fonts/` directory — files moved from `fonts/{fmt}/Dinsical/Dinsical-*.{fmt}` to `fonts/{fmt}/Dinsical-*.{fmt}`
- Variable font renamed from `Dinsical[slnt,wght]` to `Dinsical-Var`

## [1.002] - 2026-04-02

## [1.001] - 2026-04-02

## [1.000] - 2026-04-01

### Added
- Initial release.
- UPM: 1024 → 1000 (exact 120 px line height at 100 px font-size)
- Line metrics: match DIN Next (hhea 830/−170/200, sTypo 750/−250/200, win 850/350)
- Glyph scale: ×0.985 to match DIN Next visual glyph size
- Variable font: `wght` (300–900) + `slnt` (0–−12) axes
- Upstream DINish: playbeing/dinish @ `a5f3b2a3b932` (v4.006)
