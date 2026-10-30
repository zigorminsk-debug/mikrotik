#!/usr/bin/env python3
"""CI feasibility probe: a throwaway CHR on isolated QEMU, not app runtime."""
import base64
import json
import secrets
import os
import pathlib
import re
import socket
import subprocess
import sys
import time

qemu = pathlib.Path(sys.argv[1]).resolve()
image = pathlib.Path(sys.argv[2]).resolve()
assert qemu.is_file() and image.is_file()
# Reserve a loopback-only port. QEMU listens on loopback; no network bridge/TAP.
with socket.socket() as reserved:
    reserved.bind(('127.0.0.1', 0))
    port = reserved.getsockname()[1]
serial = f'tcp:127.0.0.1:{port},server=on,wait=off'
args = [str(qemu), '-machine', 'pc,accel=tcg', '-m', '256', '-smp', '2',
        '-display', 'none', '-monitor', 'none', '-serial', serial,
        '-drive', f'file={image},format=raw,if=ide',
        *sum((['-netdev', f'user,id=n{i},restrict=on', '-device', f'e1000,netdev=n{i}'] for i in range(6)), [])]
# Firmware location differs between archives. Prefer QEMU's normal defaults.
proc = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                        stderr=subprocess.PIPE, creationflags=subprocess.CREATE_NO_WINDOW)
sock = None
buffer = b''
transcript = bytearray()

def record(data):
    transcript.extend(data)
    if len(transcript) > 40000:
        del transcript[:-20000]

def wait_for(pattern, timeout=180):
    global buffer
    end = time.monotonic() + timeout
    regex = re.compile(pattern, re.I)
    while time.monotonic() < end:
        match = regex.search(buffer)
        if match:
            before, buffer = buffer[:match.start()], buffer[match.end():]
            return before, match
        if proc.poll() is not None:
            raise RuntimeError('QEMU завершился до готовности')
        try:
            data = sock.recv(16384)
            if not data:
                raise RuntimeError('Соединение с консолью CHR закрыто')
            record(data)
            buffer += data
            if len(buffer) > 200000:
                buffer = buffer[-100000:]
        except socket.timeout:
            pass
    raise RuntimeError('Тайм-аут ожидания консоли CHR')

def settle():
    global buffer
    # Serial redraws can contain stale copies of a prompt.
    buffer = b''
    while True:
        try:
            data = sock.recv(16384)
            if not data:
                raise RuntimeError('Консоль CHR закрылась')
            record(data)
        except socket.timeout:
            return

def send(line):
    sock.sendall((line + '\n').encode())

try:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise RuntimeError('QEMU не запустился')
        try:
            sock = socket.create_connection(('127.0.0.1', port), timeout=2)
            break
        except OSError:
            time.sleep(.5)
    if sock is None:
        raise RuntimeError('Консоль QEMU недоступна')
    sock.settimeout(1)
    wait_for(rb'login:')
    settle(); send('admin')
    wait_for(rb'password:')
    settle(); send('')
    # A fresh CHR asks to accept the license, then set a password. Match the
    # next state specifically so a redraw of the previous prompt cannot cause
    # us to consume the next prompt or submit the password as a command.
    wait_for(rb'do you want to see the software license')
    settle(); send('n')
    wait_for(rb'(?<!repeat )new password[^\r\n]*>')
    settle(); send('Temporary-CI-Only-42!')
    wait_for(rb'repeat new password[^\r\n]*>')
    settle(); send('Temporary-CI-Only-42!')
    wait_for(rb'password changed')
    wait_for(rb'\[admin@[^\]]+\]\s*>')
    settle()
    send('/system resource print')
    # Prompt redraws may occur while the command is being typed. Require actual
    # command output before looking for the next prompt, not a stale redraw.
    wait_for(rb'version:\s*[^\r\n]+')
    wait_for(rb'architecture-name:\s*[^\r\n]+')
    wait_for(rb'\[admin@[^\]]+\]\s*>')
    print('Windows QEMU: CHR boot and resource output verified via serial.')
    if len(sys.argv) > 3:
        commands = json.loads(pathlib.Path(sys.argv[3]).read_text(encoding='utf-8-sig'))
        if not isinstance(commands, list) or not 1 <= len(commands) <= 100:
            raise RuntimeError('Invalid CI fixture')
        # Tokens are concatenated at runtime: echoes of the command cannot
        # match the result marker. This tests only synthetic CI credentials.
        def execute(command, should_fail=False):
            token = secrets.token_hex(16)
            ok, bad = 'LABOK' + token, 'LABERR' + token
            def expr(s):
                mid = len(s) // 2
                return '"' + s[:mid] + '" . "' + s[mid:] + '"'
            wrapper = ':do { ' + command + '; :put (' + expr(ok) + ') } on-error={ :put (' + expr(bad) + ') }'
            settle(); send(wrapper)
            _, mark = wait_for((ok + '|' + bad).encode(), timeout=30)
            if (mark.group().decode() == bad) != should_fail:
                raise RuntimeError('CHR command acceptance differs from expected')
        # Ensure errors actually reach on-error instead of silently succeeding.
        execute('/interface bridge add name=bridge-lan', should_fail=False)
        execute('/interface bridge add name=bridge-lan', should_fail=True)
        execute('/interface bridge remove [find where name="bridge-lan"]')
        for command in commands:
            execute(command)
        # Query actual values, not just process exit or console echo.
        for assertion in [
            '[:len [/ip address find where address="192.168.88.1/24" and interface="bridge-lan"]] = 1',
            '[:len [/ip address find where address="192.168.99.1/24" and interface="vlan-guest"]] = 1',
            '[:len [/ip dhcp-server find where name="dhcp-lan" and disabled=no]] = 1',
            '[:len [/ip dhcp-server find where name="dhcp-guest" and disabled=no]] = 1',
            '[/interface bridge get [find where name="bridge-lan"] vlan-filtering] = true',
            '[:len [/ip firewall nat find where chain=srcnat and action=masquerade]] = 1',
            '[:len [/ip firewall filter find where chain=input and action=drop]] > 0'
        ]:
            execute(':if (!(' + assertion + ')) do={ :error "assertion failed" }')
        print('Windows QEMU: fixture commands and RouterOS settings verified.')

finally:
    if sock:
        sock.close()
    proc.terminate()
    try:
        _, err = proc.communicate(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        _, err = proc.communicate()
    if sys.exc_info()[0] is not None:
        safe = bytes(transcript).replace(b'Temporary-CI-Only-42!', b'[redacted]')
        safe = re.sub(rb'\x1b\[[0-9;?]*[A-Za-z]', b'', safe)
        # The runner log service may be unavailable; surface the ASCII-only,
        # redacted test transcript as a check annotation for diagnostics.
        encoded = base64.b64encode(safe[-2500:]).decode('ascii')
        print('::warning title=CHR test serial (base64)::' + encoded)
        if err:
            print('QEMU stderr:', err.decode(errors='replace')[-3000:], file=sys.stderr)
