#!/usr/bin/env bash
# Static tutorial overlays; arrows are added after capture and do not prove clicks.
set -euo pipefail
cd "$(dirname "$0")/.."
src=docs/research/switch-menu-chr-ci.jpg
out=app/assets/img/own
arrow() {
  local file=$1 line=$2 head=$3
  convert "$src" -stroke white -strokewidth 9 -fill none -draw "line $line" \
    -stroke '#d82020' -strokewidth 5 -draw "line $line" \
    -stroke white -strokewidth 5 -fill white -draw "polygon $head" \
    -stroke '#d82020' -strokewidth 2 -fill '#d82020' -draw "polygon $head" "$out/$file"
}
arrow switch-example-menu.png '360,400 240,301' '240,301 263,306 251,321'
arrow switch-example-host.png '460,280 316,302' '316,302 336,290 339,309'
arrow switch-example-vlan.png '460,360 316,326' '316,326 339,322 334,341'
