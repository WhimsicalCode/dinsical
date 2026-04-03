#!/usr/bin/env python3
"""
Derive Dinsy UFO sources from the dinish/ submodule.

Pipeline applied to each master (Regular, Bold):
  1. Copy DINish/DINish-{weight}.ufo  →  sources/Dinsy/Dinsy-{weight}.ufo
  2. Rename DINish → Dinsy in all text content (family names, PS names, …)
  3. [Dinsy only] Blend glyph coordinates toward DINishExpanded by WDTH_BLEND
     (0.28 ≈ wdth 107 on the 75–100–125 axis, matching DINsical proportions)
  4. Scale all glyph coordinates by a combined factor:
       (1000 / 1024)   — rescale UPM from 1024 to 1000
       × 0.985         — reduce glyph body to match DINsical visual size
       = 0.9619140625
  5. Set UPM to 1000 and override line metrics with exact DINsical values
     (hhea 830/−170/200, sTypo 750/−250/200, win 850/350)
     → gives exactly 120 px line height at 100 px font-size
  6. Apply any per-glyph overrides from overlay/sources/Dinsy/
  7. Apply spacing patch from overlay/spacing-patch.py
  8. Apply kern patch from overlay/kern-patch.py

Usage:
    uv run python tools/derive-sources.py [--dry-run]
"""

import argparse
import importlib.util
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

# Width blend: fraction toward DINishExpanded for the Dinsy (wdth=100) masters.
# Formula:  wdth = 100 + WDTH_BLEND × 25   →   WDTH_BLEND = (wdth − 100) / 25
# 0.0  = pure DINish Normal  (wdth 100)
# 0.28 ≈ wdth 107  — median of Dinsical ink-width targets
# 1.0  = full DINishExpanded (wdth 125)
# Set to 0.0 to disable.
WDTH_BLEND: float = 0.2 # DINish wdth 105

# Line-spacing metrics — set verbatim, NOT scaled.
# hhea and sTypo are intentionally identical so the browser gets the
# same baseline regardless of which table it picks.
#
# Chromium respects USE_TYPO_METRICS for TTF/WOFF2 (uses sTypo) but
# falls back to hhea for CFF/OTF.  DINsical is CFF, so it effectively
# uses hhea (asc=830).  Dinsy is a TTF variable font and would use sTypo
# (asc=750) — placing the baseline 13 px higher at 160 px font-size.
# Making sTypo == hhea (830/-170/200) eliminates the discrepancy.
#
# Gives: (830 + 170 + 200) / 1000 * 100px = 120.000 px line height @ 100 px
LINE_METRICS: dict = {
    "ascender":                   830,
    "descender":                 -170,
    "openTypeHheaAscender":       830,
    "openTypeHheaDescender":     -170,
    "openTypeHheaLineGap":        200,
    "openTypeOS2TypoAscender":    830,   # was 750 — now matches hhea
    "openTypeOS2TypoDescender":  -170,   # was -250 — now matches hhea
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


def lerp(a: float | str, b: float | str, t: float) -> int:
    """Linear interpolation, rounded to int."""
    return round(float(a) + t * (float(b) - float(a)))


def _blend_hint_dicts(arr_n: ET.Element, arr_e: ET.Element, t: float) -> None:
    """Blend position values inside a hintData hhints/vhints array."""
    for dict_n, dict_e in zip(arr_n.findall("dict"), arr_e.findall("dict")):
        ch_n, ch_e = list(dict_n), list(dict_e)
        for i in range(0, min(len(ch_n), len(ch_e)) - 1, 2):
            if ch_n[i].tag == "key" and ch_n[i].text == "position":
                if ch_n[i+1].tag in ("integer", "real") and ch_e[i+1].tag in ("integer", "real"):
                    ch_n[i+1].tag = "integer"
                    ch_n[i+1].text = str(lerp(ch_n[i+1].text, ch_e[i+1].text, t))


def _blend_roots(root_n: ET.Element, root_e: ET.Element, t: float) -> None:
    """
    Blend root_n (DINish Normal) in-place toward root_e (DINishExpanded)
    by factor t (0=normal, 1=expanded).  Applied before UPM scaling.

    Skips blending if point counts differ (incompatible glyph outlines).
    """
    # Advance width
    adv_n, adv_e = root_n.find("advance"), root_e.find("advance")
    if adv_n is not None and adv_e is not None:
        for attr in ("width", "height"):
            if attr in adv_n.attrib and attr in adv_e.attrib:
                adv_n.set(attr, str(lerp(adv_n.get(attr), adv_e.get(attr), t)))

    # Contour points — only blend if both sources have the same count
    pts_n = list(root_n.iter("point"))
    pts_e = list(root_e.iter("point"))
    if len(pts_n) == len(pts_e):
        for pn, pe in zip(pts_n, pts_e):
            for attr in ("x", "y"):
                if attr in pn.attrib and attr in pe.attrib:
                    pn.set(attr, str(lerp(pn.get(attr), pe.get(attr), t)))
    elif pts_n:  # mismatched — warn and leave outline unchanged
        print(f"  [wdth-blend] point count mismatch "
              f"({len(pts_n)} vs {len(pts_e)}) — skipping outline blend",
              file=sys.stderr)

    # Component offsets
    comps_n = list(root_n.iter("component"))
    comps_e = list(root_e.iter("component"))
    if len(comps_n) == len(comps_e):
        for cn, ce in zip(comps_n, comps_e):
            for attr in ("xOffset", "yOffset"):
                vn, ve = cn.get(attr), ce.get(attr)
                if vn is not None and ve is not None:
                    cn.set(attr, str(lerp(vn, ve, t)))

    # Anchors
    anch_n = list(root_n.iter("anchor"))
    anch_e = list(root_e.iter("anchor"))
    for an, ae in zip(anch_n, anch_e):
        for attr in ("x", "y"):
            if attr in an.attrib and attr in ae.attrib:
                an.set(attr, str(lerp(an.get(attr), ae.get(attr), t)))

    # Guidelines
    guid_n = list(root_n.iter("guideline"))
    guid_e = list(root_e.iter("guideline"))
    for gn, ge in zip(guid_n, guid_e):
        for attr in ("x", "y"):
            if attr in gn.attrib and attr in ge.attrib:
                gn.set(attr, str(lerp(gn.get(attr), ge.get(attr), t)))

    # PostScript hints
    lib_n, lib_e = root_n.find("lib"), root_e.find("lib")
    if lib_n is not None and lib_e is not None:
        ld_n, ld_e = lib_n.find("dict"), lib_e.find("dict")
        if ld_n is not None and ld_e is not None:
            ch_n, ch_e = list(ld_n), list(ld_e)
            for i in range(0, min(len(ch_n), len(ch_e)) - 1, 2):
                if (ch_n[i].tag == "key" and ch_n[i].text == "com.fontlab.hintData"
                        and i < len(ch_e) - 1 and ch_e[i].tag == "key"
                        and ch_e[i].text == "com.fontlab.hintData"):
                    hd_n, hd_e = list(ch_n[i+1]), list(ch_e[i+1])
                    for j in range(0, min(len(hd_n), len(hd_e)) - 1, 2):
                        if (hd_n[j].tag == "key"
                                and hd_n[j].text in ("hhints", "vhints")
                                and hd_e[j].tag == "key"
                                and hd_e[j].text == hd_n[j].text):
                            _blend_hint_dicts(hd_n[j+1], hd_e[j+1], t)


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


def scale_glif(src: Path, dst: Path, dry_run: bool,
               expanded: Path | None = None, wdth_blend: float = 0.0) -> None:
    tree = ET.parse(src)
    root = tree.getroot()

    # Width blend: interpolate toward DINishExpanded before UPM scaling
    if expanded is not None and wdth_blend > 0 and expanded.exists():
        root_e = ET.parse(expanded).getroot()
        _blend_roots(root, root_e, wdth_blend)

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

            # Build expanded-source glyph map for width blending (Dinsy only)
            exp_glif_map: dict[str, Path] = {}
            if WDTH_BLEND > 0 and dst_family == "Dinsy":
                exp_ufo = (
                    REPO / "dinish" / "sources" / "DINishExpanded"
                    / f"DINishExpanded-{weight}.ufo"
                )
                exp_contents_path = exp_ufo / "glyphs" / "contents.plist"
                if exp_contents_path.exists():
                    exp_contents = plistlib.loads(exp_contents_path.read_bytes())
                    exp_glif_map = {
                        name: exp_ufo / "glyphs" / fname
                        for name, fname in exp_contents.items()
                    }

            # Reverse map: filename → glyph name (for the normal source)
            src_contents_path = item / "contents.plist"
            filename_to_name: dict[str, str] = {}
            if src_contents_path.exists() and exp_glif_map:
                src_contents = plistlib.loads(src_contents_path.read_bytes())
                filename_to_name = {fname: name for name, fname in src_contents.items()}

            glifs = sorted(item.glob("*.glif"))
            blended = 0
            for glif in glifs:
                glyph_name = filename_to_name.get(glif.name)
                exp_glif = exp_glif_map.get(glyph_name) if glyph_name else None
                scale_glif(glif, glyphs_dst / glif.name, dry_run,
                           expanded=exp_glif, wdth_blend=WDTH_BLEND)
                if exp_glif is not None and exp_glif.exists():
                    blended += 1

            contents = item / "contents.plist"
            if contents.exists() and not dry_run:
                shutil.copy2(contents, glyphs_dst / "contents.plist")

            blend_note = f", {blended} blended toward wdth={100 + WDTH_BLEND*25:.0f}" if blended else ""
            print(f"    scaled {len(glifs)} glif files{blend_note}")

        elif item.suffix in (".plist", ".fea"):
            if not dry_run:
                dst_item.write_text(rename(item.read_text()))

    # Apply kern patch (features.fea only) --------------------------------
    if overlay_dir is not None and dst_family == "Dinsy":
        kern_patch_path = overlay_dir.parent / "kern-patch.py"
        fea_path = dst_ufo / "features.fea"
        if kern_patch_path.exists() and fea_path.exists() and not dry_run:
            spec = importlib.util.spec_from_file_location("kern_patch", kern_patch_path)
            kern_patch = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(kern_patch)
            original = fea_path.read_text()
            patched = kern_patch.apply(original)
            if patched != original:
                fea_path.write_text(patched)
                print(f"    kern-patch applied → {fea_path.relative_to(REPO)}")
            else:
                print(f"    kern-patch: no changes (already patched?)")
        elif dry_run and kern_patch_path.exists():
            print(f"    [dry-run] would apply kern-patch to {fea_path.relative_to(REPO)}")

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

    # Apply spacing patch (Dinsy only) ------------------------------------
    if overlay_dir is not None and dst_family == "Dinsy":
        spacing_patch_path = overlay_dir.parent / "spacing-patch.py"
        glyphs_dir = dst_ufo / "glyphs"
        if spacing_patch_path.exists() and glyphs_dir.exists() and not dry_run:
            spec = importlib.util.spec_from_file_location("spacing_patch", spacing_patch_path)
            spacing_patch = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(spacing_patch)
            n = spacing_patch.apply(glyphs_dir, weight)
            print(f"    spacing-patch applied: {n} glyphs adjusted")
        elif dry_run and spacing_patch_path.exists():
            print(f"    [dry-run] would apply spacing-patch to {glyphs_dir.relative_to(REPO)}")



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
