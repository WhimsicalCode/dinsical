# Agent Rules

## Python
- Always use `uv run python` instead of bare `python` or `python3` in new scripts.

## Git
- Never automatically commit changes. Only commit when the user explicitly asks for it.

## Changelog

- Before adding entries, read the full `[Unreleased]` section to see which subsections already exist
- New entries ALWAYS go under `## [Unreleased]` section
- Append to existing subsections (e.g., `### Fixed`), do not create duplicates
- Always update changelog when making changes to fonts. Do not include non-font changes in changelog.
- NEVER modify already-released version sections (e.g., `## [1.001]`)
- Each version section is immutable once released
