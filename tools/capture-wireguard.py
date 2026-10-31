#!/usr/bin/python3
"""One-off isolated CHR boot and WinBox capture on GitHub-hosted Linux.

Nothing here accesses a real router or user credentials. The example password is used
only by the disposable VM; the temporary disk image is never committed or published.
"""
import os
import pathlib
import subprocess
import sys
import time
import pexpect

base = pathlib.Path(sys.argv[1])
out = base / 'output'
out.mkdir(parents=True, exist_ok=True)
images = list(base.glob('*.img'))
if len(images) != 1:
    raise SystemExit('Expected exactly one official CHR .img image')
password = 'Temporary-Lab-Only-42!'
args = [
    '-machine', 'pc,accel=tcg', '-m', '256', '-smp', '2', '-nographic',
    '-drive', f'file={images[0]},format=raw,if=ide',
    '-netdev', 'user,id=net0,hostfwd=tcp:127.0.0.1:18291-:8291',
    '-device', 'e1000,netdev=net0',
    # Extra isolated test interfaces; no real ISP or credentials.
    '-netdev', 'user,id=net1', '-device', 'e1000,netdev=net1',
    '-netdev', 'user,id=net2', '-device', 'e1000,netdev=net2',
]
vm = pexpect.spawn('qemu-system-x86_64', args, encoding='utf-8', timeout=180, dimensions=(50, 160), echo=False)
def settle():
    # RouterOS redraws serial prompts. Consume duplicate display updates before
    # replying, otherwise a stale prompt can be mistaken for the next question.
    while True:
        try:
            vm.read_nonblocking(size=65536, timeout=1)
        except pexpect.TIMEOUT:
            return

try:
    with (out / 'serial.log').open('w') as log:
        vm.logfile_read = log
        # A serial console is attached only to the throwaway VM.
        vm.expect(r'(?i)login:')
        vm.sendline('admin')
        vm.expect(r'(?i)password:')
        vm.sendline('')
        for _ in range(12):
            n = vm.expect([r'(?i)do you want to see the software license',
                           r'(?i)(?:new password|repeat new password)[^\r\n]*[>:]',
                           r'(?i)press (?:enter|return)', r'\[admin@[^\]]+\]\s*>',
                           r'(?i)password:'])
            settle()
            if n == 0:
                vm.sendline('n')
            elif n in (1, 4):
                vm.sendline(password)
            elif n == 2:
                vm.sendline('')
            else:
                break
        else:
            raise RuntimeError('RouterOS did not reach a command prompt')
        # QEMU's user-mode network uses 10.0.2.0/24. Keep services bound to
        # the runner's localhost via hostfwd, never to a public interface.
        for command in [':if ([:len [/ip address find where address="10.0.2.15/24"]] = 0) do={/ip address add address=10.0.2.15/24 interface=ether1}',
                        '/ip service enable winbox',
                        '/interface pppoe-client add name=pppoe-out2 interface=ether3 user=example-user password=example-password add-default-route=yes default-route-distance=2 use-peer-dns=no disabled=yes',
                        '/interface list add name=WAN',
                        '/interface list member add list=WAN interface=pppoe-out2',
                        '/interface wireguard add name=wg-lab listen-port=13231',
                        '/ip address add address=10.10.10.1/24 interface=wg-lab',
                        '/system resource print']:
            vm.sendline(command)
            vm.expect(r'\[admin@[^\]]+\]\s*>')
            output = vm.before.lower()
            settle()
            if 'failure:' in output or 'expected end of command' in output or 'bad command name' in output:
                raise RuntimeError('RouterOS rejected test configuration: ' + command)
        vm.logfile_read = None
    binaries = [p for p in (base / 'winbox').rglob('*') if p.is_file() and p.name.lower() in ('winbox', 'winbox.exe')]
    if not binaries:
        raise RuntimeError('No WinBox executable in official archive')
    winbox = binaries[0]
    winbox.chmod(winbox.stat().st_mode | 0o111)
    # WinBox 4 accepts connect-to, user and password as positional arguments.
    # Capture the unedited display, including the target version and CHR identity.
    script = '''set -eu
"$1" 127.0.0.1:18291 admin "$2" >"$3/winbox.log" 2>&1 &
pid=$!
# Do not treat a login screen or failed authentication as a connected GUI.
# CHR can be slow under software emulation. Require authentication and session startup logs. The test PPPoE stays disabled.
ready=0
for attempt in $(seq 1 12); do
  sleep 15
  rm -f "$3/winbox.png"
  scrot "$3/winbox.png"
  if grep -q 'Auth OK' "$3/winbox.log" && grep -q 'WBOXSESS,INFO: first clock synced' "$3/winbox.log" && kill -0 "$pid" 2>/dev/null; then ready=1; break; fi
  # A QEMU/slirp connection may close during startup. Reopen WinBox instead
  # of waiting indefinitely on an error dialog; keep the check fail-closed.
  if grep -q 'RemoteHostClosedError' "$3/winbox.log" || ! kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    "$1" 127.0.0.1:18291 admin "$2" >"$3/winbox.log" 2>&1 &
    pid=$!
  fi
done
if [ "$ready" -ne 1 ]; then
  echo 'WinBox did not reach a verifiable CHR workspace' >>"$3/winbox.log"
  kill "$pid" 2>/dev/null || true
  exit 1
fi
# Focus the real Qt window before opening Interfaces; there is no window manager in Xvfb.
# The captured image still needs human inspection; a window title is not proof
# that any particular dialog opened.
win=$(xdotool search --onlyvisible --pid "$pid" | head -n 1)
xdotool windowfocus --sync "$win"
# Open the WireGuard list in WinBox 4. A human must verify the screenshot.
xdotool mousemove --sync 180 228
xdotool click 1
sleep 8
rm -f "$3/winbox.png"
scrot "$3/winbox.png"
scrot -q 45 "$3/wireguard.jpg"
kill "$pid" 2>/dev/null || true
'''
    env = os.environ.copy()
    env['QT_X11_NO_MITSHM'] = '1'
    subprocess.run(['xvfb-run', '-a', '-s', '-screen 0 1440x900x24', 'bash', '-c', script,
                    'capture', str(winbox), password, str(out)], env=env, check=True, timeout=240)
    if (out / 'winbox.png').stat().st_size < 5000:
        raise RuntimeError('WinBox capture is unexpectedly small')
finally:
    vm.close(force=True)
