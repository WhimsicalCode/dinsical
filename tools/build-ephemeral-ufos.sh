#!/bin/bash
# Full build: interpolate all weights + generate italics + variable font +
# static fonts in all formats.  Results are synced back to fonts/.
#
# The build runs in a scratch directory (/tmp/dinsy-build) so the source
# tree stays clean.  The full source tree (including .git) is rsynced to
# scratch so that git commands work correctly there.
#
# Version string (release vs dev) is determined by tools/update-version.sh:
#   release — VERSION file matches a git tag, working tree clean
#   dev     — otherwise

set -e

SRCDIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH="${SCRATCH:-/tmp/dinsy-build}"
TOOLSDIR="$SRCDIR/tools"

# Prefer GNU sed
if command -v gsed >/dev/null 2>&1; then SED=gsed; else SED=sed; fi

# Python with required packages via uv
PYTHON="uv run --with fontparts --with xmltodict --with fonttools python"
NPROC="$(nproc 2>/dev/null || sysctl -n hw.logicalcpu 2>/dev/null || echo 4)"

# ---------------------------------------------------------------------------
# Set up scratch
# ---------------------------------------------------------------------------
mkdir -p "$SCRATCH"
rm -rf "$SCRATCH"/* "$SCRATCH"/.??* 2>/dev/null || true
rsync -raWH --delete "$SRCDIR"/./ "$SCRATCH"/./
cd "$SCRATCH"

# ---------------------------------------------------------------------------
# Version stamp
# ---------------------------------------------------------------------------
version=$(tools/update-version.sh)
echo "$version"

make clean 2>/dev/null || rm -rf fonts

# ---------------------------------------------------------------------------
# Sync features.fea from master to other UFOs
# ---------------------------------------------------------------------------
cd "$SCRATCH/sources"
masterdir=Dinsy/Dinsy-Regular.ufo
for s in Regular Bold; do
    dir=Dinsy/Dinsy-$s.ufo
    [ "$dir" != "$masterdir" ] && cp "$masterdir/features.fea" "$dir/"
done

# ---------------------------------------------------------------------------
# Generate VF masters (interpolated weights + italics)
# ---------------------------------------------------------------------------
mkdir -p "$SCRATCH/sources/vfwork/Dinsy"
cp -r Dinsy/Dinsy-Regular.ufo "$SCRATCH/sources/vfwork/Dinsy/"
cp -r Dinsy/Dinsy-Bold.ufo    "$SCRATCH/sources/vfwork/Dinsy/"

for weight in Light Heavy Black; do
    case $weight in
        Light) w=3 ;; Heavy) w=8 ;; Black) w=9 ;;
    esac
    $PYTHON "$TOOLSDIR/interpolate-font.py" \
        --dest="$SCRATCH/sources/vfwork/Dinsy/Dinsy-$weight.ufo" \
        --weight=$w \
        Dinsy/Dinsy-Regular.ufo Dinsy/Dinsy-Bold.ufo
done

# Fixup Black: copy ordfeminine/ordmasculine and dnom digits from Heavy
for name in ordfeminine ordmasculine \
    zero.dnom one.dnom two.dnom three.dnom four.dnom \
    five.dnom six.dnom seven.dnom eight.dnom nine.dnom; do
    cp "$SCRATCH/sources/vfwork/Dinsy/Dinsy-Heavy.ufo/glyphs/$name.glif" \
       "$SCRATCH/sources/vfwork/Dinsy/Dinsy-Black.ufo/glyphs/"
done

# Generate italic counterparts for VF
for weight in Light Regular Bold Black; do
    [ "$weight" = "Regular" ] && stylename="Italic" || stylename="${weight}Italic"
    cp -r "$SCRATCH/sources/vfwork/Dinsy/Dinsy-$weight.ufo" \
          "$SCRATCH/sources/vfwork/Dinsy/Dinsy-$stylename.ufo"
    $PYTHON "$TOOLSDIR/copy-missing-italics.py" \
        --source "$SCRATCH/sources/vfwork/Dinsy/Dinsy-$weight.ufo" \
        --dest   "$SCRATCH/sources/vfwork/Dinsy/Dinsy-$stylename.ufo" \
        --uprights "$SRCDIR/sources/Dinsy/upright-in-italic-dinsy.enc"
done

# ---------------------------------------------------------------------------
# Generate static masters (interpolated weights + italics)
# ---------------------------------------------------------------------------
cd "$SCRATCH/sources"

for weight in Light Medium SemiBold Heavy Black; do
    case $weight in
        Light)    w=3 ;; Medium)   w=5 ;; SemiBold) w=6 ;;
        Heavy)    w=8 ;; Black)    w=9 ;;
    esac
    $PYTHON "$TOOLSDIR/interpolate-font.py" \
        --dest="$SCRATCH/sources/Dinsy/Dinsy-$weight.ufo" \
        --weight=$w \
        Dinsy/Dinsy-Regular.ufo Dinsy/Dinsy-Bold.ufo
done

# Fixup Black for static
for name in ordfeminine ordmasculine \
    zero.dnom one.dnom two.dnom three.dnom four.dnom \
    five.dnom six.dnom seven.dnom eight.dnom nine.dnom; do
    cp "$SCRATCH/sources/Dinsy/Dinsy-Heavy.ufo/glyphs/$name.glif" \
       "$SCRATCH/sources/Dinsy/Dinsy-Black.ufo/glyphs/"
done

# Generate italic counterparts for statics
for weight in Light Regular Medium SemiBold Bold Heavy Black; do
    [ "$weight" = "Regular" ] && stylename="Italic" || stylename="${weight}Italic"
    cp -r "$SCRATCH/sources/Dinsy/Dinsy-$weight.ufo" \
          "$SCRATCH/sources/Dinsy/Dinsy-$stylename.ufo"
    $PYTHON "$TOOLSDIR/copy-missing-italics.py" \
        --source "$SCRATCH/sources/Dinsy/Dinsy-$weight.ufo" \
        --dest   "$SCRATCH/sources/Dinsy/Dinsy-$stylename.ufo" \
        --uprights "$SRCDIR/sources/Dinsy/upright-in-italic-dinsy.enc" \
        --overwrite a=a.ss02
done

# ---------------------------------------------------------------------------
# Variable font
# ---------------------------------------------------------------------------
cd "$SCRATCH"

# Remove "Regular" from internal VF source name
$SED -i 's/\(Dinsy\).Regular/\1/' \
    "$SCRATCH/sources/vfwork/Dinsy/Dinsy-Regular.ufo/fontinfo.plist"

# Nuke inconsistent anchors (known issue in source)
$PYTHON "$TOOLSDIR/nuke-inconsistent-anchors.py" \
    "$SCRATCH/sources/vfwork/Dinsy/Dinsy"*.ufo

fontmake --flatten-components --overlaps-backend pathops \
    Dinsy-Variable.designspace -o variable

statmake --stylespace Dinsy-Variable.stylespace \
         --designspace Dinsy-Variable.designspace \
         variable_ttf/Dinsy-Variable-VF.ttf

# Fix non-hinting
out=variable_ttf/Dinsy-Variable-VF.ttf
res=$(gftools fix-nonhinting "$out" "$out.fix" 2>&1)
echo "$res" | grep -Pv '(^$|prep-gasp\.ttf|^\t|^GASP|^PREP)' || true
mv "$out.fix" "$out"
rm -f variable_ttf/*prep-gasp.ttf

woff2_compress variable_ttf/Dinsy-Variable-VF.ttf

mkdir -p fonts/ttf/variable fonts/woff2/variable
cp variable_ttf/Dinsy-Variable-VF.ttf  "fonts/ttf/variable/Dinsy[slnt,wght].ttf"
cp variable_ttf/Dinsy-Variable-VF.woff2 "fonts/woff2/variable/Dinsy[slnt,wght].woff2"

# ---------------------------------------------------------------------------
# Static fonts
# ---------------------------------------------------------------------------
make -j"$NPROC" build

# ---------------------------------------------------------------------------
# Sync results back to source directory
# ---------------------------------------------------------------------------
rsync -raWH --exclude='.git' "$SCRATCH/fonts/" "$SRCDIR/fonts/"
