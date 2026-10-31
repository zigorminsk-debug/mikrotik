#!/usr/bin/env python3
"""Original WinBox 4 connection screen against one disposable CHR, CI only.
The process runs in an isolated Linux network namespace with a TAP interface;
no physical network, physical router, secrets or user data are accessed.
"""
import os, pathlib, secrets, shutil, subprocess, sys
import pexpect
base=pathlib.Path(sys.argv[1]);out=base/'output';out.mkdir(parents=True,exist_ok=True)
image=base/'chr-7.23.8.img';disk=base/'capture-disk.img';shutil.copyfile(image,disk)
winbox=next((p for p in (base/'winbox').rglob('*') if p.is_file() and p.name.lower()=='winbox'),None)
if not winbox:raise SystemExit('Official WinBox binary not found')
winbox.chmod(winbox.stat().st_mode|0o111)
password='DisposableCI_'+secrets.token_hex(12)
vm=None

def settle():
    while True:
        try:vm.read_nonblocking(size=65536,timeout=0.7)
        except pexpect.TIMEOUT:return

def command(line):
    token=secrets.token_hex(16);ok='OK'+token;bad='ERR'+token
    def literal(s):return '"'+s[:16]+'" . "'+s[16:]+'"'
    settle();vm.sendline(':do { '+line+'; :put ('+literal(ok)+') } on-error={:put ('+literal(bad)+')}')
    if vm.expect([ok,bad],timeout=45):raise RuntimeError('CHR rejected test setup')

try:
    vm=pexpect.spawn('qemu-system-x86_64',['-machine','pc,accel=tcg','-m','256','-smp','1','-nographic','-no-reboot','-drive',f'file={disk},format=raw,if=ide','-netdev','tap,id=n0,ifname=tap0,script=no,downscript=no','-device','e1000,netdev=n0,mac=02:11:22:33:44:55'],encoding='utf-8',timeout=180,echo=False)
    vm.expect(r'(?i)login:');vm.sendline('admin');vm.expect(r'(?i)password:');vm.sendline('')
    for _ in range(12):
        n=vm.expect([r'(?i)do you want to see the software license',r'(?i)(?:new password|repeat new password)[^\r\n]*[>:]',r'(?i)press (?:enter|return)',r'\[admin@[^\]]+\]\s*>',r'(?i)password:']);settle()
        if n==0:vm.sendline('n')
        elif n in (1,4):vm.sendline(password)
        elif n==2:vm.sendline('')
        else:break
    else:raise RuntimeError('CHR did not finish initialisation')
    command('/ip dhcp-client disable [find]')
    command('/tool mac-server mac-winbox set allowed-interface-list=all')
    command('/ip neighbor discovery-settings set discover-interface-list=all')
    # Real WinBox, no arguments, no attempted authentication. The screenshot
    # must be visually checked for a genuine neighbour before publication.
    script='''set -eu
"$1" >"$2/winbox.log" 2>&1 &
pid=$!
sleep 30
if ! kill -0 "$pid" 2>/dev/null; then echo 'WinBox exited before capture'; exit 1; fi
win=$(xdotool search --onlyvisible --pid "$pid" | head -n 1)
xdotool windowfocus --sync "$win"
sleep 2
scrot -q 45 "$2/mac-neighbors.jpg"
kill "$pid" 2>/dev/null || true
'''
    env=os.environ.copy();env['QT_X11_NO_MITSHM']='1';env['HOME']=str(base/'gui-home');pathlib.Path(env['HOME']).mkdir(exist_ok=True)
    subprocess.run(['xvfb-run','-a','-s','-screen 0 1440x900x24','bash','-c',script,'capture',str(winbox),str(out)],env=env,check=True,timeout=90)
    if (out/'mac-neighbors.jpg').stat().st_size<5000:raise RuntimeError('WinBox image unexpectedly small')
finally:
    if vm:vm.close(force=True)
    disk.unlink(missing_ok=True)
