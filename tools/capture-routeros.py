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
]
vm = pexpect.spawn('qemu-system-x86_64', args, encoding='utf-8', timeout=180, dimensions=(50, 160))
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
                           r'(?i)(?:new password|repeat new password)[^\r\n]*:',
                           r'(?i)press (?:enter|return)', r'\[admin@[^\]]+\]\s*>',
                           r'(?i)password:'])
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
        for command in ['/ip address add address=10.0.2.15/24 interface=ether1',
                        '/ip service enable winbox', '/system resource print']:
            vm.sendline(command)
            vm.expect(r'\[admin@[^\]]+\]\s*>')
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
sleep 35
scrot "$3/winbox.png"
kill "$pid" 2>/dev/null || true
'''
    env = os.environ.copy()
    env['QT_X11_NO_MITSHM'] = '1'
    subprocess.run(['xvfb-run', '-a', '-s', '-screen 0 1440x900x24', 'bash', '-c', script,
                    'capture', str(winbox), password, str(out)], env=env, check=True, timeout=90)
    if (out / 'winbox.png').stat().st_size < 5000:
        raise RuntimeError('WinBox capture is unexpectedly small')
finally:
    vm.close(force=True)
