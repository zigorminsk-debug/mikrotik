#!/usr/bin/env python3
"""Two real disposable CHRs over an isolated UDP link, GitHub Actions only.

No user data, public endpoints, external listening socket or persistent disk.
Checks the laboratory's generated WireGuard configuration with a real peer and
ICMP through the encrypted tunnel. This is not the packaged Windows GUI path.
"""
import base64
import json
import pathlib
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
import pexpect

base = pathlib.Path(sys.argv[1])
image = pathlib.Path(sys.argv[2])
fixture = json.loads(pathlib.Path(sys.argv[3]).read_text())
base.mkdir(parents=True, exist_ok=True)
password = 'TransientCI-' + secrets.token_hex(12)
procs = []

def reserve_ports():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as a, socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as b:
        a.bind(('127.0.0.1',0)); b.bind(('127.0.0.1',0))
        return a.getsockname()[1], b.getsockname()[1]

def settle(vm):
    while True:
        try:
            vm.read_nonblocking(size=65536,timeout=0.7)
        except pexpect.TIMEOUT:
            return

def boot(label, local, remote, extra):
    disk=base/(label+'.img'); shutil.copyfile(image,disk)
    args=['-machine','pc,accel=tcg','-m','256','-smp','1','-nographic','-no-reboot',
          '-drive',f'file={disk},format=raw,if=ide',
          '-netdev',f'socket,id=wan,udp=127.0.0.1:{remote},localaddr=127.0.0.1:{local}',
          '-device','e1000,netdev=wan']
    for i in range(extra): args+=['-netdev',f'user,id=isolated{i},restrict=on','-device',f'e1000,netdev=isolated{i}']
    vm=pexpect.spawn('qemu-system-x86_64',args,encoding='utf-8',timeout=180,dimensions=(50,160),echo=False)
    procs.append(vm)
    vm.expect(r'(?i)login:'); vm.sendline('admin'); vm.expect(r'(?i)password:');vm.sendline('')
    for _ in range(12):
        n=vm.expect([r'(?i)do you want to see the software license',r'(?i)(?:new password|repeat new password)[^\r\n]*[>:]',r'(?i)press (?:enter|return)',r'\[admin@[^\]]+\]\s*>',r'(?i)password:'])
        settle(vm)
        if n==0:vm.sendline('n')
        elif n in (1,4):vm.sendline(password)
        elif n==2:vm.sendline('')
        else:return vm
    raise RuntimeError(label+' failed to initialize')

def command(vm,line,timeout=45):
    # The echo contains only fragments of the random markers, never the joined
    # marker; RouterOS output and sensitive values are never printed to logs.
    token=secrets.token_hex(16);ok='LABOK'+token;bad='LABERR'+token
    def literal(value): return '"'+value[:16]+'" . "'+value[16:]+'"'
    settle(vm)
    vm.sendline(':do { '+line+'; :put ('+literal(ok)+') } on-error={ :put ('+literal(bad)+') }')
    try: match=vm.expect([re.escape(ok),re.escape(bad)],timeout=timeout)
    except Exception: raise RuntimeError('RouterOS command timed out or console closed') from None
    if match:raise RuntimeError('RouterOS rejected test command')

def get_public(vm):
    token=secrets.token_hex(3);start='WG'+token;end='END'+token
    settle(vm)
    vm.sendline(':put ("'+start[:8]+'" . "'+start[8:]+'" . [/interface wireguard get [find where name="wg-lab"] public-key] . "'+end[:8]+'" . "'+end[8:]+'")')
    vm.expect(re.escape(start)+r'([A-Za-z0-9+/]{43}=)'+re.escape(end),timeout=30)
    key=vm.match.group(1);assert len(base64.b64decode(key))==32
    return key

def verify_ping(vm,address):
    token=secrets.token_hex(16);yes='PINGOK'+token;no='PINGFAIL'+token
    def literal(value): return '"'+value[:16]+'" . "'+value[16:]+'"'
    settle(vm)
    vm.sendline(':do { :local n [/ping '+address+' count=5 interval=1s]; :if ($n > 0) do={:put ('+literal(yes)+')} else={:put ('+literal(no)+')} } on-error={:put ('+literal(no)+')}')
    try: match=vm.expect([re.escape(yes),re.escape(no)],timeout=60)
    except Exception: raise RuntimeError('Encrypted ping timed out') from None
    if match:raise RuntimeError('Encrypted ping did not succeed')

stage='initialization'
try:
    left,right=reserve_ports()
    stage='server boot';server=boot('server',left,right,1)
    stage='client boot';client=boot('client',right,left,0)
    stage='server configuration'
    command(server,'/ip dhcp-client disable [find]')
    for group in fixture['groups']:
        for line in group['commands']:
            try:command(server,line)
            except Exception as exc: raise RuntimeError('Server configuration group '+group['id']+' failed') from exc
    stage='read generated server public key';server_public=get_public(server)
    stage='client configuration'
    command(client,'/ip dhcp-client disable [find]')
    for line in [
        '/ip address add address=198.51.100.1/30 interface=ether1',
        '/interface wireguard add name=wg-client listen-port=13232 private-key="'+fixture['clientPrivate']+'"',
        '/ip address add address=10.10.10.2/24 interface=wg-client',
        '/interface wireguard peers add interface=wg-client public-key="'+server_public+'" allowed-address=10.10.10.1/32,192.168.88.0/24 endpoint-address=198.51.100.2 endpoint-port=13231 persistent-keepalive=5s']:
        command(client,line)
    stage='ping tunnel';verify_ping(client,'10.10.10.1')
    stage='ping LAN gateway';verify_ping(client,'192.168.88.1')
    print('::notice title=Real WireGuard tunnel::Two disposable CHRs established a WireGuard tunnel over an isolated UDP link. The client reached the VPN address and server LAN gateway through the tunnel. No client LAN VM, external network or Windows GUI was tested.')
except Exception as exc:
    # Never include raw console buffers, private keys or passwords in CI logs.
    msg=str(exc) if isinstance(exc,RuntimeError) else type(exc).__name__
    print('::error title=WireGuard isolated test::'+stage+': '+msg.replace('\n',' ').replace('%',' '))
    raise SystemExit(1) from None
finally:
    for vm in procs:
        vm.close(force=True)
    shutil.rmtree(base,ignore_errors=True)
