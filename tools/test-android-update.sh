#!/usr/bin/env bash
# CI-only: real Android WebView in an emulator, previous release installed.
# Verifies discovery and adb upgrade, not a user browser/system installation dialog.
set -euo pipefail
: "${OLD_APK:?}" "${NEW_APK:?}" "${TARGET_TAG:?}" "${RUNNER_TEMP:?}"
version="${TARGET_TAG#v}"
adb wait-for-device
adb install -r "$OLD_APK"
adb shell am start -n by.mikrotik.tutor/.MainActivity
xml="$RUNNER_TEMP/android-update.xml"
# The startup check can already open the dialog. Otherwise click the real UI.
for attempt in $(seq 1 24); do
  sleep 3
  adb shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || continue
  adb exec-out cat /sdcard/window.xml > "$xml" || continue
  if python3 - "$xml" "$version" <<'PY'
import sys, xml.etree.ElementTree as ET
try: root=ET.parse(sys.argv[1]).getroot()
except Exception: sys.exit(1)
text=' '.join((n.attrib.get('text','')+' '+n.attrib.get('content-desc','')) for n in root.iter())
sys.exit(0 if ('Доступна версия ' + sys.argv[2]) in text and 'Скачать APK' in text else 1)
PY
  then
    echo "Previous signed release found published $TARGET_TAG and offered an APK in the real emulator WebView."
    # adb bypasses Android's interactive installer, but rejects a different
    # package/signature or an incompatible versionCode during a real upgrade.
    adb install -r "$NEW_APK"
    adb shell dumpsys package by.mikrotik.tutor | grep -F "versionName=$version"
    echo "::notice title=Android upgrade::Published APK was discovered and installed over the previous release by adb. Browser download and system UI not tested."
    exit 0
  fi
  coordinates=$(python3 - "$xml" <<'PY'
import re,sys,xml.etree.ElementTree as ET
try: root=ET.parse(sys.argv[1]).getroot()
except Exception: sys.exit(0)
for n in root.iter():
 text=n.attrib.get('text','')+' '+n.attrib.get('content-desc','')
 if 'Обновить' not in text: continue
 m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',n.attrib.get('bounds',''))
 if m:
  x1,y1,x2,y2=map(int,m.groups())
  if x2>x1 and y2>y1: print((x1+x2)//2,(y1+y2)//2); break
PY
  )
  if [[ -n "$coordinates" ]]; then adb shell input tap $coordinates; fi
done
echo '::error title=Android update discovery::The previous APK did not offer the new published APK in the emulator. Inspect the UI hierarchy artifact and networking.'
if [[ -s "$xml" ]]; then
  # No user data: this is a disposable emulator with a synthetic test profile.
  python3 - "$xml" <<'PY'
import sys
s=open(sys.argv[1],encoding='utf-8',errors='replace').read()
print('::notice title=Android test UI::'+s[:10000].replace('%','%25').replace('\r','').replace('\n','%0A'))
PY
fi
exit 1
