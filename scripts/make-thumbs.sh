#!/bin/zsh
# Card thumbnails: 800 px wide JPEGs of every image in public/img (macOS sips). Re-run after adding an image.
cd "$(dirname "$0")/../public/img" || exit 1
for f in *.(png|jpg|jpeg)(N); do
  out="thumb/${f%.*}.jpg"
  [[ -f $out && $out -nt $f ]] && continue
  sips -s format jpeg -s formatOptions 78 -Z 800 "$f" --out "$out" >/dev/null && echo "thumb $out"
done
