#!/usr/bin/env python3
"""
Derive Dinsy UFO sources from the dinish/ submodule.

Pipeline applied to each master (Regular, Bold):
  1. Copy DINish/DINish-{weight}.ufo  →  sources/Dinsy/Dinsy-{weight}.ufo
  2. Rename DINish → Dinsy in all text content (family names, PS names, …)
  3. Scale all glyph coordinates by a combined factor:
       (1000 / 1024)   — rescale UPM from 1024 to 1000
       × 0.985         — reduce glyph body to match DINsical visual size
       = 0.9619140625
  4. Set UPM to 1000 and override line metrics with exact DINsical values
     (hhea 830/−170/200, sTypo 750/−250/200, win 850/350)
     → gives exactly 120 px line height at 100 px font-size
  5. Apply any per-glyph overrides from overlay/sources/Dinsy/

Usage:
    uv run python tools/derive-sources.py [--dry-run]
"""

import argparse
import plistlib
import shutil
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Maps dest family name → upstream source directory name
FAMILIES: dict[str, str] = {
    "Dinsy":          "DINish",
    "DinsyCondensed": "DINishCondensed",
    "DinsyExpanded":  "DINishExpanded",
}

# Combined scale: UPM rescale × glyph size reduction
SCALE = (1000 / 1024) * 0.985   # = 0.9619140625

# Line-spacing metrics — set verbatim from DINsical, NOT scaled.
# Gives: (750 + 250 + 200) / 1000 * 100px = 120.000 px @ 100 px
LINE_METRICS: dict = {
    "ascender":                   830,
    "descender":                 -170,
    "openTypeHheaAscender":       830,
    "openTypeHheaDescender":     -170,
    "openTypeHheaLineGap":        200,
    "openTypeOS2TypoAscender":    750,
    "openTypeOS2TypoDescender":  -250,
    "openTypeOS2TypoLineGap":     200,
    "openTypeOS2WinAscent":       850,
    "openTypeOS2WinDescent":      350,
}

# fontinfo keys that track glyph proportions — scaled with SCALE
PROPORTIONAL_KEYS: frozenset = frozenset({
    "capHeight",
    "xHeight",
    "openTypeOS2StrikeoutPosition",
    "openTypeOS2StrikeoutSize",
    "openTypeOS2SubscriptXOffset",
    "openTypeOS2SubscriptXSize",
    "openTypeOS2SubscriptYOffset",
    "openTypeOS2SubscriptYSize",
    "openTypeOS2SuperscriptXOffset",
    "openTypeOS2SuperscriptXSize",
    "openTypeOS2SuperscriptYOffset",
    "openTypeOS2SuperscriptYSize",
    "postscriptUnderlinePosition",
    "postscriptUnderlineThickness",
})


def sc(v: float | str) -> int:
    return round(float(v) * SCALE)


def rename(s: str) -> str:
    return s.replace("DINish", "Dinsy").replace("dinish", "dinsy")


# ---------------------------------------------------------------------------
# fontinfo.plist
# ---------------------------------------------------------------------------

def process_fontinfo(src: Path, dst: Path, dry_run: bool) -> None:
    info = plistlib.loads(src.read_bytes())

    # Rename string fields
    for key in list(info.keys()):
        if isinstance(info[key], str):
            info[key] = rename(info[key])

    # UPM
    info["unitsPerEm"] = 1000

    # Line metrics (exact, not scaled)
    info.update(LINE_METRICS)

    # Proportional metrics (scale with combined factor)
    for key in PROPORTIONAL_KEYS:
        if key in info:
            info[key] = sc(info[key])

    if dry_run:
        print(f"    [dry-run] would write {dst.relative_to(REPO)}")
        return

    dst.parent.mkdir(parents=True, exist_ok=True)
    with open(dst, "wb") as f:
        plistlib.dump(info, f, sort_keys=False)


# ---------------------------------------------------------------------------
# .glif files
# ---------------------------------------------------------------------------

def _scale_hint_dicts(array_elem: ET.Element) -> None:
    for dict_elem in array_elem.findall("dict"):
        children = list(dict_elem)
        for i in range(0, len(children) - 1, 2):
            ke, ve = children[i], children[i + 1]
            if ke.tag == "key" and ke.text in ("position", "width"):
                if ve.tag in ("integer", "real"):
                    ve.tag = "integer"
                    ve.text = str(sc(ve.text))


def scale_glif(src: Path, dst: Path, dry_run: bool) -> None:
    tree = ET.parse(src)
    root = tree.getroot()

    # advance
    adv = root.find("advance")
    if adv is not None:
        for a in ("width", "height"):
            if a in adv.attrib:
                adv.set(a, str(sc(adv.get(a))))

    # contour points
    for pt in root.iter("point"):
        for a in ("x", "y"):
            if a in pt.attrib:
                pt.set(a, str(sc(pt.get(a))))

    # component offsets
    for comp in root.iter("component"):
        for a in ("xOffset", "yOffset"):
            if a in comp.attrib:
                comp.set(a, str(sc(comp.get(a))))

    # anchors & guidelines
    for tag in ("anchor", "guideline"):
        for el in root.iter(tag):
            for a in ("x", "y"):
                if a in el.attrib:
                    el.set(a, str(sc(el.get(a))))

    # PostScript hints (com.fontlab.hintData)
    lib = root.find("lib")
    if lib is not None:
        ld = lib.find("dict")
        if ld is not None:
            ch = list(ld)
            for i in range(0, len(ch) - 1, 2):
                if ch[i].tag == "key" and ch[i].text == "com.fontlab.hintData":
                    hd_ch = list(ch[i + 1])
                    for j in range(0, len(hd_ch) - 1, 2):
                        if hd_ch[j].tag == "key" and hd_ch[j].text in ("hhints", "vhints"):
                            _scale_hint_dicts(hd_ch[j + 1])

    if dry_run:
        return

    dst.parent.mkdir(parents=True, exist_ok=True)
    ET.indent(tree, space="  ")
    tree.write(dst, xml_declaration=True, encoding="UTF-8")


# ---------------------------------------------------------------------------
# Per-UFO processing
# ---------------------------------------------------------------------------

def process_ufo(
    src_dir: Path,   # e.g. dinish/sources/DINish
    dst_dir: Path,   # e.g. sources/Dinsy  or  .build/sources/DinsyCondensed
    overlay_dir: Path | None,
    dst_family: str, # e.g. "Dinsy"
    src_family: str, # e.g. "DINish"
    weight: str,
    dry_run: bool,
) -> None:
    src_ufo = src_dir / f"{src_family}-{weight}.ufo"
    dst_ufo = dst_dir / f"{dst_family}-{weight}.ufo"

    print(f"  {src_ufo.name}  →  {dst_ufo.name}")

    if not dry_run:
        if dst_ufo.exists():
            shutil.rmtree(dst_ufo)
        dst_ufo.mkdir(parents=True)

    for item in sorted(src_ufo.iterdir()):
        dst_item = dst_ufo / item.name

        if item.name == "fontinfo.plist":
            process_fontinfo(item, dst_item, dry_run)

        elif item.name == "glyphs":
            glyphs_dst = dst_ufo / "glyphs"
            if not dry_run:
                glyphs_dst.mkdir(exist_ok=True)

            glifs = sorted(item.glob("*.glif"))
            for glif in glifs:
                scale_glif(glif, glyphs_dst / glif.name, dry_run)

            contents = item / "contents.plist"
            if contents.exists() and not dry_run:
                shutil.copy2(contents, glyphs_dst / "contents.plist")

            print(f"    scaled {len(glifs)} glif files")

        elif item.suffix in (".plist", ".fea"):
            if not dry_run:
                dst_item.write_text(rename(item.read_text()))

        else:
            if not dry_run:
                shutil.copy2(item, dst_item)

    # Apply overlay (only when an overlay dir is provided) -----------------
    if overlay_dir is not None:
        overlay_glyphs = overlay_dir / f"{dst_family}-{weight}.ufo" / "glyphs"
        if overlay_glyphs.exists():
            glifs = [p for p in sorted(overlay_glyphs.iterdir())
                     if p.suffix == ".glif"]
            if glifs:
                print(f"    applying {len(glifs)} overlay glyph(s): "
                      f"{', '.join(p.name for p in glifs)}")
                if not dry_run:
                    for glif in glifs:
                        shutil.copy2(glif, dst_ufo / "glyphs" / glif.name)


# ---------------------------------------------------------------------------
# Encoding file
# ---------------------------------------------------------------------------

def copy_enc(dest_dir: Path, dry_run: bool) -> None:
    src = REPO / "dinish" / "sources" / "upright-in-italic-dinish.enc"
    dst = dest_dir / "upright-in-italic-dinsy.enc"
    if not dry_run and src.exists():
        dst.write_text(rename(src.read_text()))
    print(f"  enc: {src.name} → {dst.name}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be done without writing files")
    parser.add_argument("--families", nargs="+",
                        choices=list(FAMILIES.keys()),
                        default=["Dinsy"],
                        help="Families to derive (default: Dinsy only)")
    parser.add_argument("--dest-dir", type=Path, default=None,
                        help="Root output directory (default: REPO/sources)")
    args = parser.parse_args()

    upstream_root = REPO / "dinish" / "sources"
    if not upstream_root.exists():
        print(f"ERROR: {upstream_root} not found.\n"
              f"Run: git submodule update --init dinish", file=sys.stderr)
        sys.exit(1)

    dest_root   = args.dest_dir or (REPO / "sources")
    overlay_dir = REPO / "overlay" / "sources"

    print(f"Scale factor : {SCALE:.10f}")
    if args.dry_run:
        print("DRY RUN — no files will be written\n")

    for dest_family in args.families:
        src_family = FAMILIES[dest_family]
        src_dir    = upstream_root / src_family
        dst_dir    = dest_root / dest_family
        print(f"\n{src_family}  →  {dest_family}  (→ {dst_dir})")
        if not args.dry_run:
            dst_dir.mkdir(parents=True, exist_ok=True)
        for weight in ("Regular", "Bold"):
            process_ufo(src_dir, dst_dir, overlay_dir, dest_family, src_family, weight, args.dry_run)

    if "Dinsy" in args.families:
        copy_enc(dest_root / "Dinsy", args.dry_run)

    print(f"\nDone.  Scale factor: {SCALE:.10f}")
    if not args.dry_run:
        print("Next: make full")


if __name__ == "__main__":
    main()
