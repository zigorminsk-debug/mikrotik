#!/usr/bin/env python3
"""CI only. Compare real WinBox IP and MAC logins to one isolated disposable CHR.
Only fixed result flags and packet *counts* are emitted. Never persist or print
packets, raw WinBox logs, serial output, credentials or the disposable disk.
"""
import collections, errno, json, os, pathlib, secrets, shutil, socket, struct, subprocess, sys, threading, time
import pexpect

base=None;disk=None;winbox=None;password=None
vm=None;stop=threading.Event();counts=collections.Counter();lock=threading.Lock()
router=bytes.fromhex('021122334455')

def capture_counts():
    # No payload is written. UDP type is a single framing byte, not auth data.
    sock=socket.socket(socket.AF_PACKET,socket.SOCK_RAW,socket.htons(3));sock.bind(('tap0',0));sock.settimeout(0.2)
    try:
        while not stop.is_set():
            try:p=sock.recv(4096)
            except socket.timeout:continue
            if len(p)<34 or p[12:14]!=b'\x08\x00':continue
            side='router' if p[6:12]==router else 'client'
            off=14+(p[14]&15)*4
            if len(p)<off+8:continue
            proto=p[23];src,dst=struct.unpack('!HH',p[off:off+4])
            key=None
            if proto==17 and 20561 in (src,dst):
                typ=p[off+9] if len(p)>off+9 and p[off+8]==1 else 254
                dst_ip=p[30:34]
                dest={b'\xff\xff\xff\xff':'limited_broadcast',b'\xc0\x00\x02\xff':'subnet_broadcast',b'\xc0\x00\x02\x01':'host_unicast',b'\xc0\x00\x02\x02':'router_unicast',b'\x00\x00\x00\x00':'zero'}.get(dst_ip,'other')
                key=side+'_mac_'+({0:'start',1:'data',2:'ack',4:'ping',5:'pong',255:'end'}.get(typ,'other'))+'_to_'+dest
            elif proto==6 and 8291 in (src,dst):key=side+'_tcp_winbox'
            if key:
                with lock:counts[key]+=1
    finally:sock.close()

def snapshot():
    with lock:return counts.copy()

def settle():
    while True:
        try:vm.read_nonblocking(size=65536,timeout=0.7)
        except pexpect.TIMEOUT:return

def command(line):
    token=secrets.token_hex(16);ok='OK'+token;bad='ERR'+token
    def lit(s):return '"'+s[:16]+'" . "'+s[16:]+'"'
    settle();vm.sendline(':do { '+line+'; :put ('+lit(ok)+') } on-error={:put ('+lit(bad)+')}')
    if vm.expect([ok,bad],timeout=45):raise RuntimeError('setup rejected')

def probe(target,label):
    # Inputs are supplied through stdin / environment; never in process arguments.
    env=os.environ.copy();env['WB_TARGET']=target;env['WB_TEMP_PASS']=password;env['QT_X11_NO_MITSHM']='1'
    home=base/('home-'+label);home.mkdir(exist_ok=True);env['HOME']=str(home)
    before=snapshot()
    proc=subprocess.run(['xvfb-run','-a','-s','-screen 0 1440x900x24','/usr/bin/python3',__file__,'gui',str(winbox),str(base)],env=env,capture_output=True,text=True,timeout=150)
    after=snapshot();delta=after-before
    # GUI worker emits only fixed words, never raw log or credentials.
    state=proc.stdout.strip()
    if state not in ('workspace','auth_only','no_auth','gui_error'):state='gui_error'
    print('::notice title=WinBox '+label+'::state='+state+'; packet counts='+','.join(k+':'+str(delta[k]) for k in sorted(delta)),flush=True)
    shutil.rmtree(home,ignore_errors=True)
    return state

def probe_tik(label,helper,wrong_password=False):
    before=snapshot()
    payload=json.dumps({'mac':'02:11:22:33:44:55','password':('wrong_'+secrets.token_hex(8)) if wrong_password else password})+'\n'
    try:
        result=subprocess.run([str(base/helper/'mac-readonly-ci')],input=payload,text=True,capture_output=True,timeout=95)
        response=json.loads(result.stdout.strip().splitlines()[-1])
        category=response.get('category','Other')
        if category not in ('Other','NoUsableNic','ChallengeNone','BadChallenge','NoConfirmation'):category='Other'
        state='read_ok' if result.returncode==0 and response.get('ok') is True else category
    except Exception:state='client_error'
    delta=snapshot()-before
    print('::notice title=Third-party '+label+'::state='+state+'; packet counts='+','.join(k+':'+str(delta[k]) for k in sorted(delta)),flush=True)
    return state

def probe_forged(label,helper,variant):
    # The real mac-server is disabled before this test. Listen only on this
    # isolated host; construct a header ACK in memory using the client's own
    # transient test header. Never record datagrams, session IDs or passwords.
    udp=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
    udp.setsockopt(socket.SOL_SOCKET,socket.SO_BROADCAST,1)
    udp.bind(('0.0.0.0',20561));udp.settimeout(0.2)
    child=None;early_data=False;injected=False
    try:
        child=subprocess.Popen([str(base/helper/'mac-readonly-ci')],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,text=True)
        child.stdin.write(json.dumps({'mac':'02:11:22:33:44:55','password':password})+'\n');child.stdin.close()
        deadline=time.monotonic()+6
        while time.monotonic()<deadline:
            try:packet,addr=udp.recvfrom(2048)
            except socket.timeout:continue
            if len(packet)<22 or packet[0]!=1:continue
            if packet[1]==0:
                ack=bytearray(22);ack[0]=1;ack[1]=2
                ack[2:8]=packet[8:14];ack[8:14]=packet[2:8]
                ack[14:16]=packet[16:18];ack[16:18]=packet[14:16]
                if variant=='router':ack[2]^=2
                elif variant=='destination':ack[8]^=2
                elif variant=='session':ack[16]^=1
                elif variant=='client_type':ack[14]^=1
                elif variant=='version':ack[0]=2
                udp.sendto(ack,('255.255.255.255',addr[1]));injected=True
            elif packet[1]==1 and injected:early_data=True;break
        state='early_data' if early_data else ('no_data' if injected else 'not_injected')
        print('::notice title=Forged '+label+'::state='+state,flush=True)
        return state
    finally:
        udp.close()
        if child:
            child.kill();child.wait()


def gui():
    # The caller supplies the target/password via inherited environment. No
    # log escapes the worker: it may contain sensitive Qt application data.
    exe=sys.argv[2];base=pathlib.Path(sys.argv[3]);log=base/'winbox-private.log';p=None
    try:
        with log.open('w') as f:
            p=subprocess.Popen([exe],stdout=f,stderr=subprocess.STDOUT)
            time.sleep(22)
            win=subprocess.check_output(['xdotool','search','--onlyvisible','--pid',str(p.pid)],stderr=subprocess.DEVNULL,text=True).splitlines()[0]
            def x(*args,stdin=None):subprocess.run(['xdotool',*args],input=stdin,text=True,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            x('windowfocus','--sync',win)
            x('mousemove','--sync','330','392');x('click','1');x('key','ctrl+a')
            x('type','--clearmodifiers','--file','-',stdin=os.environ['WB_TARGET'])
            x('mousemove','--sync','330','443');x('click','1');x('key','ctrl+a')
            x('type','--clearmodifiers','--file','-',stdin=os.environ['WB_TEMP_PASS'])
            x('mousemove','--sync','310','545');x('click','1')
            state='no_auth'
            for _ in range(90):
                time.sleep(1);text=log.read_text(errors='replace')
                if 'Auth OK' in text:
                    state='auth_only'
                    if 'WBOXSESS,INFO: first clock synced' in text:state='workspace';break
                if p.poll() is not None:break
            print(state)
    except Exception:print('gui_error')
    finally:
        if p:
            p.terminate()
            try:p.wait(timeout=5)
            except subprocess.TimeoutExpired:p.kill();p.wait()
        log.unlink(missing_ok=True)

if len(sys.argv)>1 and sys.argv[1]=='gui':gui();raise SystemExit(0)
base=pathlib.Path(sys.argv[1]);disk=base/'control-disk.img';shutil.copyfile(base/'chr-7.23.8.img',disk)
winbox=next((p for p in (base/'winbox').rglob('*') if p.is_file() and p.name.lower()=='winbox'),None)
if not winbox:raise SystemExit('WinBox not found')
winbox.chmod(winbox.stat().st_mode|0o111)
password='DisposableCI_'+secrets.token_hex(12)
try:
    vm=pexpect.spawn('qemu-system-x86_64',['-machine','pc,accel=tcg','-m','256','-smp','1','-nographic','-no-reboot','-drive',f'file={disk},format=raw,if=ide','-netdev','tap,id=n0,ifname=tap0,script=no,downscript=no','-device','e1000,netdev=n0,mac=02:11:22:33:44:55'],encoding='utf-8',timeout=180,echo=False)
    vm.expect(r'(?i)login:');vm.sendline('admin');vm.expect(r'(?i)password:');vm.sendline('')
    for _ in range(12):
        n=vm.expect([r'(?i)do you want to see the software license',r'(?i)(?:new password|repeat new password)[^\r\n]*[>:]',r'(?i)press (?:enter|return)',r'\[admin@[^\]]+\]\s*>',r'(?i)password:']);settle()
        if n==0:vm.sendline('n')
        elif n in (1,4):vm.sendline(password)
        elif n==2:vm.sendline('')
        else:break
    else:raise RuntimeError('initialisation incomplete')
    # Set the known one-use password explicitly, independent of wizard prompts.
    command('/user set [find where name="admin"] password="'+password+'"')
    command('/ip dhcp-client disable [find]')
    command('/tool mac-server mac-winbox set allowed-interface-list=all')
    command('/ip neighbor discovery-settings set discover-interface-list=all')
    command('/ip address add address=192.0.2.2/24 interface=ether1')
    command('/ip service enable winbox')
    thread=threading.Thread(target=capture_counts,daemon=True);thread.start()
    command('/tool mac-server mac-winbox set allowed-interface-list=none')
    test_valid=probe_forged('filtered-valid-control','helper-filtered','valid')
    test_original=probe_forged('wildcard-wrong-session','helper-wildcard','session')
    negatives={kind:probe_forged('filtered-wrong-'+kind,'helper-filtered',kind) for kind in ('router','destination','session','client_type','version')}
    command('/tool mac-server mac-winbox set allowed-interface-list=all')
    ip=probe('192.0.2.2','IP-control')
    mac=probe('02:11:22:33:44:55','MAC-with-IP')
    tik_with_ip=probe_tik('original-with-IP','helper-original')
    patched_with_ip=probe_tik('wildcard-with-IP','helper-wildcard')
    command('/ip address remove [find where address="192.0.2.2/24"]')
    mac_no_ip=probe('02:11:22:33:44:55','MAC-without-IP')
    tik_no_ip=probe_tik('original-without-IP','helper-original')
    patched_no_ip=probe_tik('wildcard-without-IP','helper-wildcard')
    wrong=probe_tik('wildcard-wrong-password','helper-wildcard',wrong_password=True)
    filtered=probe_tik('filtered-without-IP','helper-filtered')
    if ip!='workspace':raise RuntimeError('IP control did not reach a verified workspace; MAC result inconclusive')
    if mac!='workspace' or mac_no_ip!='workspace':raise RuntimeError('An official MAC test did not reach a verified workspace; see packet counts')
    if test_valid!='early_data' or test_original!='early_data':raise RuntimeError('Forged ACK test controls did not trigger the expected early DATA')
    if any(value!='no_data' for value in negatives.values()):raise RuntimeError('Filtered receive accepted a forged ACK or injection was inconclusive')
    if filtered!='read_ok':raise RuntimeError('Filtered experiment did not read the real CHR')
    if wrong=='read_ok':raise RuntimeError('Wrong-password test unexpectedly read the resource')
    if patched_with_ip!='read_ok' or patched_no_ip!='read_ok':raise RuntimeError('Wildcard research client did not read CHR in both MAC-only conditions')
    print('::notice title=Control conclusion::Official WinBox authenticated via MAC with and without IPv4; CI-only filtered experiment also read a resource and rejected selected forged ACK headers. These single-NIC Linux experiments are not production fixes or physical/Windows tests.')
except Exception as exc:
    reason=(str(exc) if isinstance(exc,RuntimeError) else ('OS error '+errno.errorcode.get(exc.errno,'unknown') if isinstance(exc,OSError) else type(exc).__name__))
    print('::error title=WinBox control::'+reason,flush=True)
    raise SystemExit(1) from None
finally:
    stop.set()
    if vm:vm.close(force=True)
    disk.unlink(missing_ok=True)
    (base/'winbox-private.log').unlink(missing_ok=True)
    for name in ('home-IP-control','home-MAC-with-IP','home-MAC-without-IP'):shutil.rmtree(base/name,ignore_errors=True)
