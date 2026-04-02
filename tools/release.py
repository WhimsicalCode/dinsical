#!/usr/bin/env python3
"""
make release — full automated release pipeline:

  1. Assert clean git working tree
  2. Bump VERSION (e.g. 1.000 → 1.001)
  3. Derive sources  (tools/derive-sources.py)
  4. Build changelog entry from upstream changes + overlay diff
  5. Prepend entry to CHANGELOG.md
  6. Commit: "Release v1.001: derive sources"
  7. Tag:    v1.001
  8. Build fonts  (tools/build-ephemeral-ufos.sh)
     — sees clean tree + matching tag → release mode
  9. Commit: "Release v1.001: built fonts"
  10. Force-move tag to include fonts commit

Usage:
    uv run python tools/release.py [--dry-run]
"""

import argparse
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def git(*args: str, cwd: Path | None = None, check: bool = True) -> str:
    r = subprocess.run(
        ["git", *args],
        cwd=cwd or ROOT,
        capture_output=True,
        text=True,
    )
    if check and r.returncode != 0:
        print(f"\ngit {' '.join(args)} failed:\n{r.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    return r.stdout.strip()


def run(cmd: list[str], cwd: Path | None = None) -> None:
    r = subprocess.run(cmd, cwd=cwd or ROOT)
    if r.returncode != 0:
        print(f"\nCommand failed: {' '.join(cmd)}", file=sys.stderr)
        sys.exit(1)


def bump_version(v: str) -> str:
    major, minor = v.strip().split(".")
    return f"{major}.{int(minor) + 1:03d}"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would happen without making changes")
    args = parser.parse_args()

    dry = args.dry_run
    if dry:
        print("DRY RUN — no changes will be made\n")

    # 1. Assert clean state ------------------------------------------------
    dirty = git("status", "--short", "--untracked-files=no")
    if dirty:
        print(f"ERROR: uncommitted changes:\n{dirty}", file=sys.stderr)
        sys.exit(1)

    # 2. Bump version -------------------------------------------------------
    version_file = ROOT / "VERSION"
    old_version = version_file.read_text().strip()
    new_version = bump_version(old_version)
    print(f"Version: {old_version}  →  {new_version}")

    # 3. Record current dinish commit (before possible changes) -------------
    prev_dinish = git("ls-tree", "HEAD", "dinish").split()[2]
    curr_dinish = git("rev-parse", "HEAD", cwd=ROOT / "dinish")
    print(f"dinish: {prev_dinish[:12]}  →  {curr_dinish[:12]}"
          + ("  (unchanged)" if prev_dinish == curr_dinish else ""))

    if not dry:
        version_file.write_text(new_version + "\n")

    # 4. Derive sources -----------------------------------------------------
    print("\nDeriving sources…")
    if not dry:
        run([
            "uv", "run",
            "--with", "fontparts",
            "--with", "xmltodict",
            "--with", "fonttools",
            "python", "tools/derive-sources.py",
        ])

    # 5. Build changelog entry ---------------------------------------------
    dinish_log = ""
    if prev_dinish != curr_dinish:
        dinish_log = git(
            "log", "--oneline", f"{prev_dinish}..{curr_dinish}",
            cwd=ROOT / "dinish",
        )

    source_diff = git("diff", "--stat", "sources/")

    overlay_glifs = sorted(
        (ROOT / "overlay" / "sources").rglob("*.glif")
    )

    today = date.today().isoformat()
    lines = [
        f"## v{new_version} ({today})",
        "",
        f"**Upstream DINish:** playbeing/dinish @ `{curr_dinish[:12]}`",
        "",
        "### Upstream changes",
    ]
    if dinish_log:
        for entry in dinish_log.splitlines():
            lines.append(f"- {entry}")
    else:
        lines.append("- No upstream changes")

    if overlay_glifs:
        lines += ["", "### Overlay glyphs"]
        for p in overlay_glifs:
            lines.append(f"- `{p.relative_to(ROOT / 'overlay')}`")

    if source_diff:
        lines += ["", "### Source changes", "```"]
        lines += source_diff.splitlines()
        lines += ["```"]

    lines += ["", "---", ""]
    entry = "\n".join(lines)

    print(f"\nChangelog entry:\n{entry}")

    # 6. Write CHANGELOG.md ------------------------------------------------
    changelog_path = ROOT / "CHANGELOG.md"
    if not dry:
        existing = changelog_path.read_text() if changelog_path.exists() else "# Changelog\n\n"
        # Insert after the first line (the # heading)
        head, *rest = existing.split("\n", 1)
        changelog_path.write_text(f"{head}\n\n{entry}{rest[0] if rest else ''}")

    if dry:
        print("\nDRY RUN: stopping here.")
        return

    # 7. Commit 1: sources + VERSION + CHANGELOG ---------------------------
    print("Committing derived sources…")
    git("add", "-A")
    git("commit", "-m", f"Release v{new_version}: derive sources")

    # 8. Tag ---------------------------------------------------------------
    git("tag", f"v{new_version}", "-m", f"Dinsy v{new_version}")
    print(f"Tagged v{new_version}")

    # 9. Build fonts -------------------------------------------------------
    print("\nBuilding fonts (release mode)…")
    run(["bash", "tools/build-ephemeral-ufos.sh"])

    # 10. Commit 2: fonts --------------------------------------------------
    git("add", "fonts/", "ofl/")
    fonts_status = git("status", "--short", "--untracked-files=no", "fonts/", "ofl/")
    if fonts_status:
        git("commit", "-m", f"Release v{new_version}: built fonts")
        # Move tag to include fonts commit
        git("tag", "-f", f"v{new_version}", "-m", f"Dinsy v{new_version}")
        print(f"Tag v{new_version} moved to fonts commit")

    print(f"""
✓ Released v{new_version}

  git push && git push --tags
""")


if __name__ == "__main__":
    main()
