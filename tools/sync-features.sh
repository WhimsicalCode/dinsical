#!/bin/sh
# Dinsy-Regular.ufo/features.fea is the master.
# Synchronise it to all other masters so they stay in step.

set -e
cd sources

masterdir=Dinsy/Dinsy-Regular.ufo
for s in Regular Bold; do
    dir=Dinsy/Dinsy-$s.ufo
    if [ "$dir" != "$masterdir" ]; then
        if ! cmp -s "$masterdir/features.fea" "$dir/features.fea"; then
            echo "Synchronising $dir/features.fea"
            cp "$masterdir/features.fea" "$dir/"
        fi
    fi
done
