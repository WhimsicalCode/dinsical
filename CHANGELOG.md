# Changelog

## [1.005] - 2026-04-02

### Changed
- Calibrated weight axis to match DINsical stem weights — Regular, Medium, and Bold now have
  identical I-glyph stem widths to their DINsical counterparts (89 / 118 / 147 units at 1000 UPM).
  Previously DINsical Bold ≈ old Dinsy Heavy in visual weight.
- Weight interpolation changed from linear `(weight−4)/3` to a piecewise-linear calibration
  anchored at Regular (factor 0.298), Medium (0.807), Bold (1.316).

## [1.004] - 2026-04-02

### Changed
- Restored `wdth` axis (75–100–125) in variable font, adding Condensed and Expanded variants.
  Condensed and Expanded are derived on-the-fly from upstream DINish during the build.

## [1.003] - 2026-04-03

### Changed
- Flattened `fonts/` directory — files moved from `fonts/{fmt}/Dinsy/Dinsy-*.{fmt}` to `fonts/{fmt}/Dinsy-*.{fmt}`
- Variable font renamed from `Dinsy[slnt,wght]` to `Dinsy-Var`

## [1.002] - 2026-04-02

## [1.001] - 2026-04-02

## [1.000] - 2026-04-01

### Added
- Initial release.
- UPM: 1024 → 1000 (exact 120 px line height at 100 px font-size)
- Line metrics: match DINsical (hhea 830/−170/200, sTypo 750/−250/200, win 850/350)
- Glyph scale: ×0.985 to match DINsical visual glyph size
- Variable font: `wght` (300–900) + `slnt` (0–−12) axes
- Upstream DINish: playbeing/dinish @ `a5f3b2a3b932` (v4.006)
