#!/bin/sh

in="$1"
out="$2"
outtype="`echo $out | sed -e 's/.*\.//'`"

die() {
	echo "$@"
	exit 1
}

case "$outtype" in
	woff|woff2)
		case "$in" in
			*.ttf)
				in_ttf="$in"
				;;
			*)
				fontmake --flatten-components --verbose WARNING --overlaps-backend pathops --ufo-paths $in -o ttf --output-path $out.ttf
				[ "$?" = "0" ] || die "fontmake failed"
				in_ttf="$out.ttf"
				;;
		esac
		uv run --with fonttools --with brotli python -c "from fontTools.ttLib import TTFont; f = TTFont('$in_ttf');f.flavor='$outtype';f.save('$out')"
		[ "$?" = "0" ] || die "conversion to $outtype failed"
		if [ "$in_ttf" != "$out.ttf" ]; then
			rm -f $out.ttf
		fi
		exit 0;;
esac

fontmake --flatten-components --verbose WARNING --overlaps-backend pathops --ufo-paths $in -o $outtype --output-path $out
[ "$?" = "0" ] || die "fontmake failed"

case "$out" in
	*.ttf)
		tmpout="tmp-$$.ttf"
		ttfautohint $out $tmpout
		mv $tmpout $out

		res="`gftools fix-hinting $out 2>&1`"
		rv=$?
		echo "$res" | grep -Ev '(^$|Saving.* to .*.fix$)' || true
		[ "$rv" = "0" ] || die "gftools fix-hinting failed"
		mv $out.fix $out

		;;
esac
