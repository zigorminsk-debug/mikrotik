#!/usr/bin/python3
"""Disposable GH runner + CHR + Linux OpenVPN, NEVER for user devices.
Ephemeral keys/passwords stay in a mode-0700 temp dir and are never logged/exported.
Only a host-local forwarded TCP port is used; the VM has restricted slirp networks.
No claim about WinBox UI, public WAN or a separate LAN host.
"""
import pathlib,re,secrets,shutil,subprocess,sys,tempfile,time,os
import pexpect
images=list(pathlib.Path(sys.argv[1]).glob('*.img'))
if len(images)!=1:raise SystemExit('Expected one pristine CHR image')
def lit(v):return '"'+v[:16]+'" . "'+v[16:]+'"'
with tempfile.TemporaryDirectory(prefix='guide-ovpn-ci-') as d:
 base=pathlib.Path(d);disk=base/'chr.img';shutil.copyfile(images[0],disk)
 password='CI-Temporary-Router-42!';authpass='CI-Temporary-VPN-42!';keypass='CI-Temporary-Key-42!'
 vm=pexpect.spawn('qemu-system-x86_64',['-machine','pc,accel=tcg','-m','256','-smp','1','-nographic','-no-reboot','-drive',f'file={disk},format=raw,if=ide','-netdev','user,id=n0,restrict=on,hostfwd=tcp:127.0.0.1:18194-:1194,hostfwd=tcp:127.0.0.1:12222-:22','-device','e1000,netdev=n0','-netdev','user,id=n1,restrict=on','-device','e1000,netdev=n1'],encoding='utf-8',timeout=180,dimensions=(50,160),echo=False)
 def settle():
  while True:
   try:vm.read_nonblocking(size=65536,timeout=1)
   except pexpect.TIMEOUT:return
 def cmd(c):
  t=secrets.token_hex(16);yes='PASS'+t;no='FAIL'+t;settle();vm.sendline(':do { '+c+'; :put ('+lit(yes)+') } on-error={ :put ('+lit(no)+') }')
  if vm.expect([re.escape(yes),re.escape(no)],timeout=120)!=0:raise RuntimeError('CHR rejected fixture command')
 def copy_file(remote, local):
  # One-off localhost SSH into the disposable CI guest. Host-key checks are
  # intentionally not a production trust model; output is never logged.
  result=subprocess.run(['sshpass','-p',password,'scp','-O','-q','-P','12222',
   '-o','StrictHostKeyChecking=no','-o','UserKnownHostsFile=/dev/null','-o','ConnectTimeout=15',
   'admin@127.0.0.1:'+remote,str(base/local)],capture_output=True,timeout=45)
  if result.returncode:raise RuntimeError('Disposable file transfer failed')
  (base/local).chmod(0o600)
 proc=None;stage='boot'
 try:
  vm.expect(r'(?i)login:');vm.sendline('admin');vm.expect(r'(?i)password:');vm.sendline('')
  for _ in range(12):
   n=vm.expect([r'(?i)do you want to see the software license',r'(?i)(?:new password|repeat new password)[^\r\n]*[>:]',r'(?i)press (?:enter|return)',r'\[admin@[^\]]+\]\s*>',r'(?i)password:']);settle()
   if n==0:vm.sendline('n')
   elif n in (1,4):vm.sendline(password)
   elif n==2:vm.sendline('')
   else:break
  else:raise RuntimeError('login')
  cmds=[
   '/ip dhcp-client set [find where interface=ether1] disabled=no', '/ip service enable ssh',
   '/interface bridge add name=guide-lan', '/interface bridge port add bridge=guide-lan interface=ether2',
   '/ip address add address=192.168.88.1/24 interface=guide-lan',
   '/certificate add name=guide-ca common-name=guide-ca key-size=2048 key-usage=key-cert-sign,crl-sign days-valid=3650',
   '/certificate sign guide-ca', ':delay 3s', '/certificate set guide-ca trusted=yes',
   '/certificate add name=guide-server common-name=vpn.example.org subject-alt-name=DNS:vpn.example.org key-size=2048 key-usage=digital-signature,key-encipherment,tls-server days-valid=365',
   '/certificate sign guide-server ca=guide-ca', ':delay 3s',
   '/certificate add name=guide-client common-name=guide-client key-size=2048 key-usage=digital-signature,tls-client days-valid=365',
   '/certificate sign guide-client ca=guide-ca', ':delay 3s',
   '/certificate export-certificate guide-ca type=pem',
   '/certificate export-certificate guide-server type=pem',
   '/certificate export-certificate guide-client type=pem export-passphrase='+keypass,
   '/ip pool add name=guide-vpn-pool ranges=10.44.0.10-10.44.0.99',
   '/ppp profile add name=guide-vpn local-address=10.44.0.1 remote-address=guide-vpn-pool',
   '/ppp secret add name=guide-user password='+authpass+' service=ovpn profile=guide-vpn',
   '/interface ovpn-server server add name=guide-ovpn protocol=tcp port=1194 mode=ip certificate=guide-server require-client-certificate=yes default-profile=guide-vpn auth=sha256 cipher=aes256-cbc disabled=no',
  ]
  for i,c in enumerate(cmds):stage='setup-'+str(i+1);cmd(c)
  for remote,local in [('cert_export_guide-ca.crt','ca.crt'),('cert_export_guide-server.crt','server.crt'),('cert_export_guide-client.crt','client.crt'),('cert_export_guide-client.key','client.key')]:
   stage='export-'+local;copy_file(remote,local)
  stage='validity-check'
  from datetime import datetime
  for name,days in [('ca.crt',3650),('server.crt',365),('client.crt',365)]:
   dates=subprocess.check_output(['openssl','x509','-in',str(base/name),'-noout','-startdate','-enddate'],text=True).splitlines()
   before=datetime.strptime(dates[0].split('=',1)[1],'%b %d %H:%M:%S %Y %Z')
   after=datetime.strptime(dates[1].split('=',1)[1],'%b %d %H:%M:%S %Y %Z')
   if (after-before).total_seconds()!=days*86400:raise RuntimeError('Certificate validity differs from example')
  if 'ENCRYPTED' not in (base/'client.key').read_text():raise RuntimeError('Client key not encrypted')
  for name,content in [('auth.txt','guide-user\n'+authpass+'\n'),('pass.txt',keypass+'\n')]:
   p=base/name;p.write_text(content);p.chmod(0o600)
  common='\n'.join(['client','dev tun','proto tcp-client','remote 127.0.0.1 18194','nobind','persist-key','persist-tun',f'ca {base}/ca.crt',f'cert {base}/client.crt',f'key {base}/client.key',f'askpass {base}/pass.txt',f'auth-user-pass {base}/auth.txt','remote-cert-tls server','verify-x509-name vpn.example.org name','cipher AES-256-CBC','data-ciphers AES-256-CBC','auth SHA256','route 192.168.88.0 255.255.255.0','verb 3'])+'\n'
  def run(config,seconds):
   nonlocal_dummy=None
   path=base/'client.ovpn';path.write_text(config);path.chmod(0o600)
   p=subprocess.Popen(['sudo','openvpn','--config',str(path)],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
   end=time.monotonic()+seconds;output=''
   # A reader thread avoids select() hiding lines already buffered by TextIO.
   import queue, threading
   events=queue.Queue()
   def reader():
    for line in p.stdout:events.put(line)
   threading.Thread(target=reader,daemon=True).start()
   while time.monotonic()<end and (p.poll() is None or not events.empty()):
    try:line=events.get(timeout=1)
    except queue.Empty:continue
    output+=line
    if 'Initialization Sequence Completed' in line:return p,output
    if 'AUTH_FAILED' in line or 'VERIFY ERROR' in line or 'VERIFY X509NAME ERROR' in line or 'certificate required' in line.lower():break
   p.terminate()
   try:p.communicate(timeout=10)
   except subprocess.TimeoutExpired:p.kill();p.communicate()
   return None,output
  stage='connect';proc,log=run(common,60)
  if proc is None:
   terms=['Options error','Cannot open TUN','TCP connection established','TLS Error','VERIFY ERROR','AUTH_FAILED','private key password verification failed','bad decrypt','unsupported','OpenSSL','Connection refused','Connection reset','No such file','Exiting due to fatal error']
   print('::notice title=OpenVPN CI categories::'+', '.join(t for t in terms if t.lower() in log.lower()),flush=True)
   raise RuntimeError('No completed tunnel')
  stage='ping-router-lan';result=subprocess.run(['ping','-c','2','-W','3','192.168.88.1'],capture_output=True,timeout=12)
  if result.returncode:raise RuntimeError('LAN-interface ping failed')
  proc.terminate();proc.communicate(timeout=10);proc=None
  stage='wrong-server-name';bad,log=run(common.replace('vpn.example.org name','wrong.example.org name'),35)
  if bad:bad.terminate();bad.communicate(timeout=10);raise RuntimeError('Incorrect server name accepted')
  if 'VERIFY ERROR' not in log and 'VERIFY X509NAME ERROR' not in log:raise RuntimeError('Negative name control inconclusive')
  stage='wrong-password';(base/'auth.txt').write_text('guide-user\nwrong-password\n');bad,log=run(common,40)
  if bad:bad.terminate();bad.communicate(timeout=10);raise RuntimeError('Incorrect password accepted')
  if 'AUTH_FAILED' not in log:raise RuntimeError('Negative password control inconclusive')
  print('::notice title=Disposable OpenVPN::RouterOS 7.23.8 generated CA (3650 days) and server/client (365 days) certificates, and validity was checked with OpenSSL; OpenVPN Linux connected and pinged router LAN address via tunnel. Wrong server name and wrong PPP password were rejected. Loopback-forwarded CI only; no WinBox, separate LAN host, public WAN or physical router tested.')
 except Exception as e:
  detail=str(e) if type(e) is RuntimeError else type(e).__name__
  print('::error title=Disposable OpenVPN::Stage '+stage+'; '+detail+'; serial and client logs withheld.',flush=True);sys.exit(1)
 finally:
  if proc:
   proc.terminate()
   try:proc.communicate(timeout=10)
   except subprocess.TimeoutExpired:proc.kill();proc.communicate()
  vm.close(force=True)
