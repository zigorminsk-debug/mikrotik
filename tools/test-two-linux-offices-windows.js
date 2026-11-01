#!/usr/bin/env node
'use strict';
// CI-only: two real CHR routers and two CirrOS Linux guests connected by UDP
// sockets bound to loopback. Not an application networking feature.
const assert=require('assert');
const fs=require('fs').promises;
const fsConstants=require('fs').constants;
const path=require('path');
const net=require('net');
const dgram=require('dgram');
const {spawn}=require('child_process');
const {randomBytes,generateKeyPairSync}=require('crypto');
const {ChrConsole}=require('../windows/chr/console');
const engine=require('../app/js/lab-sim');
const [qemu,image,root,supervisor,linuxImage]=process.argv.slice(2).map(x=>x&&path.resolve(x));
if(!qemu||!image||!root||!supervisor||!linuxImage)throw Error('Missing CI paths');
const vms=[];
let stage='initialization';
function rand(n=16){return randomBytes(n).toString('hex');}
function literal(x){return '"'+x.slice(0,16)+'" . "'+x.slice(16)+'"';}
async function ports(){
  const sockets=[];
  try {
    for(let i=0;i<6;i++){
      const s=dgram.createSocket('udp4');sockets.push(s);
      await new Promise((resolve,reject)=>{s.once('error',reject);s.bind(0,'127.0.0.1',resolve);});
    }
    return sockets.map(s=>s.address().port);
  } finally {await Promise.all(sockets.map(s=>new Promise(resolve=>s.close(resolve))));}
}
async function startVm(name,links,linux=false){
  const vm={name};vms.push(vm);
  await fs.mkdir(root,{recursive:true});vm.dir=await fs.mkdtemp(path.join(root,'session-'));
  vm.disk=path.join(vm.dir,'disk.img');await fs.copyFile(linux?linuxImage:image,vm.disk,fsConstants.COPYFILE_EXCL);
  vm.server=net.createServer();
  await new Promise((resolve,reject)=>{vm.server.once('error',reject);vm.server.listen(0,'127.0.0.1',resolve);});
  const serial=vm.server.address().port;
  const args=['-machine','pc,accel=tcg','-m','256','-smp','1','-display','none','-monitor','none','-no-reboot','-serial',`tcp:127.0.0.1:${serial}`,'-drive',`file=${vm.disk.replace(/,/g,',,')},format=${linux?'qcow2':'raw'},if=${linux?'virtio':'ide'}`];
  const macSuffix={'router-a':'01','router-b':'02','host-a':'03','host-b':'04'}[name];if(!macSuffix)throw Error('Unknown test node');
  links.forEach(([local,remote],i)=>args.push('-netdev',`socket,id=n${i},udp=127.0.0.1:${remote},localaddr=127.0.0.1:${local}`,'-device',`e1000,netdev=n${i},mac=52:54:00:10:${macSuffix}:0${i+1}`));
  let timer;
  const accepted=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('Serial connection timeout')),60000);
    vm.server.once('connection',s=>{clearTimeout(timer);resolve(s);});
    vm.server.once('error',()=>{clearTimeout(timer);reject(Error('Serial connection error'));});
  });
  vm.proc=spawn(supervisor,[vm.disk,qemu,...args],{stdio:['pipe','ignore','ignore'],windowsHide:true});
  vm.proc.stdin.on('error',()=>{});
  vm.exit=new Promise(resolve=>{vm.proc.once('error',()=>resolve());vm.proc.once('exit',()=>resolve());});
  const socket=await Promise.race([accepted,vm.exit.then(()=>{throw Error('QEMU exited before serial connection');})]).finally(()=>clearTimeout(timer));
  vm.server.close();vm.console=new ChrConsole(socket);
  if(linux)await linuxLogin(vm.console);else await vm.console.initialize('Lab_'+rand(20));
  return vm.console;
}
async function stopVm(vm){
  if(vm.console)vm.console.close();
  if(vm.server&&vm.server.listening)vm.server.close();
  if(vm.proc&&vm.proc.exitCode===null&&vm.proc.signalCode===null)vm.proc.stdin.end();
  if(vm.exit){
    let timer;const done=await Promise.race([vm.exit.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),10000);})]);clearTimeout(timer);
    if(!done){vm.proc.kill();await vm.exit;}
  }
  if(vm.dir)await fs.rm(vm.dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
async function linuxLogin(c){await c.expect(/login:\s*$/im,180000);await c.settle();c.send('cirros');await c.expect(/password:\s*$/im,30000);await c.settle();c.send('gocubsgo');await c.expect(/\$\s*$/m,30000);await c.settle();}
async function linuxCommand(c,cmd,expected=0){const token='LNX'+rand(),a=token.slice(0,16),b=token.slice(16);await c.settle();c.send(cmd+`; result=$?; printf '%s%s%sEND\\n' '${a}' '${b}' "$result"`);const match=await c.expect(new RegExp(token+'[0-9]+END'),60000);assert.equal(Number(match.slice(token.length,-3)),expected,'Unexpected Linux command exit status');}
async function linuxPing(c,address,success){if(!/^192\.168\.(?:10|20)\.10$/.test(address))throw Error('Invalid fixed test destination');await linuxCommand(c,'ping -c 3 -W 2 '+address+' >/dev/null',success?0:1);}
async function publicKey(c){
  const token=rand(3),start='WG'+token,end='END'+token;
  await c.settle();c.send(':put ('+literal(start)+' . [/interface wireguard get [find where name="wg-lab"] public-key] . '+literal(end)+')');
  const text=await c.expect(new RegExp(start+'[A-Za-z0-9+/]{43}='+end),30000);
  return text.slice(start.length,-end.length);
}
async function ping(c,address,expected){
  const yes='PINGOK'+rand(),no='PINGERR'+rand();
  await c.settle();c.send(':do { :local n [/ping '+address+' count=5 interval=1s]; :if ($n > 0) do={:put ('+literal(yes)+')} else={:put ('+literal(no)+')} } on-error={:put ('+literal(no)+')}');
  const result=await c.expect(new RegExp(yes+'|'+no),60000);
  if((result===yes)!==expected)throw Error('Unexpected ICMP result');
}
(async()=>{
  const [wa,wb,ra,ha,rb,hb]=await ports();
  stage='office A router boot';const a=await startVm('router-a',[[wa,wb],[ra,ha]]);
  stage='office B router boot';const b=await startVm('router-b',[[wb,wa],[rb,hb]]);
  const keypair=()=>{const pair=generateKeyPairSync('x25519');return {public:pair.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64'),private:pair.privateKey.export({format:'der',type:'pkcs8'}).subarray(-32).toString('base64')};};
  const ka=keypair(),kb=keypair();
  stage='office A configuration';for(const line of [
   '/ip dhcp-client remove [find]',
   '/ip address add address=198.51.100.1/30 interface=ether1',
   '/ip address add address=192.168.10.1/24 interface=ether2',
   '/ip pool add name=pool-lab ranges=192.168.10.100-192.168.10.110',
   '/ip dhcp-server network add address=192.168.10.0/24 gateway=192.168.10.1',
   '/ip dhcp-server add name=dhcp-lab interface=ether2 address-pool=pool-lab disabled=no',
   '/interface wireguard add name=wg-office listen-port=13231 private-key="'+ka.private+'"',
   '/ip address add address=10.99.0.1/30 interface=wg-office',
   '/interface wireguard peers add interface=wg-office public-key="'+kb.public+'" allowed-address=10.99.0.2/32,192.168.20.0/24 endpoint-address=198.51.100.2 endpoint-port=13232 persistent-keepalive=5s',
   '/ip route add dst-address=192.168.20.0/24 gateway=wg-office comment=route-office-b',
   '/ip firewall filter add chain=forward in-interface=wg-office action=drop disabled=yes comment=block-tunnel'
  ])await a.command(line);
  stage='office B configuration';for(const line of [
   '/ip dhcp-client remove [find]',
   '/ip address add address=198.51.100.2/30 interface=ether1',
   '/ip address add address=192.168.20.1/24 interface=ether2',
   '/ip pool add name=pool-lab ranges=192.168.20.100-192.168.20.110',
   '/ip dhcp-server network add address=192.168.20.0/24 gateway=192.168.20.1',
   '/ip dhcp-server add name=dhcp-lab interface=ether2 address-pool=pool-lab disabled=no',
   '/interface wireguard add name=wg-office listen-port=13232 private-key="'+kb.private+'"',
   '/ip address add address=10.99.0.2/30 interface=wg-office',
   '/interface wireguard peers add interface=wg-office public-key="'+ka.public+'" allowed-address=10.99.0.1/32,192.168.10.0/24 endpoint-address=198.51.100.1 endpoint-port=13231 persistent-keepalive=5s',
   '/ip route add dst-address=192.168.10.0/24 gateway=wg-office comment=route-office-a'
  ])await b.command(line);
  stage='office A Linux boot';const hostA=await startVm('host-a',[[ha,ra]],true);
  stage='office B Linux boot';const hostB=await startVm('host-b',[[hb,rb]],true);
  stage='Linux host addresses and routes';
  for(const [host,ip,gw] of [[hostA,'192.168.10.10','192.168.10.1'],[hostB,'192.168.20.10','192.168.20.1']]) {
   await linuxCommand(host,'sudo dhcpcd -k eth0 >/dev/null 2>&1 || true');
   await linuxCommand(host,'sudo ip addr flush dev eth0 && sudo ip addr add '+ip+'/24 dev eth0 && sudo ip link set eth0 up && sudo ip route add default via '+gw);
  }
  stage='office A to B';await linuxPing(hostA,'192.168.20.10',true);
  stage='office B to A';await linuxPing(hostB,'192.168.10.10',true);
  stage='peer disabled negative';await a.command('/interface wireguard peers disable [find]');await linuxPing(hostB,'192.168.10.10',false);
  stage='peer restored';await a.command('/interface wireguard peers enable [find]');await b.command('/interface wireguard peers disable [find]');await b.command('/interface wireguard peers enable [find]');await linuxPing(hostB,'192.168.10.10',true);
  stage='firewall disabled passage negative';await a.command('/ip firewall filter enable [find comment=block-tunnel]');await linuxPing(hostB,'192.168.10.10',false);
  stage='firewall restored';await a.command('/ip firewall filter disable [find comment=block-tunnel]');await linuxPing(hostB,'192.168.10.10',true);
  stage='route disabled negative';await a.command('/ip route disable [find comment=route-office-b]');await linuxPing(hostA,'192.168.20.10',false);
  stage='route restored';await a.command('/ip route enable [find comment=route-office-b]');await linuxPing(hostA,'192.168.20.10',true);
  console.log('::notice title=Two Linux offices through WireGuard::Two disposable CHR routers and two separate CirrOS Linux guests: bidirectional ICMP between LAN hosts through WireGuard, plus disabled peer, firewall drop and missing route controls and recovery. CI-only fixed topology; no application GUI, physical devices or public internet.');
})().catch(err=>{console.log('::error title=Two Linux offices experiment::'+stage+': '+String(err.message).replace(/[\r\n%]/g,' '));process.exitCode=1;}).finally(async()=>{
  for(const vm of vms.reverse())try{await stopVm(vm);}catch(_){console.log('::error title=Windows WireGuard cleanup::Failed to remove a disposable session');process.exitCode=1;}
});
