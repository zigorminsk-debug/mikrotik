#!/usr/bin/env python3
"""CI only: one disposable CHR and one test client inside an isolated netns.
No physical network, production router, user credentials or configuration writes
via the MAC client. QEMU serial sets up its own disposable test router.
"""
import json, pathlib, secrets, shutil, subprocess, sys
import pexpect

image, work, helper = map(pathlib.Path, sys.argv[1:4])
work.mkdir(parents=True, exist_ok=True)
disk=work/'disk.img';shutil.copyfile(image,disk)
password='TemporaryCI_'+secrets.token_hex(12)
mac='02:11:22:33:44:55'
vm=None;stage='boot'

def settle():
    while True:
        try: vm.read_nonblocking(size=65536,timeout=0.7)
        except pexpect.TIMEOUT: return

def command(line):
    token=secrets.token_hex(16);ok='OK'+token;bad='ERR'+token
    def literal(s): return '"'+s[:16]+'" . "'+s[16:]+'"'
    settle();vm.sendline(':do { '+line+'; :put ('+literal(ok)+') } on-error={:put ('+literal(bad)+')}')
    if vm.expect([ok,bad],timeout=45):raise RuntimeError('CHR rejected setup command')

def probe(test_password):
    payload=json.dumps({'mac':mac,'password':test_password})+'\n'
    try: result=subprocess.run([str(helper)],input=payload,text=True,capture_output=True,timeout=90)
    except subprocess.TimeoutExpired: raise RuntimeError('MAC read-only client timed out') from None
    # No raw console, response, exception message or credentials in logs.
    try: response=json.loads(result.stdout.strip().splitlines()[-1])
    except Exception: raise RuntimeError('MAC client produced no valid result') from None
    category=response.get('category','unknown')
    if not isinstance(category,str) or not category.isidentifier() or len(category)>80: category='unknown'
    return result.returncode==0 and response.get('ok') is True,category

try:
    vm=pexpect.spawn('qemu-system-x86_64',['-machine','pc,accel=tcg','-m','256','-smp','1','-nographic','-no-reboot','-drive',f'file={disk},format=raw,if=ide','-netdev','tap,id=n0,ifname=tap0,script=no,downscript=no','-device',f'e1000,netdev=n0,mac={mac}'],encoding='utf-8',timeout=180,echo=False)
    vm.expect(r'(?i)login:');vm.sendline('admin');vm.expect(r'(?i)password:');vm.sendline('')
    for _ in range(12):
        n=vm.expect([r'(?i)do you want to see the software license',r'(?i)(?:new password|repeat new password)[^\r\n]*[>:]',r'(?i)press (?:enter|return)',r'\[admin@[^\]]+\]\s*>',r'(?i)password:'])
        settle()
        if n==0:vm.sendline('n')
        elif n in (1,4):vm.sendline(password)
        elif n==2:vm.sendline('')
        else:break
    else:raise RuntimeError('CHR did not finish initialisation')
    stage='isolated CHR configuration'
    command('/ip dhcp-client disable [find]')
    command('/tool mac-server mac-winbox set allowed-interface-list=all')
    command('/ip neighbor discovery-settings set discover-interface-list=all')
    stage='MNDP on isolated TAP'
    js="const d=require('./windows/physical/mndp');d.discover('tap0','192.0.2.1',{timeout:6000}).then(x=>process.exit(x.some(y=>y.mac==='02:11:22:33:44:55')?0:1)).catch(()=>process.exit(1));"
    result=subprocess.run(['node','-e',js],capture_output=True,timeout=20)
    if result.returncode:raise RuntimeError('No matching MNDP response on isolated TAP')
    print('::notice title=Real CHR MNDP::Application discovery received the expected MAC from one disposable RouterOS CHR over an isolated TAP network. No physical device or Windows broadcast was tested.', flush=True)
    stage='authenticated MAC read';
    success,category=probe(password)
    if not success:raise RuntimeError('MAC read-only probe failed ('+category+')')
    stage='wrong password';
    success,_=probe('wrong_'+secrets.token_hex(8))
    if success:raise RuntimeError('Wrong password was accepted')
    print('::notice title=Isolated MAC research::Windows application MNDP parser discovered one disposable CHR and a third-party research client authenticated via MAC WinBox and read RouterOS version. An attempt with a wrong password could not read the version. No physical device, Windows client, reset or configuration transfer was tested.')
except Exception as exc:
    print('::error title=MAC research::'+stage+': '+(str(exc) if isinstance(exc,RuntimeError) else type(exc).__name__).replace('\n',' ').replace('%',' '))
    raise SystemExit(1) from None
finally:
    if vm:vm.close(force=True)
    shutil.rmtree(work,ignore_errors=True)
