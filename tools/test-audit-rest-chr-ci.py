#!/usr/bin/python3
"""CI-only disposable CHR for read-only HTTPS research; no live router."""
import json, pathlib, re, subprocess, sys, time
import pexpect
base=pathlib.Path(sys.argv[1]);images=list(base.glob('*.img'))
if len(images)!=1: raise SystemExit('Expected one CHR image')
password='Disposable-Audit-CI-42!'; user='ci-audit'; port=18443
vm=pexpect.spawn('qemu-system-x86_64',['-machine','pc,accel=tcg','-m','256','-smp','1','-nographic','-no-reboot','-drive',f'file={images[0]},format=raw,if=ide','-netdev',f'user,id=n0,restrict=on,hostfwd=tcp:127.0.0.1:{port}-:443','-device','e1000,netdev=n0'],encoding='utf-8',timeout=180,dimensions=(50,160),echo=False)
def settle():
 while True:
  try: vm.read_nonblocking(size=65536,timeout=1)
  except pexpect.TIMEOUT: return

def command(text,timeout=60):
 vm.sendline(text);vm.expect(r'\[admin@[^\]]+\]\s*>',timeout=timeout);out=vm.before;settle()
 if re.search(r'(?i)failure:|expected end of command|bad command name|syntax error|input does not match',out): raise RuntimeError('CHR rejected fixture command')
 return out
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
              '/certificate add name=audit-ci common-name=audit-ci key-usage=digital-signature,key-encipherment,tls-server days-valid=1',
              '/certificate sign audit-ci',
              '/ip service set www-ssl certificate=audit-ci disabled=no',
              '/user group add name=audit-ci policy=read,api,rest-api',
              '/user add name=ci-audit group=audit-ci password="'+password+'"']):
  stage='configure-'+str(index+1);command(text,120)
 stage='read-certificate-fingerprint'
 data=command(':put ("AUDITPIN" . [/certificate get [find where name="audit-ci"] fingerprint] . "END")')
 match=re.search(r'AUDITPIN([0-9A-Fa-f]{64})END',re.sub(r'\x1b\[[0-9;?]*[A-Za-z]','',data))
 if not match:raise RuntimeError('Cannot obtain fixture certificate fingerprint')
 pin=':'.join(match.group(1)[i:i+2] for i in range(0,64,2))
 stage='collector-and-write-denial'
 result=subprocess.run(['node','tools/test-audit-rest-chr-ci.js'],input=json.dumps({'port':port,'fingerprint':pin,'user':user,'password':password}),text=True,timeout=180)
 if result.returncode:raise RuntimeError('HTTPS collector test failed')
except Exception as error:
 print('::error title=Audit CHR fixture stage::'+stage+'; exception class: '+type(error).__name__,flush=True)
 sys.exit(1)
finally:
 vm.close(force=True)
