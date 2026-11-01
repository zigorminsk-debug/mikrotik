#!/usr/bin/env bash
# Disposable Android emulator: real release WebView and native touch input.
set -euo pipefail
: "${ANDROID_FONT_APK:?}" "${RUNNER_TEMP:?}"
xml="$RUNNER_TEMP/font-ui.xml"
# This emulator uses a fresh disposable app profile; expose its accessibility
# hierarchy only on failure to diagnose coordinates, never user data.
trap 'status=$?; if (( status != 0 )); then adb exec-out screencap -p > "$RUNNER_TEMP/android-font-failure.png" 2>/dev/null || true; fi; if (( status != 0 )) && [[ -s "$xml" ]]; then python3 - "$xml" <<'PYDUMP'
import sys
s=open(sys.argv[1],encoding="utf-8",errors="replace").read()
print("::notice title=Android disposable UI::"+s[:20000].replace("%","%25").replace("\r","").replace("\n","%0A"))
PYDUMP
fi' EXIT
adb wait-for-device
adb install -r "$ANDROID_FONT_APK"
adb shell wm size 320x640
adb shell wm density 160
adb shell am start -n by.mikrotik.tutor/.MainActivity >/dev/null
sleep 12
snapshot() { adb shell uiautomator dump /sdcard/font-ui.xml >/dev/null; adb exec-out cat /sdcard/font-ui.xml > "$xml"; }
coords() { python3 - "$xml" "$1" <<'PY'
import re,sys,xml.etree.ElementTree as E
try: root=E.parse(sys.argv[1]).getroot()
except E.ParseError: sys.exit(1)
needle=sys.argv[2]
for n in root.iter():
    if needle not in (n.get('text','')+' '+n.get('content-desc','')): continue
    m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',n.get('bounds',''))
    if not m: continue
    x,y,x2,y2=map(int,m.groups())
    if 0 <= x < x2 <= 320 and 0 <= y < y2 <= 640:
        print((x+x2)//2,(y+y2)//2);sys.exit(0)
sys.exit(1)
PY
}
tap() { snapshot; local xy; xy=$(coords "$1") || { echo "::error title=Android font test::Control not reachable: $1"; exit 1; }; adb shell input tap $xy; sleep 1; }
# UIAutomator may initially expose just the WebView while Chromium starts or
# while its accessibility tree is being enabled. Wait for the actual button.
ready=0
for attempt in $(seq 1 20); do
 snapshot
 if coords 'Увеличить шрифт' >/dev/null; then ready=1; break; fi
 sleep 3
done
if [[ $ready != 1 ]]; then echo '::error::Android WebView accessibility tree did not become ready'; exit 1; fi
for i in 1 2 3; do tap 'Увеличить шрифт'; done
snapshot; coords '150%' >/dev/null || { echo '::error::Font level 150% not visible'; exit 1; }
tap 'Открыть меню'
# Scroll inside the actual sidebar to its last item, not the content behind it.
for i in 1 2 3 4 5 6; do
 snapshot
 if coords 'О программе' >/dev/null; then break; fi
 adb shell input swipe 150 535 150 220 450
 sleep 1
done
adb exec-out screencap -p > "$RUNNER_TEMP/android-font-menu.png"
tap 'О программе'
adb exec-out screencap -p > "$RUNNER_TEMP/android-font-about.png"
snapshot; coords 'О программе' >/dev/null || { echo '::error::About page not reachable'; exit 1; }
adb shell am force-stop by.mikrotik.tutor
adb shell am start -n by.mikrotik.tutor/.MainActivity >/dev/null
sleep 8
snapshot; coords '150%' >/dev/null || { echo '::error::Font setting did not survive restart'; exit 1; }
tap 'Уменьшить шрифт'
snapshot; coords '130%' >/dev/null || { echo '::error::Font reduction not reachable'; exit 1; }
echo '::notice title=Android text size::On a disposable 320x640 emulator, the real release WebView reached 150%, opened and scrolled the menu to About, persisted across restart, and reduced to 130%. No physical phone tested.'
