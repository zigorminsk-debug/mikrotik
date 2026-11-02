#!/usr/bin/python3
"""CI only: disposable source CHR via loopback TLS, then a separate target.
The unauthenticated fixture pin probe is NOT a production trust model.
"""
import json,pathlib,re,secrets,shutil,subprocess,sys,tempfile
import pexpect
base=pathlib.Path(sys.argv[1]);images=list(base.glob('*.img'))
if len(images)!=1:raise SystemExit('Expected one pristine CHR image')
password='Disposable-Audit-CI-42!';port=18443
def literal(value):return '"'+value[:16]+'" . "'+value[16:]+'"'
with tempfile.TemporaryDirectory(prefix='audit-source-chr-') as tmp:
 disk=pathlib.Path(tmp)/'source.img';shutil.copyfile(images[0],disk)
 args=['-machine','pc,accel=tcg','-m','256','-smp','1','-nographic','-no-reboot','-drive',f'file={disk},format=raw,if=ide','-netdev',f'user,id=n0,restrict=on,hostfwd=tcp:127.0.0.1:{port}-:443','-device','e1000,netdev=n0','-netdev','user,id=n1,restrict=on','-device','e1000,netdev=n1']
 vm=pexpect.spawn('qemu-system-x86_64',args,encoding='utf-8',timeout=180,dimensions=(50,160),echo=False)
 def settle():
  while True:
   try:vm.read_nonblocking(size=65536,timeout=1)
   except pexpect.TIMEOUT:return
 def command(text):
  token=secrets.token_hex(16);ok='AUDITOK'+token;bad='AUDITERR'+token
  settle();vm.sendline(':do { '+text+'; :put ('+literal(ok)+') } on-error={ :put ('+literal(bad)+') }')
  if vm.expect([re.escape(ok),re.escape(bad)],timeout=120)!=0:raise RuntimeError('CHR rejected fixture command')
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
  commands=[':foreach i in=[/ip dhcp-client find] do={/ip dhcp-client disable $i}',
   '/interface bridge add name=source-lan protocol-mode=rstp vlan-filtering=no disabled=no',
   '/interface bridge port add bridge=source-lan interface=ether1 pvid=1 ingress-filtering=no frame-types=admit-all disabled=no',
   '/interface bridge port add bridge=source-lan interface=ether2 pvid=1 ingress-filtering=no frame-types=admit-all disabled=no',
   '/ip address add address=10.0.2.15/24 interface=source-lan disabled=no',
   '/certificate add name=audit-ca common-name=audit-ca key-usage=key-cert-sign,crl-sign days-valid=2',
   '/certificate sign audit-ca',':delay 3s',
   '/certificate add name=audit-ci common-name=audit-ci key-usage=digital-signature,key-encipherment,tls-server days-valid=1',
   '/certificate sign audit-ci ca=audit-ca',':delay 3s',
   '/ip service set www-ssl certificate=audit-ci disabled=no',
   '/user group add name=audit-ci policy=read,api,rest-api',
   '/user add name=ci-audit group=audit-ci password="'+password+'"']
  for i,text in enumerate(commands):stage='configure-'+str(i+1);command(text)
  stage='collect-and-compile'
  result=subprocess.run(['node','tools/audit-source-compile-ci.js'],input=json.dumps({'port':port,'user':'ci-audit','password':password}),text=True,capture_output=True,timeout=240)
  if result.returncode:
   # Only fixed Russian rejection reasons from preview, no device data or credentials.
   print('::error title=Source compile detail::'+result.stderr.strip()[:1000],flush=True);raise RuntimeError('Source fixture collection or compilation failed')
  plan=result.stdout
 except Exception as error:
  print('::error title=Audit source fixture::Stage '+stage+'; exception class: '+type(error).__name__+'; no serial output logged.',flush=True)
  sys.exit(1)
 finally:vm.close(force=True)
 # Source has stopped; its temporary disk is deleted when the context exits.
 # Only generated narrow commands
 # are piped to the separate one-use target with no inbound forwarding.
 result=subprocess.run(['/usr/bin/python3','tools/test-audit-isolated-chr-ci.py',str(base),'--stdin-plan'],input=plan,text=True,timeout=360)
 if result.returncode:raise SystemExit('Target fixture failed')
 print('::notice title=Audit source-to-target::Read 18 selected sections from a disposable source via pinned fixture HTTPS, then used the allowlisted bridge plan on a separate restricted disposable CHR with selected-field verification and negative control. No physical device, user data, production TLS trust or complete audit tested.')
