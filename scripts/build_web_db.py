#!/usr/bin/env python3
#
# This scipt will build a DB that is ready for deployment under www/. It will:
#
# - Recursively copy the db/ directory into www/
# - Minify all table.json files in the db to save space
# - Build a JSON index of available archs/ABIs/kernel versions
#
# We expect a DB directory structure as follows:
#
#   db/<arch>/<bits>/<abi>/<kernel-version-tag>/...
#
# Inside each <kernel-version-tag> directory we expect:
#
#   config.txt: (optional) the config the kernel was built with
#   stderr.txt: (optional) Systrack analysis standard error output
#   table.json: Systrack analysis output in JSON format
#
# The JSON index will be created at www/db/index.json and will have the
# following structure:
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
from pathlib import Path
from json import load, dump
from shutil import copytree, rmtree

def eprint(*a, **kwa):
	print(*a, **kwa, file=sys.stderr, flush=True)

def abort():
	eprint("Something's not right... aborting!")
	rmtree('www/db', ignore_errors=True)
	sys.exit(1)

def sorted_tags(tags):
	return sorted(tags, key=lambda t: tuple(map(int, t[1:].split('.'))))

def main() -> int:
	if not Path('scripts/build_web_db.py').is_file():
		eprint('This script must be executed from the repository root!')
		return 1

	index = {}
	origdir = Path('db')
	rootdir = Path('www/db')

	# NOTE: dir_exist_ok= is Python 3.8+
	copytree(origdir, rootdir, dirs_exist_ok=True)

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
						abort()

					tablefile = tagdir / 'table.json'

					with tablefile.open() as f:
						# Sanity check: make sure arch, bits and abi match the
						# ones in "table.json".
						data = load(f)
						kern = data['kernel']
						want = (arch, int(bits), abi)
						have = (kern['architecture']['name'], kern['architecture']['bits'], kern['abi']['name'])

						for what, w, h in zip(('arch', 'bits', 'abi'), want, have):
							if w != h:
								eprint(f'Mismatched {what} for {tablefile}')
								eprint(f'Expected {w}, but have {h} inside the file.')
								abort()

					# Overwrite original with minified version
					with tablefile.open('w') as f:
						dump(data, f, sort_keys=True, separators=(',', ':'))

	with (rootdir / 'index.json').open('w') as f:
		dump(index, f, sort_keys=True, separators=(',', ':'))

	# Pretty-print short summary
	for arch, arch_index in index.items():
		for bits, bits_index in arch_index.items():
			for abi, abi_index in bits_index.items():
				print(f'{arch}/{bits}/{abi}:', end='')

				prev = 'vX'
				for tag in sorted_tags(abi_index):
					major = tag[:tag.find('.')]
					if major != prev:
						prev = major
						print('\n\t', end='')

					print(tag, end=' ')

				print()

	return 0

if __name__ == '__main__':
	sys.exit(main())
