#!/usr/bin/env python3
#
# Create an JSON index of the available syscall tables given a root "database"
# directory.
#
# We expect a directory structure as follows:
#
#   <root>/<arch>/<bits>/<abi>/<kernel-version-tag>/...
#
# Inside each directory we have:
#
#   config.txt: the config the kernel was built with
#   stderr.txt: Systrack standard error collected when analyzing the kernel
#   table.json: Systrack output in JSON format
#
# The JSON index we are going to build will have the following structure:
#
#   {
#       "<arch>": {
#           "<bits>": {
#               "<abi>": {
#                   "<kernel-version-tag>": {
#                       "config": true/false,
#                       "stderr": true/false
#                   }
#               }
#           }
#       }
#   }
#

import os
import sys
from json import load, dump
from pathlib import Path

def eprint(*a, **kwa):
	print(*a, **kwa, file=sys.stderr, flush=True)

def main(args) -> int:
	if len(args) != 2:
		eprint('Usage:', args[0], 'DB_ROOT')
		return 1

	index = {}
	rootdir = Path(args[1])

	if not rootdir.is_dir():
		eprint(f'{rootdir} is not a directory!')
		return 1

	for archdir in rootdir.iterdir():
		# Skip the special case of already having the index in the DB
		if archdir.name == 'index.json':
			continue

		arch = archdir.name
		index[arch] = arch_index = {}

		for bitsdir in archdir.iterdir():
			bits = bitsdir.name
			arch_index[bits] = bits_index = {}

			for abidir in bitsdir.iterdir():
				abi = abidir.name
				bits_index[abi] = abi_index = {}

				for tagdir in abidir.iterdir():
					tag = tagdir.name
					abi_index[tag] = {'config': True, 'stderr': True}
					files = os.listdir(tagdir)

					if 'config.txt' not in files:
						eprint(f'Warning: no config for {arch}/{bits}/{abi}/{tag}')
						abi_index[tag]['config'] = False

					if 'stderr.txt' not in files:
						eprint(f'Warning: no stderr log for {arch}/{bits}/{abi}/{tag}')
						abi_index[tag]['stderr'] = False

					if 'table.json' not in files:
						eprint(f'No table for {arch}/{bits}/{abi}/{tag}')
						eprint("Something's not right... aborting!")
						return 1

					tablefile = tagdir / 'table.json'

					# Sanity check: make sure arch, bits and abi match the ones
					# in "table.json". This is not ideal, as we are opening and
					# reading every single file... but it's ok for now. One day
					# we might have to come up with a better "database" than a
					# bunch of JSON files though.
					with tablefile.open() as f:
						data = load(f)['kernel']['architecture']
						want = (arch, int(bits), abi)
						have = (data['name'], data['bits'], data['abi'])

						for what, w, h in zip(('arch', 'bits', 'abi'), want, have):
							if w != h:
								eprint(f'Mismatched {what} for {tablefile}')
								eprint(f'Expected {w}, but have {h} inside the file.')
								eprint("Something's not right... aborting!")
								return 1

	dump(index, sys.stdout, separators=(',', ':'))

if __name__ == '__main__':
	sys.exit(main(sys.argv))
