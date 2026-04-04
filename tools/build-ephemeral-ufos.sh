#!/bin/bash
# Full build: interpolate all weights + generate italics + variable font +
# static fonts in all formats.  Results land in $SRCDIR/fonts/.
#
# All intermediate files go into $SRCDIR/.build/ — only the two committed
# master UFOs are copied in; the real source tree is never written to.
#
# Version string (release vs dev) is determined by tools/update-version.sh:
#   release — working tree is clean
#   dev     — uncommitted changes present

set -e

SRCDIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$SRCDIR/.build"
TOOLSDIR="$SRCDIR/tools"

# Prefer GNU sed
if command -v gsed >/dev/null 2>&1; then SED=gsed; else SED=sed; fi

PYTHON="uv run --with fontparts --with xmltodict --with fonttools python"
NPROC="$(nproc 2>/dev/null || sysctl -n hw.logicalcpu 2>/dev/null || echo 4)"

# ---------------------------------------------------------------------------
# Set up build directory
# ---------------------------------------------------------------------------
rm -rf "$BUILD"
mkdir -p \
    "$BUILD/sources/Dinsical" \
    "$BUILD/vfwork/Dinsical" \
    "$BUILD/static/Dinsical"

# Copy master UFOs into build dir
cp -r "$SRCDIR/sources/Dinsical/Dinsical-Regular.ufo" "$BUILD/sources/Dinsical/"
cp -r "$SRCDIR/sources/Dinsical/Dinsical-Bold.ufo"    "$BUILD/sources/Dinsical/"

# Sync features.fea from Regular master to Bold
cp "$BUILD/sources/Dinsical/Dinsical-Regular.ufo/features.fea" \
   "$BUILD/sources/Dinsical/Dinsical-Bold.ufo/features.fea"

# Version-stamp the build copies (leaves real sources untouched)
version=$(cd "$SRCDIR" && BUILD_SOURCES="$BUILD/sources" tools/update-version.sh)
echo "$version"

# Derive Condensed/Expanded on-the-fly into build dir (not committed to sources/)
$PYTHON "$TOOLSDIR/derive-sources.py" \
    --families DinsicalCondensed DinsicalExpanded \
    --dest-dir "$BUILD/sources"

# ---------------------------------------------------------------------------
# VF masters — interpolated weights + italics for all three widths
# ---------------------------------------------------------------------------
for f in Dinsical DinsicalCondensed DinsicalExpanded; do
    mkdir -p "$BUILD/vfwork/$f"
    # All VF masters go through the calibrated factor — including Regular (w=4)
    # and Bold (w=7) — so the variable font axis matches DIN Next stem weights.
    for weight in Light Regular Bold Heavy Black; do
        case $weight in Light) w=3;; Regular) w=4;; Bold) w=7;; Heavy) w=8;; Black) w=9;; esac
        $PYTHON "$TOOLSDIR/interpolate-font.py" \
            --dest="$BUILD/vfwork/$f/$f-$weight.ufo" --weight=$w \
            "$BUILD/sources/$f/$f-Regular.ufo" \
            "$BUILD/sources/$f/$f-Bold.ufo"
    done

    # DinsicalCondensed: replace Heavy/Black digits with Bold (cleaner at narrow widths)
    if [ "$f" = "DinsicalCondensed" ]; then
        for name in zero one two three four five six seven eight nine; do
            cp "$BUILD/vfwork/$f/$f-Bold.ufo/glyphs/$name.glif" \
               "$BUILD/vfwork/$f/$f-Heavy.ufo/glyphs/"
            cp "$BUILD/vfwork/$f/$f-Bold.ufo/glyphs/$name.glif" \
               "$BUILD/vfwork/$f/$f-Black.ufo/glyphs/"
        done
    fi

    # All families: borrow ordfeminine/ordmasculine + dnom digits from Heavy into Black
    for name in ordfeminine ordmasculine \
        zero.dnom one.dnom two.dnom three.dnom four.dnom \
        five.dnom six.dnom seven.dnom eight.dnom nine.dnom; do
        cp "$BUILD/vfwork/$f/$f-Heavy.ufo/glyphs/$name.glif" \
           "$BUILD/vfwork/$f/$f-Black.ufo/glyphs/"
    done

    # Italic counterparts
    for weight in Light Regular Bold Black; do
        [ "$weight" = "Regular" ] && stylename="Italic" || stylename="${weight}Italic"
        cp -r "$BUILD/vfwork/$f/$f-$weight.ufo" \
              "$BUILD/vfwork/$f/$f-$stylename.ufo"
        $PYTHON "$TOOLSDIR/copy-missing-italics.py" \
            --source "$BUILD/vfwork/$f/$f-$weight.ufo" \
            --dest   "$BUILD/vfwork/$f/$f-$stylename.ufo" \
            --uprights "$SRCDIR/sources/Dinsical/upright-in-italic-dinsical.enc"
    done

    # Remove "Regular" from internal VF source name
    $SED -i "s/\\($f\\).Regular/\\1/" \
        "$BUILD/vfwork/$f/$f-Regular.ufo/fontinfo.plist"
done

# Nuke inconsistent anchors across all VF sources
$PYTHON "$TOOLSDIR/nuke-inconsistent-anchors.py" "$BUILD"/vfwork/*/*.ufo

# ---------------------------------------------------------------------------
# Variable font
# ---------------------------------------------------------------------------

# Write a build-local designspace with paths relative to .build/
python3 -c "
from pathlib import Path
build = Path('$BUILD')
src   = Path('$SRCDIR')
ds = (src / 'Dinsical-Variable.designspace').read_text()
# Remap build paths
ds = ds.replace('sources/vfwork/', 'vfwork/')
# Remap slant axis: upstream DINish uses -12, Dinsical targets -10 to match Dinsical
ds = ds.replace('minimum=\"-12\"', 'minimum=\"-10\"')
ds = ds.replace('uservalue=\"-12\"', 'uservalue=\"-10\"')
ds = ds.replace('xvalue=\"-12\"', 'xvalue=\"-10\"')
# Scale conditionset threshold proportionally: -3.5/12 * 10 = -2.9
ds = ds.replace('maximum=\"-3.5\"', 'maximum=\"-2.9\"')
(build / 'Dinsical-Variable.designspace').write_text(ds)
"

# Patch stylespace: remap slant stop from -12 to -10 to match copy-missing-italics.py
$SED 's/-12/-10/g' "$SRCDIR/Dinsical-Variable.stylespace" > "$BUILD/Dinsical-Variable.stylespace"

cd "$BUILD"
fontmake --flatten-components --overlaps-backend pathops \
    Dinsical-Variable.designspace -o variable

statmake --stylespace Dinsical-Variable.stylespace \
         --designspace Dinsical-Variable.designspace \
         variable_ttf/Dinsical-Variable-VF.ttf

out=variable_ttf/Dinsical-Variable-VF.ttf
res=$(gftools fix-nonhinting "$out" "$out.fix" 2>&1)
echo "$res" | grep -Ev '^$|prep-gasp\.ttf|^GASP|^PREP' | grep -v $'^\t' || true
mv "$out.fix" "$out"
rm -f variable_ttf/*prep-gasp.ttf

woff2_compress "$out"

mkdir -p "$SRCDIR/fonts/ttf" "$SRCDIR/fonts/woff2"
cp "$BUILD/variable_ttf/Dinsical-Variable-VF.ttf"   "$SRCDIR/fonts/ttf/Dinsical-Var.ttf"
cp "$BUILD/variable_ttf/Dinsical-Variable-VF.woff2"  "$SRCDIR/fonts/woff2/Dinsical-Var.woff2"

# ---------------------------------------------------------------------------
# Static masters — interpolated weights + italics
# ---------------------------------------------------------------------------
cd "$SRCDIR"

for weight in Light Regular Medium SemiBold Bold Heavy Black; do
    case $weight in Light) w=3;; Regular) w=4;; Medium) w=5;; SemiBold) w=6;; Bold) w=7;; Heavy) w=8;; Black) w=9;; esac
    $PYTHON "$TOOLSDIR/interpolate-font.py" \
        --dest="$BUILD/static/Dinsical/Dinsical-$weight.ufo" --weight=$w \
        "$BUILD/sources/Dinsical/Dinsical-Regular.ufo" \
        "$BUILD/sources/Dinsical/Dinsical-Bold.ufo"
done

# Fixup Black for static
for name in ordfeminine ordmasculine \
    zero.dnom one.dnom two.dnom three.dnom four.dnom \
    five.dnom six.dnom seven.dnom eight.dnom nine.dnom; do
    cp "$BUILD/static/Dinsical/Dinsical-Heavy.ufo/glyphs/$name.glif" \
       "$BUILD/static/Dinsical/Dinsical-Black.ufo/glyphs/"
done

# Italic static counterparts
for weight in Light Regular Medium SemiBold Bold Heavy Black; do
    [ "$weight" = "Regular" ] && stylename="Italic" || stylename="${weight}Italic"
    cp -r "$BUILD/static/Dinsical/Dinsical-$weight.ufo" \
          "$BUILD/static/Dinsical/Dinsical-$stylename.ufo"
    $PYTHON "$TOOLSDIR/copy-missing-italics.py" \
        --source "$BUILD/static/Dinsical/Dinsical-$weight.ufo" \
        --dest   "$BUILD/static/Dinsical/Dinsical-$stylename.ufo" \
        --uprights "$SRCDIR/sources/Dinsical/upright-in-italic-dinsical.enc" \
        --overwrite a=a.ss02
done

# ---------------------------------------------------------------------------
# Compile static fonts (TTF + OTF in parallel, then woff/woff2)
# ---------------------------------------------------------------------------
mkdir -p \
    "$SRCDIR/fonts/ttf" \
    "$SRCDIR/fonts/otf" \
    "$SRCDIR/fonts/woff" \
    "$SRCDIR/fonts/woff2"

for ufo in "$BUILD/static/Dinsical/"*.ufo; do
    name=$(basename "$ufo" .ufo)
    "$TOOLSDIR/process-font.sh" "$ufo" "$SRCDIR/fonts/ttf/$name.ttf" &
    "$TOOLSDIR/process-font.sh" "$ufo" "$SRCDIR/fonts/otf/$name.otf" &
done
wait

for ttf in "$SRCDIR/fonts/ttf/"Dinsical-[!V]*.ttf; do
    name=$(basename "$ttf" .ttf)
    "$TOOLSDIR/process-font.sh" "$ttf" "$SRCDIR/fonts/woff/$name.woff" &
    "$TOOLSDIR/process-font.sh" "$ttf" "$SRCDIR/fonts/woff2/$name.woff2" &
done
wait
