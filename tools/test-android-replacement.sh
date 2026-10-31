#!/usr/bin/env bash
# CI only, both files are public APKs; no user device or data involved.
set -euo pipefail
: "${OLD_APK:?}" "${NEW_APK:?}" "${ANDROID_HOME:?}"
AAPT="$ANDROID_HOME/build-tools/34.0.0/aapt"
SIGN="$ANDROID_HOME/build-tools/34.0.0/apksigner"
old_badging=$($AAPT dump badging "$OLD_APK"); old_info=${old_badging%%$'\n'*}
new_badging=$($AAPT dump badging "$NEW_APK"); new_info=${new_badging%%$'\n'*}
field() { sed -n "s/.*[[:space:]]$1='\([^']*\)'.*/\1/p" <<<"$2"; }
old_pkg=$(field name "$old_info");new_pkg=$(field name "$new_info")
old_code=$(field versionCode "$old_info");new_code=$(field versionCode "$new_info")
old_sign=$($SIGN verify --print-certs "$OLD_APK")
new_sign=$($SIGN verify --print-certs "$NEW_APK")
[[ "$old_sign" != *"Signer #2"* && "$new_sign" != *"Signer #2"* ]] || { echo '::error::Multiple APK signers are not supported by this test'; exit 1; }
old_sig=$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' <<<"$old_sign" | tr '[:upper:]' '[:lower:]')
new_sig=$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' <<<"$new_sign" | tr '[:upper:]' '[:lower:]')
echo "Package IDs: old=$old_pkg, new=$new_pkg"
[[ "$old_pkg" == 'by.mikrotik.tutor' && "$new_pkg" == "$old_pkg" ]] || { echo '::error::Package IDs differ'; exit 1; }
[[ "$old_code" =~ ^[0-9]+$ && "$new_code" =~ ^[0-9]+$ && "$new_code" -gt "$old_code" ]] || { echo '::error::Android versionCode does not permit an update'; exit 1; }
[[ "$old_sig" =~ ^[0-9a-f]{64}$ && "$old_sig" == "$new_sig" ]] || { echo '::error::APK signing certificates differ'; exit 1; }
echo "APK compatibility metadata: package=$old_pkg, codes $old_code -> $new_code, signing certificate matched."
adb wait-for-device
adb install "$OLD_APK"
adb install -r "$NEW_APK"
dump=$(adb shell dumpsys package "$new_pkg" | tr -d '\r')
installed=$(sed -n 's/.*\(versionCode=[0-9]*\).*/\1/p' <<<"$dump")
[[ "$installed" == "versionCode=$new_code" ]] || { echo '::error::Unexpected installed versionCode'; exit 1; }
echo '::notice title=Android replacement::On a disposable emulator, the selected 1.20.1 APK was replaced by 1.19.2 through adb. This does not test automatic update discovery, browser download, user data or installation UI.'
