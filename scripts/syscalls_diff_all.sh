#!/bin/bash
#
# Diff syscall tables between two versions on all arch/bits/abi combinations
# present in the db/.
#
# Usage: ./scripts/syscalls_diff_all.sh v6.0 v6.10
#

if ! [ -d db ]; then
	echo "No db/ directory found, invoke this from the root of the repo!" >&2
	exit 1
fi

if [ $# -ne 2 ]; then
	echo "Usage $0 TAG1 TAG2" >&2
	exit 1
fi

for arch in $(ls db); do
	for bits in $(ls db/"$arch"); do
		for abi in $(ls db/"$arch"/"$bits"); do
			combo="$arch"/"$bits"/"$abi"
			printf "\x1b[33m---[$combo]"
			printf '%*s' $((50 - ${#combo})) '' | tr ' ' -
			printf '\x1b[0m\n'
			scripts/syscalls_diff.py db/"$combo"/{"$1","$2"}/table.json
		done
	done
done
