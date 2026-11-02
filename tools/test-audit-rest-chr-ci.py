#!/usr/bin/python3
"""CI-only disposable CHR for read-only HTTPS research; no live router."""
import json, pathlib, re, secrets, subprocess, sys
import pexpect
base=pathlib.Path(sys.argv[1]);images=list(base.glob('*.img'))
if len(images)!=1: raise SystemExit('Expected one CHR image')
password='Disposable-Audit-CI-42!'; user='ci-audit'; port=18443
vm=pexpect.spawn('qemu-system-x86_64',['-machine','pc,accel=tcg','-m','256','-smp','1','-nographic','-no-reboot','-drive',f'file={images[0]},format=raw,if=ide','-netdev',f'user,id=n0,restrict=on,hostfwd=tcp:127.0.0.1:{port}-:443','-device','e1000,netdev=n0'],encoding='utf-8',timeout=180,dimensions=(50,160),echo=False)
def settle():
 while True:
  try: vm.read_nonblocking(size=65536,timeout=1)
  except pexpect.TIMEOUT: return

def literal(value):
 return '"'+value[:16]+'" . "'+value[16:]+'"'

def command(text,timeout=60):
 # Complete markers cannot appear in the echoed command; unlike the prompt,
 # they cannot be mistaken for a previous serial-console redraw.
 token=secrets.token_hex(16);ok='AUDITOK'+token;bad='AUDITERR'+token
 settle();vm.sendline(':do { '+text+'; :put ('+literal(ok)+') } on-error={ :put ('+literal(bad)+') }')
 if vm.expect([re.escape(ok),re.escape(bad)],timeout=timeout)!=0:raise RuntimeError('CHR rejected fixture command')

stage='boot/login'
try:
 vm.expect(r'(?i)login:');vm.sendline('admin');vm.expect(r'(?i)password:');vm.sendline('')
 for _ in range(12):
  n=vm.expect([r'(?i)do you want to see the software license',r'(?i)(?:new password|repeat new password)[^\r\n]*[>:]',r'(?i)press (?:enter|return)',r'\[admin@[^\]]+\]\s*>',r'(?i)password:']);settle()
  if n==0:vm.sendline('n')
  elif n in (1,4):vm.sendline(password)
  elif n==2:vm.sendline('')
  else:break
 else:raise RuntimeError('CHR login failed')
 stage='configure'
 for index,text in enumerate([':if ([:len [/ip address find where address="10.0.2.15/24"]] = 0) do={/ip address add address=10.0.2.15/24 interface=ether1}',
              '/system identity set name=audit-fixture',
              '/certificate add name=audit-ca common-name=audit-ca key-usage=key-cert-sign,crl-sign days-valid=2',
              '/certificate sign audit-ca',
              ':delay 3s',
              '/certificate add name=audit-ci common-name=audit-ci key-usage=digital-signature,key-encipherment,tls-server days-valid=1',
              '/certificate sign audit-ci ca=audit-ca',
              ':delay 3s',
              '/ip service set www-ssl certificate=audit-ci disabled=no',
              '/user group add name=audit-ci policy=read,api,rest-api',
              '/user add name=ci-audit group=audit-ci password="'+password+'"']):
  stage='configure-'+str(index+1);command(text,120)
 stage='collector-and-write-denial'
 result=subprocess.run(['node','tools/test-audit-rest-chr-ci.js'],input=json.dumps({'port':port,'user':user,'password':password}),text=True,timeout=180)
 if result.returncode:raise RuntimeError('HTTPS collector test failed')
except Exception as error:
 print('::error title=Audit CHR fixture stage::'+stage+'; exception class: '+type(error).__name__,flush=True)
 sys.exit(1)
finally:
 vm.close(force=True)
