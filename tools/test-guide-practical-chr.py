#!/usr/bin/python3
"""CI-only parameters for DHCP, internal CA and a *disabled* OVPN server.
Disposable CHR, restricted QEMU networks, no host forwarding, no user data.
It does not test GUI clicks, DHCP traffic, VPN connectivity or production use.
"""
import pathlib, re, secrets, shutil, sys, tempfile
import pexpect
images=list(pathlib.Path(sys.argv[1]).glob('*.img'))
if len(images)!=1:raise SystemExit('Expected one pristine CHR image')
password='Disposable-Guide-CI-42!'
def literal(value):return '"'+value[:16]+'" . "'+value[16:]+'"'
with tempfile.TemporaryDirectory(prefix='guide-practical-chr-') as tmp:
 disk=pathlib.Path(tmp)/'chr.img';shutil.copyfile(images[0],disk)
 args=['-machine','pc,accel=tcg','-m','256','-smp','1','-nographic','-no-reboot','-drive',f'file={disk},format=raw,if=ide']
 for i in range(2):args+=['-netdev',f'user,id=n{i},restrict=on','-device',f'e1000,netdev=n{i}']
 vm=pexpect.spawn('qemu-system-x86_64',args,encoding='utf-8',timeout=180,dimensions=(50,160),echo=False)
 def settle():
  while True:
   try:vm.read_nonblocking(size=65536,timeout=1)
   except pexpect.TIMEOUT:return
 def command(text):
  token=secrets.token_hex(16);ok='GUIDEOK'+token;bad='GUIDEERR'+token
  settle();vm.sendline(':do { '+text+'; :put ('+literal(ok)+') } on-error={ :put ('+literal(bad)+') }')
  if vm.expect([re.escape(ok),re.escape(bad)],timeout=120)!=0:raise RuntimeError('Fixture command rejected')
 stage='login'
 try:
  vm.expect(r'(?i)login:');vm.sendline('admin');vm.expect(r'(?i)password:');vm.sendline('')
  for _ in range(12):
   n=vm.expect([r'(?i)do you want to see the software license',r'(?i)(?:new password|repeat new password)[^\r\n]*[>:]',r'(?i)press (?:enter|return)',r'\[admin@[^\]]+\]\s*>',r'(?i)password:']);settle()
   if n==0:vm.sendline('n')
   elif n in (1,4):vm.sendline(password)
   elif n==2:vm.sendline('')
   else:break
  else:raise RuntimeError('CHR login failed')
  cmds=[
   '/interface bridge add name=guide-lan vlan-filtering=no',
   '/interface bridge port add bridge=guide-lan interface=ether2',
   '/ip address add address=192.168.88.1/24 interface=guide-lan',
   '/ip pool add name=guide-lan-pool ranges=192.168.88.100-192.168.88.199',
   '/ip dhcp-server add name=guide-lan-dhcp interface=guide-lan address-pool=guide-lan-pool disabled=no',
   '/ip dhcp-server network add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=192.168.88.1',
   '/certificate add name=guide-ca common-name=guide-ca key-size=2048 key-usage=key-cert-sign,crl-sign days-valid=30',
   '/certificate sign guide-ca',':delay 3s',
   '/certificate add name=guide-server common-name=vpn.example.org subject-alt-name=DNS:vpn.example.org key-size=2048 key-usage=digital-signature,key-encipherment,tls-server days-valid=7',
   '/certificate sign guide-server ca=guide-ca',':delay 3s',
   '/certificate add name=guide-client common-name=guide-client key-size=2048 key-usage=digital-signature,tls-client days-valid=7',
   '/certificate sign guide-client ca=guide-ca',':delay 3s',
   '/ip pool add name=guide-vpn-pool ranges=10.44.0.10-10.44.0.99',
   '/ppp profile add name=guide-vpn local-address=10.44.0.1 remote-address=guide-vpn-pool',
   '/interface ovpn-server server add name=guide-ovpn protocol=tcp port=1194 mode=ip certificate=guide-server require-client-certificate=yes default-profile=guide-vpn auth=sha256 cipher=aes256-cbc disabled=yes',
  ]
  for i,text in enumerate(cmds):stage='configure-'+str(i+1);command(text)
  checks=[
   ':if ([:len [/ip dhcp-server find where name=guide-lan-dhcp and interface=guide-lan and address-pool=guide-lan-pool and disabled=no]] != 1) do={:error "dhcp-mismatch"}',
   ':if ([:len [/ip dhcp-server network find where address="192.168.88.0/24" and gateway=192.168.88.1 and dns-server=192.168.88.1]] != 1) do={:error "network-mismatch"}',
   ':if ([:len [/certificate find where name=guide-ca and private-key=yes]] != 1) do={:error "ca-mismatch"}',
   ':if ([:len [/certificate find where name=guide-server and common-name="vpn.example.org" and private-key=yes]] != 1) do={:error "server-mismatch"}',
   ':if ([:len [/certificate find where name=guide-client and private-key=yes]] != 1) do={:error "client-mismatch"}',
   ':if ([:len [/interface ovpn-server server find where name=guide-ovpn and protocol=tcp and port=1194 and mode=ip and require-client-certificate=yes and disabled=yes]] != 1) do={:error "ovpn-mismatch"}'
  ]
  for i,text in enumerate(checks):stage='verify-'+str(i+1);command(text)
  stage='negative-control';command('/interface ovpn-server server set [find where name=guide-ovpn] require-client-certificate=no')
  # Verification must now reject this deliberately altered disposable fixture.
  try:command(checks[-1])
  except RuntimeError:pass
  else:raise RuntimeError('Negative control not detected')
  print('::notice title=Guide CHR parameters::Disposable isolated CHR accepted and read back selected DHCP, internal certificate and disabled OVPN settings; altered client-certificate flag was detected. No DHCP client traffic, VPN handshake, WinBox actions or physical router tested.')
 except Exception as error:
  print('::error title=Guide CHR fixture::Stage '+stage+'; exception class: '+type(error).__name__+'; no serial output logged.',flush=True);sys.exit(1)
 finally:vm.close(force=True)
