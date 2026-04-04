# Agent Rules

## Python
- Always use `uv run python` instead of bare `python` or `python3` in new scripts.

## Git
- Never automatically commit changes. Only commit when the user explicitly asks for it.

## Source files — what to edit and what not to

`sources/Dinsy/` contains only **two committed master UFOs** (`Dinsy-Regular.ufo`, `Dinsy-Bold.ufo`). These are derived from the upstream `dinish/` submodule via `tools/derive-sources.py` and **must not be edited directly** — any manual change will be overwritten the next time `make sources` runs.

All other width masters (`DinsyCondensed`, `DinsyExpanded`) are generated **ephemerally** into `.build/` during `make full` and are never committed at all.

To make a persistent change to the derived sources, edit the appropriate script:

| What you want to change | Where to change it |
|---|---|
| Glyph shapes, spacing, anchors | `overlay/sources/Dinsy/` (per-glyph UFO overrides) |
| Spacing values | `overlay/spacing-patch.py` |
| Kerning | `overlay/kern-patch.py` |
| Italic slant angle / glyph obliquing | `tools/copy-missing-italics.py` |
| Scale, line metrics, UPM | `tools/derive-sources.py` |
| Variable font axis ranges, instance coordinates | `tools/build-ephemeral-ufos.sh` (patches `Dinsy-Variable.designspace` on the fly into `.build/`) |

`Dinsy-Variable.designspace` is a committed file but intentionally mirrors upstream DINish values. Axis customisations (e.g. slant range -10 instead of -12) are applied as text replacements inside `build-ephemeral-ufos.sh` when it writes the build copy to `.build/`.

## Releasing a new version

Do NOT run `make release` — it auto-generates a changelog entry that overwrites the hand-written `[Unreleased]` section. Instead, follow these steps manually:

1. **Update CHANGELOG.md** — rename `## [Unreleased]` to `## [X.XXX] - YYYY-MM-DD` (next version, today's date), then add a fresh `## [Unreleased]` section at the top.
2. **Bump VERSION** — increment the minor number (e.g. `1.008` → `1.009`).
3. **Re-derive sources** — `uv run --with fontparts --with xmltodict --with fonttools python tools/derive-sources.py`
4. **Commit sources** — `git add CHANGELOG.md VERSION tools/ sources/ && git commit -m "Release vX.XXX: derive sources"`
5. **Tag** — `git tag vX.XXX -m "Dinsy vX.XXX"`
6. **Build fonts** — `bash tools/build-ephemeral-ufos.sh`
7. **Commit fonts** — `git add fonts/ && git commit -m "Release vX.XXX: built fonts"`
8. **Move tag** — `git tag -f vX.XXX -m "Dinsy vX.XXX"`
9. Push: `git push && git push --tags`

## Changelog

- Before adding entries, read the full `[Unreleased]` section to see which subsections already exist
- New entries ALWAYS go under `## [Unreleased]` section
- Append to existing subsections, do not create duplicates
- Always update changelog when making changes to fonts. Do not include non-font changes in changelog.
- NEVER modify already-released version sections (e.g., `## [1.001]`)
- Each version section is immutable once released
