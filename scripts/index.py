#!/usr/bin/env python3
#
# Create an JSON index of the available syscall tables given a root "database"
# directory.
#
# We expect a directory structure as follows:
#
#   <db-root>/<arch>/<abi>/<kernel-version-tag>/...
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
#           "<abi>": {
#               "<kernel-version-tag>": {
#                   "config": true/false,
#                   "stderr": true/false
#               }
#           }
#       }
#   }
#
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
		arch = archdir.name
		index[arch] = arch_index = {}

		for abidir in archdir.iterdir():
			abi = abidir.name
			arch_index[abi] = abi_index = {}

			for tagdir in abidir.iterdir():
				tag = tagdir.name
				abi_index[tag] = {'config': True, 'stderr': True}
				files = os.listdir(tagdir)

				if 'config.txt' not in files:
					eprint(f'No config for {arch}/{abi}/{tag}')
					abi_index[tag]['config'] = False

				if 'stderr.txt' not in files:
					eprint(f'No config for {arch}/{abi}/{tag}')
					abi_index[tag]['stderr'] = False

				if 'table.json' not in files:
					eprint(f'No table for {arch}/{abi}/{tag}')
					eprint("Something's not right... aborting!")
					return 1

				tablefile = tagdir / 'table.json'

				# Sanity check: make sure abi and arch match the ones in
				# table.json. This is not ideal, as we are opening and reading
				# every single file... but it's ok for now. One day we might
				# have to come up with a better "database" than a bunch of JSON
				# files anyway.
				with tablefile.open() as f:
					data = load(f)['kernel']['architecture']
					actual_arch = data['name']
					actual_abi = data['abi']

					if arch != actual_arch or abi != actual_abi:
						eprint(f'Mismatched arch/abi in {tablefile}!')
						eprint(f'Expected {arch}/{abi}, but have {actual_arch}/{actual_abi} inside the file.')
						eprint("Something's not right... aborting!")
						return 1

	dump(index, sys.stdout, separators=(',', ':'))

if __name__ == '__main__':
	sys.exit(main(sys.argv))
