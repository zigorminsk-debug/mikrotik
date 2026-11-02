#!/usr/bin/env bash
# Overlay only: CI Electron UI with mock confirmation and collector.
set -euo pipefail
cd "$(dirname "$0")/.."
convert docs/research/audit-ip-ui-mocked-ci.jpg \
 -stroke white -strokewidth 9 -fill none -draw 'line 530,322 432,293' \
 -stroke '#d82020' -strokewidth 5 -draw 'line 530,322 432,293' \
 -stroke white -strokewidth 5 -fill white -draw 'polygon 432,293 451,289 445,306' \
 -stroke '#d82020' -strokewidth 2 -fill '#d82020' -draw 'polygon 432,293 451,289 445,306' \
 app/assets/img/own/audit-ip-button-windows.png
