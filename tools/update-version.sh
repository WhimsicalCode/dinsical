#!/bin/sh
# Update fontinfo.plist for all Dinsy masters with the current version,
# git hash, and build timestamp.
#
# Version is read from the VERSION file (e.g. "1.001").
# The openTypeNameVersion string is set to:
#   "Version 1.001; git-<hash>-release"  — when working tree is clean
#   "Version 1.001; git-<hash>-dev"      — when there are uncommitted changes
#
# tools/ and fonts/ changes are excluded from the modified-file count
# (they are auto-generated and shouldn't affect release status).

# Prefer GNU sed (required for in-place on macOS)
if command -v gsed >/dev/null 2>&1; then
    SED=gsed
else
    SED=sed
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

version=$(cat "$ROOT/VERSION")
major="${version%%.*}"
minor_raw="${version##*.}"
# Strip leading zeros so printf doesn't treat as octal
minor=$(printf "%d" "0${minor_raw}" 2>/dev/null || echo "$minor_raw")

hash=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Count modified tracked files, ignoring tools/ and fonts/
# GIT_OPTIONAL_LOCKS=0 prevents git status from acquiring an index lock,
# which would conflict with any concurrent git process (e.g. uv, release.py).
modified=$(GIT_OPTIONAL_LOCKS=0 git -C "$ROOT" status -s -uno 2>/dev/null \
    | grep -Ev '^\s*..\s+(tools|fonts)/' \
    | wc -l \
    | tr -d ' ')

if [ "$modified" = "0" ]; then
    status=release
else
    status=dev
fi

versionstr="Version $version; git-$hash-$status"
now=$(date +'%Y/%m/%d %H:%M:%S')

echo "$versionstr"

# BUILD_SOURCES lets the build script stamp a build-dir copy instead of the
# real sources, keeping the working tree clean.
SOURCES_DIR="${BUILD_SOURCES:-$ROOT/sources}"

for ufo in "$SOURCES_DIR"/Dinsy/Dinsy*.ufo; do
    $SED -i \
        -e "/versionMajor/,+1s/>[0-9]*</>$major</" \
        -e "/versionMinor/,+1s/>[0-9]*</>$minor</" \
        -e "/openTypeHeadCreated/,+1s#>[0-9].*<#>$now<#" \
        -e "/openTypeNameVersion/,+1s/>Version [^<]*</>$versionstr</" \
        "$ufo/fontinfo.plist"
done
