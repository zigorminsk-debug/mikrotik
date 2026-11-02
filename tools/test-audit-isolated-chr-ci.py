#!/usr/bin/python3
"""CI only: synthetic typed plan, disposable CHR, no host forwarding or LAN.
Serial is connected to this process over stdio, not a TCP listener. No user data.
"""
import json, pathlib, re, secrets, shutil, subprocess, sys, tempfile
import pexpect
images=list(pathlib.Path(sys.argv[1]).glob('*.img'))
if len(images)!=1: raise SystemExit('Expected one pristine CHR image')
plan=json.load(sys.stdin) if sys.argv[2:]==['--stdin-plan'] else json.loads(subprocess.check_output(['node','tools/audit-compile-ci.js'],text=True))
if len(plan['commands'])!=4 or len(plan['checks'])!=4: raise SystemExit('Unexpected fixture plan')
password='Disposable-Audit-CI-42!'
def literal(value): return '"'+value[:16]+'" . "'+value[16:]+'"'
with tempfile.TemporaryDirectory(prefix='audit-isolated-chr-') as tmp:
 disk=pathlib.Path(tmp)/'chr.img';shutil.copyfile(images[0],disk)
 # Separate restricted SLIRP networks: no hostfwd, UDP links, inbound listener,
 # or external network access. The emulated DHCP service is not a real ISP.
 args=['-machine','pc,accel=tcg','-m','256','-smp','1','-nographic','-no-reboot','-drive',f'file={disk},format=raw,if=ide']
 for i in range(5): args+=['-netdev',f'user,id=n{i},restrict=on','-device',f'e1000,netdev=n{i}']
 vm=pexpect.spawn('qemu-system-x86_64',args,encoding='utf-8',timeout=180,dimensions=(50,160),echo=False)
 def settle():
  while True:
   try: vm.read_nonblocking(size=65536,timeout=1)
   except pexpect.TIMEOUT: return
 def command(text,expect_success=True):
  token=secrets.token_hex(16);ok='AUDITOK'+token;bad='AUDITERR'+token
  settle();vm.sendline(':do { '+text+'; :put ('+literal(ok)+') } on-error={ :put ('+literal(bad)+') }')
  result=vm.expect([re.escape(ok),re.escape(bad)],timeout=90)
  if (result==0)!=expect_success: raise RuntimeError('Fixture operation or negative control failed')
 stage='boot/login'
 try:
  vm.expect(r'(?i)login:');vm.sendline('admin');vm.expect(r'(?i)password:');vm.sendline('')
  for _ in range(12):
   n=vm.expect([r'(?i)do you want to see the software license',r'(?i)(?:new password|repeat new password)[^\r\n]*[>:]',r'(?i)press (?:enter|return)',r'\[admin@[^\]]+\]\s*>',r'(?i)password:']);settle()
   if n==0: vm.sendline('n')
   elif n in (1,4): vm.sendline(password)
   elif n==2: vm.sendline('')
   else: break
  else: raise RuntimeError('CHR login failed')
  for i,text in enumerate(plan['commands']): stage='apply-'+str(i+1);command(text)
  for check in plan['checks']: stage='verify-'+check['id'];command(check['query'])
  # Negative control: change a selected value only in this disposable VM.
  stage='negative-control-change';command('/interface bridge port set [find where bridge=audit-lan and interface=ether2] disabled=yes')
  stage='negative-control-check';command(next(c['query'] for c in plan['checks'] if c['id']=='port:ether2'),False)
  stage='negative-control-restore';command('/interface bridge port set [find where bridge=audit-lan and interface=ether2] disabled=no')
  stage='verify-restored';command(next(c['query'] for c in plan['checks'] if c['id']=='port:ether2'))
  print('::notice title=Isolated audit fixture::Synthetic bridge, two mapped ports and one IPv4 applied and selected fields verified in a disposable CHR; negative control detected and restored. Restricted SLIRP has no host forwarding. No user data, physical router, full import or network connectivity tested.')
 except Exception as error:
  print('::error title=Isolated audit fixture::Stage '+stage+'; exception class: '+type(error).__name__+'; no serial output logged.',flush=True)
  sys.exit(1)
 finally:
  vm.close(force=True)
