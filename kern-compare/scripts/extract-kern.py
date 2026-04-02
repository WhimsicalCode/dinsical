#!/usr/bin/env python3
"""
Extract all GPOS kern pairs (Format 1 + Format 2) from Dinsy and DINsical fonts.
Outputs one JSON file per weight+style into ../public/kern-data/.

JSON format:
  { "dinsy": [[leftCP, rightCP, value], ...], "dinsical": [...] }
"""

import json
from pathlib import Path
from collections import defaultdict
from fontTools.ttLib import TTFont

ROOT     = Path(__file__).parent.parent.parent   # dinsy project root
OUT      = Path(__file__).parent.parent / 'public' / 'kern-data'
OUT.mkdir(parents=True, exist_ok=True)

PATHS: dict[str, tuple[str, str]] = {
    'Light-upright':   ('Dinsy-Light.ttf',         'DINsical-Light.otf'),
    'Light-italic':    ('Dinsy-LightItalic.ttf',   'DINsical-LightItalic.otf'),
    'Regular-upright': ('Dinsy-Regular.ttf',        'DINsical-Regular.otf'),
    'Regular-italic':  ('Dinsy-Italic.ttf',         'DINsical-Italic.otf'),
    'Medium-upright':  ('Dinsy-Medium.ttf',         'DINsical-Medium.otf'),
    'Medium-italic':   ('Dinsy-MediumItalic.ttf',   'DINsical-MediumItalic.otf'),
    'Bold-upright':    ('Dinsy-Bold.ttf',           'DINsical-Bold.otf'),
    'Bold-italic':     ('Dinsy-BoldItalic.ttf',     'DINsical-BoldItalic.otf'),
    'Heavy-upright':   ('Dinsy-Heavy.ttf',          'DINsical-Heavy.otf'),
    'Heavy-italic':    ('Dinsy-HeavyItalic.ttf',    'DINsical-HeavyItalic.otf'),
    'Black-upright':   ('Dinsy-Black.ttf',          'DINsical-Black.otf'),
    'Black-italic':    ('Dinsy-BlackItalic.ttf',    'DINsical-BlackItalic.otf'),
}


def get_kern_pairs(font: TTFont) -> dict[tuple[str, str], int]:
    """Return {(left_name, right_name): xAdvance} for all non-zero kern pairs (F1 + F2)."""
    gpos = font.get('GPOS')
    if not gpos:
        return {}

    result: dict[tuple[str, str], int] = {}

    for lookup in gpos.table.LookupList.Lookup:
        if lookup.LookupType != 2:
            continue
        for sub in lookup.SubTable:
            if sub.Format == 1:
                for i, ps in enumerate(sub.PairSet):
                    left = sub.Coverage.glyphs[i]
                    for rec in ps.PairValueRecord:
                        val = getattr(rec.Value1, 'XAdvance', 0) or 0
                        if val:
                            result[(left, rec.SecondGlyph)] = val

            elif sub.Format == 2:
                cls1 = sub.ClassDef1.classDefs   # glyph_name -> class_id
                cls2 = sub.ClassDef2.classDefs
                rev1: dict[int, list[str]] = defaultdict(list)
                rev2: dict[int, list[str]] = defaultdict(list)
                for g, c in cls1.items():
                    rev1[c].append(g)
                for g, c in cls2.items():
                    rev2[c].append(g)

                coverage = set(sub.Coverage.glyphs)
                for c1idx, row in enumerate(sub.Class1Record):
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
                                result[(lg, rg)] = val

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


for key, (dinsy_file, dinsical_file) in PATHS.items():
    dinsy_path    = ROOT / 'fonts' / 'ttf' / dinsy_file
    dinsical_path = ROOT / 'dinsical' / 'otf' / dinsical_file

    if not dinsy_path.exists():
        print(f'SKIP {key}: {dinsy_path.name} not found')
        continue
    if not dinsical_path.exists():
        print(f'SKIP {key}: {dinsical_path.name} not found')
        continue

    print(f'Processing {key}…', end='  ', flush=True)
    dinsy_font    = TTFont(str(dinsy_path),    lazy=True)
    dinsical_font = TTFont(str(dinsical_path), lazy=True)

    dinsy_pairs    = to_codepoints(dinsy_font,    get_kern_pairs(dinsy_font))
    dinsical_pairs = to_codepoints(dinsical_font, get_kern_pairs(dinsical_font))

    print(f'Dinsy={len(dinsy_pairs)}  DINsical={len(dinsical_pairs)}')

    out_path = OUT / f'{key}.json'
    out_path.write_text(json.dumps({'dinsy': dinsy_pairs, 'dinsical': dinsical_pairs},
                                   separators=(',', ':')))
    print(f'  → {out_path.name}')

print('\nDone.')
