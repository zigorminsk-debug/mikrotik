#!/usr/bin/env bash
# Static overlay on a CI-only mocked Windows UI. Does not depict running VMs.
set -euo pipefail
cd "$(dirname "$0")/.."
convert docs/research/lab-matrix-ui-mocked-ci.jpg \
 -stroke white -strokewidth 9 -fill none -draw 'line 462,487 451,420' \
 -stroke '#d82020' -strokewidth 5 -draw 'line 462,487 451,420' \
 -stroke white -strokewidth 5 -fill white -draw 'polygon 451,420 442,438 462,434' \
 -stroke '#d82020' -strokewidth 2 -fill '#d82020' -draw 'polygon 451,420 442,438 462,434' \
 app/assets/img/own/lab-matrix-button-windows.png
