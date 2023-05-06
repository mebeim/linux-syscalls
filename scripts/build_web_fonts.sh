#!/bin/bash
#
# Download Google's Noto Color Emoji font and extract the glyphs we need. I
# don't really want a full 10MB font to only use a handful of glyphs.
#

set -e

if ! [ -x ./scripts/build_web_fonts.sh ]; then
	echo 'This font must be executed from the repository root!' >&2
	exit 1
fi

tmp_font_file=$(mktemp /tmp/XXXXXXXXXXXXXXXX.ttf)
tmp_list_file=$(mktemp /tmp/XXXXXXXXXXXXXXXX.txt)

output_dir=./www/fonts
output_file="$output_dir"/NotoColorEmoji.subset.woff2

cat >"$tmp_list_file" <<EOF
20    # ASCII space
26a0  # warning sign
2b06  # arrow up
2b07  # arrow down
1f9ea # test tube
EOF

wget -q 'https://github.com/googlefonts/noto-emoji/raw/main/fonts/NotoColorEmoji.ttf' -O "$tmp_font_file"
mkdir -p "$output_dir"
pyftsubset "$tmp_font_file" \
	--unicodes-file="$tmp_list_file" \
	--flavor=woff2 \
	--output-file="$output_file"

rm -f "$tmp_font_file" "$tmp_list_file"
