"""
Dinsy spacing patch — increases glyph sidebearings to match DINsical.

Applied by tools/derive-sources.py after glyph scaling on every `make sources`
run. Works in two phases:

  Phase 1 — Base glyphs: shifts outline x-coordinates and widens advance to
             hit the Dinsical target (lsb, rsb) values stored in TARGETS.

  Phase 2 — Composites: propagates Phase 1 changes to every composite glyph
             whose primary base was patched: updates the advance width and
             shifts any non-zero-xOffset component (= combining mark) by the
             same delta_lsb, keeping accents correctly centred.

Coverage per weight (~50 base glyphs + ~350 auto-propagated composites):
  - Lowercase: a b d f g h i dotlessi j k l m n p q r s t u v w x y
               (c/e/o skipped — Dinsical is same/tighter for round shapes;
                z skipped — diff < 5 units)
  - Uppercase: A B D E F G H I K L M N P R S T U V W Y Z
               (C/O/Q skipped — Dinsical ink is narrower for these shapes;
                J skipped — DINish J is 178 units narrower by design;
                X skipped — Dinsical ink is 38 units narrower)
  - Punctuation: period comma colon semicolon exclam question hyphen endash emdash
  - Digits: excluded — DINish uses proportional figures, Dinsical tabular (w=542)

Entry point: apply(glyphs_dir: Path, weight: str) -> int
             Returns number of glyphs adjusted (base + composites).
"""

import plistlib
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


# ---------------------------------------------------------------------------
# Target sidebearing values derived from compiled DINsical Regular / Bold.
# Format: glyph_name → (target_lsb, target_rsb)  [1000 UPM space]
# ---------------------------------------------------------------------------

TARGETS: dict[str, dict[str, tuple[int, int]]] = {
    "Regular": {
        # ── lowercase ──────────────────────────────────────────────────────
        "a": (58, 78),
        "b": (82, 53),
        "d": (53, 82),
        "f": (41, 27),
        "g": (52, 82),
        "h": (82, 77),
        "i": (80, 80),
        "dotlessi": (82, 82),
        "j": (-7, 80),
        "k": (82, 28),
        "l": (80, 36),
        "m": (82, 77),
        "n": (82, 77),
        "p": (82, 53),
        "q": (53, 82),
        "r": (82, 13),
        "s": (45, 50),
        "t": (36, 48),
        "u": (75, 82),
        "v": (25, 25),
        "w": (30, 30),
        "x": (28, 28),
        "y": (24, 24),
        # ── uppercase ──────────────────────────────────────────────────────
        "A": (23, 23),
        "B": (84, 52),
        "D": (84, 60),
        "E": (84, 50),
        "F": (84, 43),
        "G": (60, 60),
        "H": (84, 84),
        "I": (84, 84),
        "K": (84, 28),
        "L": (84, 25),
        "M": (84, 84),
        "N": (84, 84),
        "P": (84, 40),
        "R": (84, 51),
        "S": (47, 53),
        "T": (22, 22),
        "U": (79, 79),
        "V": (18, 18),
        "W": (23, 23),
        "Y": (16, 16),
        "Z": (49, 49),
        # ── punctuation ────────────────────────────────────────────────────
        "period":    (70, 70),
        "comma":     (70, 70),
        "colon":     (74, 74),
        "semicolon": (74, 74),
        "exclam":    (96, 96),
        "question":  (40, 46),
        "hyphen":    (47, 47),
        "endash":    (24, 24),
        "emdash":    (24, 24),
    },
    "Bold": {
        # ── lowercase ──────────────────────────────────────────────────────
        "a": (42, 60),
        "b": (63, 39),
        "d": (39, 63),
        "f": (35, 23),
        "g": (37, 63),
        "h": (63, 59),
        "i": (63, 63),
        "dotlessi": (63, 63),
        "j": (-21, 63),
        "k": (63, 15),
        "l": (61, 30),
        "m": (63, 59),
        "n": (63, 59),
        "p": (63, 39),
        "q": (39, 63),
        "r": (63, 6),
        "s": (29, 36),
        "t": (27, 41),
        "u": (58, 63),
        "v": (14, 14),
        "w": (17, 17),
        "x": (16, 16),
        "y": (12, 12),
        # ── uppercase ──────────────────────────────────────────────────────
        "A": (13, 13),
        "B": (65, 41),
        "D": (65, 49),
        "E": (65, 44),
        "F": (65, 36),
        "G": (47, 47),
        "H": (65, 65),
        "I": (65, 65),
        "K": (65, 19),
        "L": (65, 22),
        "M": (65, 65),
        "N": (65, 65),
        "P": (65, 29),
        "R": (65, 32),
        "S": (27, 34),
        "T": (17, 17),
        "U": (62, 62),
        "V": (10, 10),
        "W": (11, 11),
        "Y": (7, 8),
        "Z": (40, 40),
        # ── punctuation ────────────────────────────────────────────────────
        "period":    (60, 60),
        "comma":     (60, 60),
        "colon":     (65, 65),
        "semicolon": (65, 65),
        "exclam":    (81, 81),
        "question":  (26, 37),
        "hyphen":    (42, 42),
        "endash":    (20, 20),
        "emdash":    (20, 20),
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _xmin_from_outline(outline_elem: ET.Element) -> int | None:
    """Return the minimum x among all contour points; None if no points."""
    xs = []
    for pt in outline_elem.iter("point"):
        x = pt.get("x")
        if x is not None:
            xs.append(int(x))
    return min(xs) if xs else None


def _xmax_from_outline(outline_elem: ET.Element) -> int | None:
    """Return the maximum x among all contour points; None if no points."""
    xs = []
    for pt in outline_elem.iter("point"):
        x = pt.get("x")
        if x is not None:
            xs.append(int(x))
    return max(xs) if xs else None


def _shift_x(root: ET.Element, delta: int) -> None:
    """Shift every x-positioned element in the glyph by delta."""
    # Contour points
    for pt in root.iter("point"):
        if "x" in pt.attrib:
            pt.set("x", str(int(pt.get("x")) + delta))
    # Component x-offsets that are already non-zero (= combining marks)
    # Zero-offset base components are intentionally left at 0.
    for comp in root.iter("component"):
        xoff_str = comp.get("xOffset")
        if xoff_str is not None and int(xoff_str) != 0:
            comp.set("xOffset", str(int(xoff_str) + delta))
    # Anchors
    for el in root.iter("anchor"):
        if "x" in el.attrib:
            el.set("x", str(int(el.get("x")) + delta))
    # Guidelines
    for el in root.iter("guideline"):
        if "x" in el.attrib:
            el.set("x", str(int(el.get("x")) + delta))
    # PostScript hint positions (com.fontlab.hintData → vhints[].position)
    lib = root.find("lib")
    if lib is not None:
        ld = lib.find("dict")
        if ld is not None:
            children = list(ld)
            for i in range(0, len(children) - 1, 2):
                if children[i].tag == "key" and children[i].text == "com.fontlab.hintData":
                    hd_children = list(children[i + 1])
                    for j in range(0, len(hd_children) - 1, 2):
                        if hd_children[j].tag == "key" and hd_children[j].text == "vhints":
                            for dict_elem in hd_children[j + 1].findall("dict"):
                                dc = list(dict_elem)
                                for k in range(0, len(dc) - 1, 2):
                                    if dc[k].tag == "key" and dc[k].text == "position":
                                        if dc[k + 1].tag in ("integer", "real"):
                                            dc[k + 1].text = str(int(dc[k + 1].text) + delta)


def _write_glif(tree: ET.ElementTree, path: Path) -> None:
    ET.indent(tree, space="  ")
    tree.write(path, xml_declaration=True, encoding="UTF-8")


# ---------------------------------------------------------------------------
# Phase 1 — patch base glyphs
# ---------------------------------------------------------------------------

def _patch_base_glyphs(
    glyphs_dir: Path,
    contents: dict[str, str],
    targets: dict[str, tuple[int, int]],
) -> dict[str, tuple[int, int, int]]:
    """
    Apply target (lsb, rsb) to each glyph in targets.
    Returns {glyph_name: (delta_lsb, old_advance, new_advance)}.
    """
    applied: dict[str, tuple[int, int, int]] = {}

    for glyph_name, (target_lsb, target_rsb) in targets.items():
        filename = contents.get(glyph_name)
        if filename is None:
            print(
                f"  [spacing-patch] WARNING: '{glyph_name}' not in contents.plist — skipped",
                file=sys.stderr,
            )
            continue

        glif_path = glyphs_dir / filename
        if not glif_path.exists():
            print(
                f"  [spacing-patch] WARNING: '{glif_path.name}' not found — skipped",
                file=sys.stderr,
            )
            continue

        tree = ET.parse(glif_path)
        root = tree.getroot()

        # Advance width
        adv_elem = root.find("advance")
        if adv_elem is None:
            continue
        old_advance = int(adv_elem.get("width", 0))

        # Need the outline to compute xmin / xmax
        outline = root.find("outline")
        if outline is None:
            continue

        xmin = _xmin_from_outline(outline)
        xmax = _xmax_from_outline(outline)
        if xmin is None or xmax is None:
            # Pure composite — handled in phase 2
            continue

        current_lsb = xmin
        current_rsb = old_advance - xmax
        delta_lsb = target_lsb - current_lsb
        delta_rsb = target_rsb - current_rsb

        if delta_lsb == 0 and delta_rsb == 0:
            continue  # already correct

        new_advance = old_advance + delta_lsb + delta_rsb
        adv_elem.set("width", str(new_advance))

        if delta_lsb != 0:
            _shift_x(root, delta_lsb)

        _write_glif(tree, glif_path)
        applied[glyph_name] = (delta_lsb, old_advance, new_advance)

    return applied


# ---------------------------------------------------------------------------
# Phase 2 — propagate to composites
# ---------------------------------------------------------------------------

def _propagate_to_composites(
    glyphs_dir: Path,
    contents: dict[str, str],
    applied: dict[str, tuple[int, int, int]],
) -> int:
    """
    For every composite glyph whose primary base was patched:
      - update advance width to match the new base advance
      - shift any non-zero-xOffset component (combining marks) by delta_lsb

    Returns number of composites updated.
    """
    if not applied:
        return 0

    # Build reverse map: old_advance → list of (glyph_name, delta_lsb, new_advance)
    # (multiple glyphs could share the same old advance, so we match by base component name)
    count = 0

    for glyph_name, filename in contents.items():
        if glyph_name in applied:
            continue  # already a base glyph

        glif_path = glyphs_dir / filename
        if not glif_path.exists():
            continue

        tree = ET.parse(glif_path)
        root = tree.getroot()

        outline = root.find("outline")
        if outline is None:
            continue

        components = outline.findall("component")
        if not components:
            continue

        # Is any zero-offset component a base we patched?
        primary_base = None
        for comp in components:
            base = comp.get("base", "")
            xoff = int(comp.get("xOffset", "0"))
            yoff = int(comp.get("yOffset", "0"))
            if xoff == 0 and yoff == 0 and base in applied:
                primary_base = base
                break

        if primary_base is None:
            continue

        delta_lsb, old_advance, new_advance = applied[primary_base]

        adv_elem = root.find("advance")
        if adv_elem is None:
            continue

        composite_advance = int(adv_elem.get("width", 0))

        # Only update if the composite's advance matches the base's old advance.
        # (Some composites intentionally differ, e.g. dcaron has extra tail width.)
        if composite_advance != old_advance:
            continue

        adv_elem.set("width", str(new_advance))

        # Shift any non-zero-xOffset components (combining marks)
        if delta_lsb != 0:
            for comp in components:
                xoff_str = comp.get("xOffset")
                if xoff_str is not None and int(xoff_str) != 0:
                    comp.set("xOffset", str(int(xoff_str) + delta_lsb))
            # Also shift anchors on the composite
            for el in root.iter("anchor"):
                if "x" in el.attrib:
                    el.set("x", str(int(el.get("x")) + delta_lsb))

        _write_glif(tree, glif_path)
        count += 1

    return count


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def apply(glyphs_dir: Path, weight: str) -> int:
    """
    Adjust sidebearings for all glyphs in glyphs_dir to match DINsical targets.

    Args:
        glyphs_dir: path to the UFO's glyphs/ directory (already scaled)
        weight:     "Regular" or "Bold"

    Returns:
        Total number of glyphs modified (base + composites).
    """
    targets = TARGETS.get(weight)
    if not targets:
        print(
            f"  [spacing-patch] no targets for weight '{weight}' — skipped",
            file=sys.stderr,
        )
        return 0

    contents_path = glyphs_dir / "contents.plist"
    if not contents_path.exists():
        print(
            f"  [spacing-patch] contents.plist not found in {glyphs_dir} — skipped",
            file=sys.stderr,
        )
        return 0

    contents: dict[str, str] = plistlib.loads(contents_path.read_bytes())

    # Phase 1
    applied = _patch_base_glyphs(glyphs_dir, contents, targets)

    # Phase 2
    composite_count = _propagate_to_composites(glyphs_dir, contents, applied)

    total = len(applied) + composite_count
    return total
