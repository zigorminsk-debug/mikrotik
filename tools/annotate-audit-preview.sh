#!/usr/bin/env bash
# Red arrows on the genuine Electron screenshot with a mocked fixture.
set -euo pipefail
cd "$(dirname "$0")/.."
src=docs/research/audit-preview-ui-mocked-ci.jpg
convert "$src" \
 -stroke white -strokewidth 9 -fill none -draw 'line 755,262 667,293' \
 -stroke '#d82020' -strokewidth 5 -draw 'line 755,262 667,293' \
 -stroke white -strokewidth 5 -fill white -draw 'polygon 667,293 683,279 687,295' \
 -stroke '#d82020' -strokewidth 2 -fill '#d82020' -draw 'polygon 667,293 683,279 687,295' \
 app/assets/img/own/audit-preview-ports-windows.png
convert "$src" \
 -stroke white -strokewidth 9 -fill none -draw 'line 544,429 435,407' \
 -stroke '#d82020' -strokewidth 5 -draw 'line 544,429 435,407' \
 -stroke white -strokewidth 5 -fill white -draw 'polygon 435,407 455,404 451,420' \
 -stroke '#d82020' -strokewidth 2 -fill '#d82020' -draw 'polygon 435,407 455,404 451,420' \
 app/assets/img/own/audit-preview-check-windows.png
