#!/bin/sh
# tools/blender/tuft.sh: renders Grandfather Tuft's 16 talking frames in Blender and tiles them into assets/tuft.png
# (8 x 2 frames of 256 px, transparent). Needs Blender and ffmpeg.   sh tools/blender/tuft.sh
set -e
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
"${BLENDER:-/opt/homebrew/bin/blender}" --background --python tools/blender/tuft.py -- "$tmp" > /dev/null
ffmpeg -y -v error -start_number 0 -i "$tmp/f%02d.png" -vf "scale=256:256,tile=8x2" -frames:v 1 assets/tuft.png
rm -rf "$tmp"
ls -la assets/tuft.png
cwebp -quiet -q 92 -alpha_q 100 -m 6 assets/tuft.png -o assets/tuft.webp   # the game loads the WebP (a fifth of the size)
