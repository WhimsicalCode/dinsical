"""
Dinsy kern patch — applied on top of the upstream-derived features.fea.

Called by tools/derive-sources.py after each `make sources` run.
The patch is intentionally narrow: it only records divergences from upstream
(DINish → DINsical comparison). Upstream kern changes to un-patched pairs flow
through automatically. Each change is annotated with its DINsical target value.

Entry point: apply(fea: str) -> str
"""

import re
import sys


# ── helpers ────────────────────────────────────────────────────────────────

def _sub(fea: str, old: str, new: str, label: str) -> str:
    """Exact string replacement; warns if the old text is not found."""
    if old not in fea:
        print(f"  [kern-patch] WARNING: '{label}' not found — skipped", file=sys.stderr)
        return fea
    return fea.replace(old, new, 1)


def _remove_line(fea: str, line_content: str, label: str) -> str:
    """Remove a line whose stripped content equals line_content."""
    pattern = r'[ \t]*' + re.escape(line_content) + r'[ \t]*\n'
    result, n = re.subn(pattern, '', fea, count=1)
    if n == 0:
        print(f"  [kern-patch] WARNING: line '{label}' not found — skipped", file=sys.stderr)
    return result


# ── 1. Comma / period separation ──────────────────────────────────────────

def _comma_separation(fea: str) -> str:
    """
    DINsical never kerns before commas — only before periods.
    Remove \\comma from both kern lookup second-groups that currently
    lump comma and period together.
    """
    # lookup1 — class-based UC-first kern
    fea = _sub(
        fea,
        '  @kc6_second_7 = [ \\comma \\period \\quotesinglbase \\quotedblbase ];',
        '  @kc6_second_7 = [ \\period \\quotesinglbase \\quotedblbase ];',
        '@kc6_second_7 comma removal',
    )
    # lookup3 — class-based LC-first kern
    fea = _sub(
        fea,
        '  @kc8_second_2 = [ \\comma \\period \\quotesinglbase \\quotedblbase ];',
        '  @kc8_second_2 = [ \\period \\quotesinglbase \\quotedblbase ];',
        '@kc8_second_2 comma removal',
    )
    return fea


# ── 2. Split round-LC group (@kc6_second_13) ──────────────────────────────

def _split_round_lc_group(fea: str) -> str:
    """
    Split @kc6_second_13 (all round LC: c d e g o q) into:
      @kc6_second_13  — open-bowl only:   c e o  (+ accented variants)
      @kc6_second_13b — closed-bowl only: d g q

    DINsical kerns F, K, T, Y differently for these two shapes:
      F: open=-42, closed=-14
      K: open=-11, closed=-8 (approx)
      T: open=-66, closed d/q=-40 (g not kerned)
      Y: open=-58, closed=-56
    """
    fea = _sub(
        fea,
        (
            '  @kc6_second_13 = [ \\c \\d \\e \\g \\o \\q \\ccedilla \\egrave \\eacute \\ecircumflex'
            ' \\edieresis \\ograve \\oacute\n'
            '  \\ocircumflex \\otilde \\odieresis \\oe ];'
        ),
        (
            '  @kc6_second_13 = [ \\c \\e \\o \\ccedilla \\egrave \\eacute \\ecircumflex'
            ' \\edieresis \\ograve \\oacute\n'
            '  \\ocircumflex \\otilde \\odieresis \\oe ];\n'
            '  @kc6_second_13b = [ \\d \\g \\q ];'
        ),
        '@kc6_second_13 split',
    )
    return fea


# ── 3. Specific pair overrides (Format 1 — precede class rules) ────────────

_SPECIFIC_OVERRIDES = """\
  # ── Specific pair overrides ────────────────────────────────────────────
  # These Format-1 rules take precedence over the class-based (Format-2)
  # rules below.  DINsical target values are noted inline.
  pos \\L \\v -34;       # Lv  DINsical=-34  (class rule has -93)
  pos \\L \\w -30;       # Lw  DINsical=-30
  pos \\L \\y -16;       # Ly  DINsical=-16
  pos \\L \\yacute -16;
  pos \\L \\ydieresis -16;
  pos \\T \\d -40;       # Td  DINsical=-40  (class rule has -82 for open bowl)
  pos \\T \\q -40;       # Tq  DINsical=-40
  pos \\Y \\S -24;       # YS  DINsical=-24
  pos \\Yacute \\S -24;
  pos \\Ydieresis \\S -24;
  pos \\Y \\f -10;       # Yf  DINsical=-10
  pos \\Yacute \\f -10;
  pos \\Ydieresis \\f -10;
  subtable;
  # ── Class-based rules ──────────────────────────────────────────────────
"""


def _add_specific_overrides(fea: str) -> str:
    """Insert specific-pair overrides at the top of lookup1, before class defs."""
    anchor = 'lookup kernHorizontalKerninginLatinlookup1 {\n  lookupflag 0;\n'
    replacement = anchor + _SPECIFIC_OVERRIDES
    return _sub(fea, anchor, replacement, 'lookup1 specific overrides insertion')


# ── 4. Add Y as first-glyph kern group ────────────────────────────────────

_Y_FIRST_GROUP = """\
  @kc6_first_12 = [ \\Y \\Yacute \\Ydieresis ];
"""

_Y_KERN_RULES = """\
  pos @kc6_first_12 @kc6_second_1 -12;    # Y+C/G/O/Q      DINsical=-12
  pos @kc6_first_12 @kc6_second_7 -96;    # Y+period        DINsical=-96
  pos @kc6_first_12 @kc6_second_9 -28;    # Y+v/w/y avg     DINsical=-28/-23/-33
  pos @kc6_first_12 @kc6_second_10 -59;   # Y+A             DINsical=-59
  pos @kc6_first_12 @kc6_second_11 -56;   # Y+a             DINsical=-56
  pos @kc6_first_12 @kc6_second_13 -58;   # Y+c/e/o         DINsical=-58
  pos @kc6_first_12 @kc6_second_13b -56;  # Y+d/g/q         DINsical=-56
  pos @kc6_first_12 @kc6_second_14 -56;   # Y+s             DINsical=-56
  pos @kc6_first_12 @kc6_second_15 -92;   # Y+hyphen        DINsical=-92
  pos @kc6_first_12 @kc6_second_18 -53;   # Y+colon/semi    DINsical=-53
  pos @kc6_first_12 @kc6_second_19 -43;   # Y+x             DINsical=-43
"""


def _add_y_kern_group(fea: str) -> str:
    """Add Y as a new first-glyph class and insert its kern rules."""
    # Add @kc6_first_12 definition right after @kc6_first_11
    fea = _sub(
        fea,
        '  @kc6_first_11 = [ \\X ];\n',
        '  @kc6_first_11 = [ \\X ];\n' + _Y_FIRST_GROUP,
        '@kc6_first_12 Y group definition',
    )
    # Add Y kern rules just before the closing brace of lookup1
    fea = _sub(
        fea,
        '} kernHorizontalKerninginLatinlookup1;',
        _Y_KERN_RULES + '} kernHorizontalKerninginLatinlookup1;',
        'Y kern rules insertion',
    )
    return fea


# ── 5. Adjust existing pos values ─────────────────────────────────────────
#
# Format: (old_line, new_line, label)
# Lines are matched exactly (2-space indent, no trailing whitespace).

_VALUE_CHANGES = [
    # F ── period (DINsical=-100; was -141 covering comma+period combined)
    ('  pos @kc6_first_3 @kc6_second_7 -141;',
     '  pos @kc6_first_3 @kc6_second_7 -100;',
     'F+period -141→-100'),
    # F ── open-bowl LC (DINsical F+c/e/o=-42)
    ('  pos @kc6_first_3 @kc6_second_13 -51;',
     '  pos @kc6_first_3 @kc6_second_13 -42;',
     'F+open-bowl-LC -51→-42'),
    # F ── closed-bowl LC (NEW: DINsical F+d/g/q=-14)
    ('  pos @kc6_first_3 @kc6_second_14 -47;',
     '  pos @kc6_first_3 @kc6_second_13b -14;\n  pos @kc6_first_3 @kc6_second_14 -47;',
     'F+closed-bowl-LC add'),

    # K ── open-bowl LC (DINsical K+c/e/o≈-11)
    ('  pos @kc6_first_4 @kc6_second_13 -25;',
     '  pos @kc6_first_4 @kc6_second_13 -11;\n  pos @kc6_first_4 @kc6_second_13b -8;',
     'K+round-LC split'),

    # L ── round UC (DINsical L+C/G/O/Q=-30)
    ('  pos @kc6_first_5 @kc6_second_1 -40;',
     '  pos @kc6_first_5 @kc6_second_1 -30;',
     'L+round-UC -40→-30'),
    # L ── T (DINsical=-90)
    ('  pos @kc6_first_5 @kc6_second_2 -117;',
     '  pos @kc6_first_5 @kc6_second_2 -90;',
     'L+T -117→-90'),
    # L ── U (DINsical=-30)
    ('  pos @kc6_first_5 @kc6_second_3 -55;',
     '  pos @kc6_first_5 @kc6_second_3 -30;',
     'L+U -55→-30'),
    # L ── V (DINsical=-60)
    ('  pos @kc6_first_5 @kc6_second_4 -103;',
     '  pos @kc6_first_5 @kc6_second_4 -60;',
     'L+V -103→-60'),
    # L ── W (DINsical=-36)
    ('  pos @kc6_first_5 @kc6_second_5 -71;',
     '  pos @kc6_first_5 @kc6_second_5 -36;',
     'L+W -71→-36'),
    # L ── Y (DINsical=-90)
    ('  pos @kc6_first_5 @kc6_second_6 -109;',
     '  pos @kc6_first_5 @kc6_second_6 -90;',
     'L+Y -109→-90'),
    # L ── hyphen (DINsical=-24)
    ('  pos @kc6_first_5 @kc6_second_15 -133;',
     '  pos @kc6_first_5 @kc6_second_15 -24;',
     'L+hyphen -133→-24'),

    # P ── period (DINsical=-140; Dinsy was too loose)
    ('  pos @kc6_first_6 @kc6_second_7 -115;',
     '  pos @kc6_first_6 @kc6_second_7 -140;',
     'P+period -115→-140'),

    # T ── round UC (DINsical=-24)
    ('  pos @kc6_first_7 @kc6_second_1 -31;',
     '  pos @kc6_first_7 @kc6_second_1 -24;',
     'T+round-UC -31→-24'),
    # T ── period (DINsical=-98; Dinsy was too loose)
    ('  pos @kc6_first_7 @kc6_second_7 -80;',
     '  pos @kc6_first_7 @kc6_second_7 -98;',
     'T+period -80→-98'),
    # T ── v/w/y (DINsical=-48)
    ('  pos @kc6_first_7 @kc6_second_9 -61;',
     '  pos @kc6_first_7 @kc6_second_9 -48;',
     'T+v/w/y -61→-48'),
    # T ── A (DINsical=-72)
    ('  pos @kc6_first_7 @kc6_second_10 -79;',
     '  pos @kc6_first_7 @kc6_second_10 -72;',
     'T+A -79→-72'),
    # T ── a (DINsical=-72)
    ('  pos @kc6_first_7 @kc6_second_11 -84;',
     '  pos @kc6_first_7 @kc6_second_11 -72;',
     'T+a -84→-72'),
    # T ── open-bowl LC (DINsical T+c/e/o=-66)
    ('  pos @kc6_first_7 @kc6_second_13 -82;',
     '  pos @kc6_first_7 @kc6_second_13 -66;\n  pos @kc6_first_7 @kc6_second_13b -40;',
     'T+round-LC split -82→-66/-40'),
    # T ── s (DINsical=-50)
    ('  pos @kc6_first_7 @kc6_second_14 -73;',
     '  pos @kc6_first_7 @kc6_second_14 -50;',
     'T+s -73→-50'),
    # T ── colon/semicolon (DINsical=-20)
    ('  pos @kc6_first_7 @kc6_second_18 -40;',
     '  pos @kc6_first_7 @kc6_second_18 -20;',
     'T+colon/semi -40→-20'),
    # T ── x (DINsical=-37)
    ('  pos @kc6_first_7 @kc6_second_19 -61;',
     '  pos @kc6_first_7 @kc6_second_19 -37;',
     'T+x -61→-37'),

    # U ── period (DINsical=-21)
    ('  pos @kc6_first_8 @kc6_second_7 -40;',
     '  pos @kc6_first_8 @kc6_second_7 -21;',
     'U+period -40→-21'),

    # V ── period (DINsical=-90; Dinsy was too loose)
    ('  pos @kc6_first_9 @kc6_second_7 -70;',
     '  pos @kc6_first_9 @kc6_second_7 -90;',
     'V+period -70→-90'),

    # W ── period (DINsical=-60)
    ('  pos @kc6_first_10 @kc6_second_7 -57;',
     '  pos @kc6_first_10 @kc6_second_7 -60;',
     'W+period -57→-60'),

    # X ── round UC (DINsical=-7)
    ('  pos @kc6_first_11 @kc6_second_1 -17;',
     '  pos @kc6_first_11 @kc6_second_1 -7;',
     'X+round-UC -17→-7'),
    # X ── open-bowl LC (DINsical X+c/e/o=-10; d/g/q → 0 = no rule needed)
    ('  pos @kc6_first_11 @kc6_second_13 -15;',
     '  pos @kc6_first_11 @kc6_second_13 -10;',
     'X+open-bowl-LC -15→-10'),

    # hyphen ── V (DINsical=-64; Dinsy was too loose)
    ('  pos @kc9_first_1 @kc9_second_2 -40;',
     '  pos @kc9_first_1 @kc9_second_2 -64;',
     'hyphen+V -40→-64'),
    # hyphen ── Y (DINsical=-92; Dinsy was too loose)
    ('  pos @kc9_first_1 @kc9_second_4 -72;',
     '  pos @kc9_first_1 @kc9_second_4 -92;',
     'hyphen+Y -72→-92'),
]


def _adjust_values(fea: str) -> str:
    for old, new, label in _VALUE_CHANGES:
        fea = _sub(fea, old, new, label)
    return fea


# ── 6. Remove rules where Dinsy has extra pairs DINsical lacks ────────────

_LINES_TO_REMOVE = [
    # L ── lowercase extras (DINsical has no L+LC kerning)
    ('pos @kc6_first_5 @kc6_second_11 -16;', 'L+a-LC extra'),
    ('pos @kc6_first_5 @kc6_second_12 -32;', 'L+straight-LC extra'),
    ('pos @kc6_first_5 @kc6_second_13 -29;', 'L+open-bowl-LC extra'),
    # T ── straight-LC (DINsical has no T+b/h/i/k/l/n/p/r kerning)
    ('pos @kc6_first_7 @kc6_second_12 -12;', 'T+straight-LC extra'),
    # F ── straight-LC (DINsical has no F+b/h/i/k/l/n/p/r kerning)
    ('pos @kc6_first_3 @kc6_second_12 -12;', 'F+straight-LC extra'),
    # V ── straight-LC (DINsical has no V+straight-LC kerning)
    ('pos @kc6_first_9 @kc6_second_12 -29;', 'V+straight-LC extra'),
    # W ── straight-LC (DINsical has no W+straight-LC kerning)
    ('pos @kc6_first_10 @kc6_second_12 -5;', 'W+straight-LC extra'),
    # K ── straight-LC (DINsical has no K+straight-LC kerning)
    ('pos @kc6_first_4 @kc6_second_12 -6;', 'K+straight-LC extra'),
    # Z ── closed-bowl LC & a (DINsical has no Z+d/g/q/a kerning)
    ('pos \\Z \\q -36;', 'Z+q extra'),
    ('pos \\Z \\g -36;', 'Z+g extra'),
    ('pos \\Z \\d -36;', 'Z+d extra'),
    ('pos \\Z \\ae -20;', 'Z+ae extra'),
    ('pos \\Z \\aring -20;', 'Z+aring extra'),
    ('pos \\Z \\adieresis -20;', 'Z+adieresis extra'),
    ('pos \\Z \\atilde -20;', 'Z+atilde extra'),
    ('pos \\Z \\acircumflex -20;', 'Z+acircumflex extra'),
    ('pos \\Z \\aacute -20;', 'Z+aacute extra'),
    ('pos \\Z \\agrave -20;', 'Z+agrave extra'),
    ('pos \\Z \\a -20;', 'Z+a extra'),
]


def _remove_extra_rules(fea: str) -> str:
    for line, label in _LINES_TO_REMOVE:
        fea = _remove_line(fea, line, label)
    return fea


# ── 7. Add missing pairs ───────────────────────────────────────────────────

# New individual kern pairs to append at the end of lookup0.
_NEW_LOOKUP0_PAIRS = """\
  # ── Pairs missing from upstream but present in DINsical ─────────────────
  pos \\T \\J -96;        # TJ  DINsical=-96
  pos \\P \\J -79;        # PJ  DINsical=-79
  pos \\V \\J -66;        # VJ  DINsical=-66
  pos \\F \\J -59;        # FJ  DINsical=-59
  pos \\W \\J -55;        # WJ  DINsical=-55
  pos \\Y \\J -82;        # YJ  DINsical=-82
  pos \\Yacute \\J -82;
  pos \\Ydieresis \\J -82;
  pos \\T \\m -54;        # Tm  DINsical=-54  (was grouped with straight-LC at -12)
  pos \\T \\u -54;        # Tu  DINsical=-54
  pos \\T \\ugrave -54;
  pos \\T \\uacute -54;
  pos \\T \\ucircumflex -54;
  pos \\T \\udieresis -54;
  pos \\F \\m -24;        # Fm  DINsical=-24  (was grouped with straight-LC at -12)
  pos \\F \\u -30;        # Fu  DINsical=-30
  pos \\F \\ugrave -30;
  pos \\F \\uacute -30;
  pos \\F \\ucircumflex -30;
  pos \\F \\udieresis -30;
  pos \\Y \\z -46;        # Yz  DINsical=-46
  pos \\Yacute \\z -46;
  pos \\Ydieresis \\z -46;
  pos \\Y \\m -49;        # Ym  DINsical=-49
  pos \\Yacute \\m -49;
  pos \\Ydieresis \\m -49;
  pos \\Y \\u -48;        # Yu  DINsical=-48
  pos \\Yacute \\u -48;
  pos \\Ydieresis \\u -48;
  pos \\Y \\ugrave -48;
  pos \\Yacute \\ugrave -48;
  pos \\Ydieresis \\ugrave -48;
  pos \\Y \\uacute -48;
  pos \\Yacute \\uacute -48;
  pos \\Ydieresis \\uacute -48;
  pos \\Y \\ucircumflex -48;
  pos \\Yacute \\ucircumflex -48;
  pos \\Ydieresis \\ucircumflex -48;
  pos \\Y \\udieresis -48;
  pos \\Yacute \\udieresis -48;
  pos \\Ydieresis \\udieresis -48;
"""

# Adjust Z values that differ (reduce Z+c/e/o from -36 to -18 to match DINsical)
_Z_VALUE_CHANGES = [
    ('  pos \\Z \\oe -36;',           '  pos \\Z \\oe -18;',           'Z+oe -36→-18'),
    ('  pos \\Z \\odieresis -36;',    '  pos \\Z \\odieresis -18;',     'Z+odieresis -36→-18'),
    ('  pos \\Z \\otilde -36;',       '  pos \\Z \\otilde -18;',        'Z+otilde -36→-18'),
    ('  pos \\Z \\ocircumflex -36;',  '  pos \\Z \\ocircumflex -18;',   'Z+ocircumflex -36→-18'),
    ('  pos \\Z \\oacute -36;',       '  pos \\Z \\oacute -18;',        'Z+oacute -36→-18'),
    ('  pos \\Z \\ograve -36;',       '  pos \\Z \\ograve -18;',        'Z+ograve -36→-18'),
    ('  pos \\Z \\edieresis -36;',    '  pos \\Z \\edieresis -18;',     'Z+edieresis -36→-18'),
    ('  pos \\Z \\ecircumflex -36;',  '  pos \\Z \\ecircumflex -18;',   'Z+ecircumflex -36→-18'),
    ('  pos \\Z \\eacute -36;',       '  pos \\Z \\eacute -18;',        'Z+eacute -36→-18'),
    ('  pos \\Z \\egrave -36;',       '  pos \\Z \\egrave -18;',        'Z+egrave -36→-18'),
    ('  pos \\Z \\ccedilla -36;',     '  pos \\Z \\ccedilla -18;',      'Z+ccedilla -36→-18'),
    ('  pos \\Z \\o -36;',            '  pos \\Z \\o -18;',             'Z+o -36→-18'),
    ('  pos \\Z \\e -36;',            '  pos \\Z \\e -18;',             'Z+e -36→-18'),
    ('  pos \\Z \\c -36;',            '  pos \\Z \\c -18;',             'Z+c -36→-18'),
]


def _add_missing_pairs(fea: str) -> str:
    """Append missing pairs to lookup0 and adjust Z values."""
    # Append new pairs before the closing brace of lookup0
    fea = _sub(
        fea,
        '} kernHorizontalKerninginLatinlookup0;',
        _NEW_LOOKUP0_PAIRS + '} kernHorizontalKerninginLatinlookup0;',
        'lookup0 new pairs',
    )
    # Fix Z+c/e/o values (reduce from -36 to -18)
    for old, new, label in _Z_VALUE_CHANGES:
        fea = _sub(fea, old, new, label)
    return fea


# ── Entry point ───────────────────────────────────────────────────────────

def apply(fea: str) -> str:
    """Apply all Dinsy kern patches to features.fea text. Returns patched text."""
    fea = _comma_separation(fea)
    fea = _split_round_lc_group(fea)
    fea = _add_specific_overrides(fea)
    fea = _add_y_kern_group(fea)
    fea = _adjust_values(fea)
    fea = _remove_extra_rules(fea)
    fea = _add_missing_pairs(fea)
    return fea
