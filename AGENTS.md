# Agent Rules

## Python
- Always use `uv run python` instead of bare `python` or `python3` in new scripts.

## Git
- Never automatically commit changes. Only commit when the user explicitly asks for it.

## Source files — what to edit and what not to

`sources/Dinsical/` contains only **two committed master UFOs** (`Dinsical-Regular.ufo`, `Dinsical-Bold.ufo`). These are derived from the upstream `dinish/` submodule via `tools/derive-sources.py` and **must not be edited directly** — any manual change will be overwritten the next time `make sources` runs.

All other width masters (`DinsicalCondensed`, `DinsicalExpanded`) are generated **ephemerally** into `.build/` during `make full` and are never committed at all.

To make a persistent change to the derived sources, edit the appropriate script:

| What you want to change | Where to change it |
|---|---|
| Glyph shapes, spacing, anchors | `overlay/sources/Dinsical/` (per-glyph UFO overrides) |
| Spacing values | `overlay/spacing-patch.py` |
| Kerning | `overlay/kern-patch.py` |
| Italic slant angle / glyph obliquing | `tools/copy-missing-italics.py` |
| Scale, line metrics, UPM | `tools/derive-sources.py` |
| Variable font axis ranges, instance coordinates | `tools/build-ephemeral-ufos.sh` (patches `Dinsical-Variable.designspace` on the fly into `.build/`) |

`Dinsical-Variable.designspace` is a committed file but intentionally mirrors upstream DINish values. Axis customisations (e.g. slant range -10 instead of -12) are applied as text replacements inside `build-ephemeral-ufos.sh` when it writes the build copy to `.build/`.

## Releasing a new version

Do NOT run `make release` — it auto-generates a changelog entry that overwrites the hand-written `[Unreleased]` section. Instead, follow these steps manually:

> **Critical ordering rule:** steps 1–4 (commit first) MUST happen before step 6 (build fonts).
> `tools/update-version.sh` reads the VERSION file from disk and the git hash from HEAD at the moment
> `build-ephemeral-ufos.sh` runs. If fonts are built before the version bump is committed the embedded
> version string will be wrong (e.g. `Version 1.010; git-oldsha-dev` instead of `Version 1.011; git-newsha-release`).

1. **Update CHANGELOG.md** — rename `## [Unreleased]` to `## [X.XXX] - YYYY-MM-DD` (next version, today's date), then add a fresh `## [Unreleased]` section at the top.
2. **Bump VERSION** — increment the minor number (e.g. `1.008` → `1.009`).
3. **Re-derive sources** — `uv run --with fontparts --with xmltodict --with fonttools python tools/derive-sources.py`
4. **Commit sources** — `git add CHANGELOG.md VERSION tools/ sources/ && git commit -m "Release vX.XXX: derive sources"`
5. **Tag** — `git tag vX.XXX -m "Dinsical vX.XXX"`
6. **Build fonts** — `bash tools/build-ephemeral-ufos.sh` ← only run this AFTER step 4 is committed
7. **Verify** — confirm embedded version is correct before committing:
   `python3 -c "from fontTools.ttLib import TTFont; f=TTFont('fonts/ttf/Dinsical-Regular.ttf'); print(f['name'].getName(5,3,1,1033))"`
   Expected: `Version X.XXX; git-<hash>-release`
8. **Commit fonts** — `git add fonts/ && git commit -m "Release vX.XXX: built fonts"`
9. **Move tag** — `git tag -f vX.XXX -m "Dinsical vX.XXX"`
10. Push: `git push && git push --tags --force`

## Changelog

- Before adding entries, read the full `[Unreleased]` section to see which subsections already exist
- New entries ALWAYS go under `## [Unreleased]` section
- Append to existing subsections, do not create duplicates
- Always update changelog when making changes to fonts. Do not include non-font changes in changelog.
- NEVER modify already-released version sections (e.g., `## [1.001]`)
- Each version section is immutable once released
