#!/usr/bin/env python3
"""
Extract all GPOS kern pairs (Format 1 + Format 2) from Dinsical and DIN Next fonts.
Outputs one JSON file per weight+style into ../public/kern-data/.

JSON format:
  { "dinsical": [[leftCP, rightCP, value], ...], "dinNext": [...] }
"""

import json
from pathlib import Path
from collections import defaultdict
from fontTools.ttLib import TTFont

ROOT     = Path(__file__).parent.parent.parent   # dinsical project root
OUT      = Path(__file__).parent.parent / 'public' / 'kern-data'
OUT.mkdir(parents=True, exist_ok=True)

PATHS: dict[str, tuple[str, str]] = {
    'Light-upright':   ('Dinsical-Light.ttf',         'DIN-Next-Light.otf'),
    'Light-italic':    ('Dinsical-LightItalic.ttf',   'DIN-Next-LightItalic.otf'),
    'Regular-upright': ('Dinsical-Regular.ttf',        'DIN-Next-Regular.otf'),
    'Regular-italic':  ('Dinsical-Italic.ttf',         'DIN-Next-Italic.otf'),
    'Medium-upright':  ('Dinsical-Medium.ttf',         'DIN-Next-Medium.otf'),
    'Medium-italic':   ('Dinsical-MediumItalic.ttf',   'DIN-Next-MediumItalic.otf'),
    'Bold-upright':    ('Dinsical-Bold.ttf',           'DIN-Next-Bold.otf'),
    'Bold-italic':     ('Dinsical-BoldItalic.ttf',     'DIN-Next-BoldItalic.otf'),
    'Heavy-upright':   ('Dinsical-Heavy.ttf',          'DIN-Next-Heavy.otf'),
    'Heavy-italic':    ('Dinsical-HeavyItalic.ttf',    'DIN-Next-HeavyItalic.otf'),
    'Black-upright':   ('Dinsical-Black.ttf',          'DIN-Next-Black.otf'),
    'Black-italic':    ('Dinsical-BlackItalic.ttf',    'DIN-Next-BlackItalic.otf'),
}


def get_kern_pairs(font: TTFont) -> dict[tuple[str, str], int]:
    """
    Return {(left_name, right_name): xAdvance} for all non-zero kern pairs.

    Respects OpenType subtable ordering: within each lookup the first subtable
    that matches a pair wins (later subtables cannot override it).  This matches
    how layout engines apply GPOS — a Format-1 specific-pair subtable placed
    before a Format-2 class subtable correctly takes precedence.
    """
    gpos = font.get('GPOS')
    if not gpos:
        return {}

    result: dict[tuple[str, str], int] = {}

    for lookup in gpos.table.LookupList.Lookup:
        if lookup.LookupType not in (2, 9):
            continue
        # Pairs already matched by an earlier subtable in *this* lookup
        matched_this_lookup: set[tuple[str, str]] = set()

        for sub in lookup.SubTable:
            # Unwrap Extension lookups (type 9)
            st = sub.ExtSubTable if lookup.LookupType == 9 else sub
            if not hasattr(st, 'Format'):
                continue

            if st.Format == 1 and hasattr(st, 'PairSet'):
                coverage = st.Coverage.glyphs
                for i, ps in enumerate(st.PairSet):
                    left = coverage[i]
                    for rec in ps.PairValueRecord:
                        pair = (left, rec.SecondGlyph)
                        if pair in matched_this_lookup:
                            continue   # earlier subtable already handled this pair
                        val = getattr(rec.Value1, 'XAdvance', 0) or 0
                        matched_this_lookup.add(pair)
                        if val:
                            result[pair] = val
                        # val==0 is still a match — mark it so later subtables are skipped

            elif st.Format == 2 and hasattr(st, 'Class1Record'):
                cls1 = st.ClassDef1.classDefs   # glyph_name -> class_id
                cls2 = st.ClassDef2.classDefs
                rev1: dict[int, list[str]] = defaultdict(list)
                rev2: dict[int, list[str]] = defaultdict(list)
                for g, c in cls1.items():
                    rev1[c].append(g)
                for g, c in cls2.items():
                    rev2[c].append(g)

                coverage = set(st.Coverage.glyphs)
                for c1idx, row in enumerate(st.Class1Record):
                    for c2idx, cell in enumerate(row.Class2Record):
                        val = getattr(cell.Value1, 'XAdvance', None)
                        if not val:
                            continue
                        lefts  = rev1.get(c1idx, [])
                        rights = rev2.get(c2idx, [])
                        for lg in lefts:
                            if lg not in coverage:
                                continue
                            for rg in rights:
                                pair = (lg, rg)
                                if pair not in matched_this_lookup:
                                    matched_this_lookup.add(pair)
                                    result[pair] = val

    return result


def to_codepoints(font: TTFont, pairs: dict[tuple[str, str], int]) -> list[list[int]]:
    """Convert glyph-name pairs to [leftCP, rightCP, value], dropping pairs with no unicode mapping."""
    cmap = font.getBestCmap()
    if not cmap:
        return []
    rev = {name: cp for cp, name in cmap.items()}
    out = []
    for (left, right), val in pairs.items():
        lcp = rev.get(left)
        rcp = rev.get(right)
        if lcp is not None and rcp is not None:
            out.append([lcp, rcp, val])
    return out


for key, (dinsical_file, din_next_file) in PATHS.items():
    dinsical_path    = ROOT / 'fonts' / 'ttf' / dinsical_file
    din_next_path = ROOT / 'din-next' / 'otf' / din_next_file

    if not dinsical_path.exists():
        print(f'SKIP {key}: {dinsical_path.name} not found')
        continue
    if not din_next_path.exists():
        print(f'SKIP {key}: {din_next_path.name} not found')
        continue

    print(f'Processing {key}…', end='  ', flush=True)
    dinsical_font    = TTFont(str(dinsical_path),    lazy=True)
    din_next_font = TTFont(str(din_next_path), lazy=True)

    dinsical_pairs    = to_codepoints(dinsical_font,    get_kern_pairs(dinsical_font))
    din_next_pairs = to_codepoints(din_next_font, get_kern_pairs(din_next_font))

    print(f'Dinsical={len(dinsical_pairs)}  DIN Next={len(din_next_pairs)}')

    out_path = OUT / f'{key}.json'
    out_path.write_text(json.dumps({'dinsical': dinsical_pairs, 'dinNext': din_next_pairs},
                                   separators=(',', ':')))
    print(f'  → {out_path.name}')

print('\nDone.')
