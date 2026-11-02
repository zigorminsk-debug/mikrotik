#!/usr/bin/env bash
# Generate static tutorial annotations from original disposable WinBox captures.
# Arrows are instructional overlays, not actual cursor position or proof of a click.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v convert >/dev/null || { echo 'ImageMagick convert required' >&2; exit 1; }
list='docs/research/winbox-scheme-addresses-ci.jpg'
detail='docs/research/winbox-unique-address-ocr-ci.jpg'
out='app/assets/img/own'
# White halo improves contrast. The arrowhead stops outside text and controls.
arrow() {
  local src=$1 file=$2 line=$3 head=$4
  convert "$src" -stroke white -strokewidth 9 -fill none -draw "line $line" \
    -stroke '#d82020' -strokewidth 5 -draw "line $line" \
    -stroke white -strokewidth 5 -fill white -draw "polygon $head" \
    -stroke '#d82020' -strokewidth 2 -fill '#d82020' -draw "polygon $head" "$out/$file"
}
# Addresses → New (location of the control, before opening a dialog).
arrow "$list" 'winbox-address-example-new.png' '246,115 350,176' '350,176 329,171 338,155'
# Addresses → existing test LAN row (open the example record by double-click).
arrow "$list" 'winbox-address-example-row.png' '240,253 403,250' '403,250 385,240 385,260'
# Detail → Address; arrow points to the label, not over the example value.
arrow "$detail" 'winbox-address-example-address.png' '235,340 428,360' '428,360 410,348 408,368'
# Detail → Interface; arrow points to the label, not over the example value.
arrow "$detail" 'winbox-address-example-interface.png' '235,432 428,411' '428,411 409,403 411,423'
# Detail → OK; this shows button location only, not an actual click or save.
arrow "$detail" 'winbox-address-example-ok.png' '895,515 757,476' '757,476 779,473 773,491'
