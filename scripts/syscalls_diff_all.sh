#!/bin/bash

if [ $# -ne 2 ]; then
	echo "Usage $0 TAG1 TAG2" >&2
	exit 1
fi

# do_one arch/bits/abi TAG1 TAG2
do_one() {
	scripts/syscalls_diff.py db/"$1"/{"$2","$3"}/table.json
}

ARCHS=(
	x86/64/x64
	x86/64/x32
	x86/64/ia32

	x86/32/ia32

	arm64/64/aarch64
	arm64/64/aarch32

	arm/32/eabi
	arm/32/oabi

	mips/32/o32

	mips/64/n64
	mips/64/n32
	mips/64/o32

	powerpc/64/ppc64
	powerpc/64/ppc32
	powerpc/64/spu

	powerpc/32/ppc32
)

for a in "${ARCHS[@]}"; do
	printf "\x1b[33m---[$a]"
	printf '%*s' $((50 - ${#a})) '' | tr ' ' -
	printf '\x1b[0m\n'
	do_one "$a" "$1" "$2"
done
