#!/usr/bin/env node
'use strict';
// Disposable Windows GitHub runner only. Three real CHRs connected by UDP
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
const [qemu,image,root,supervisor]=process.argv.slice(2).map(x=>x&&path.resolve(x));
if(!qemu||!image||!root||!supervisor)throw Error('Missing CI paths');
const vms=[];
let stage='initialization';
function rand(n=16){return randomBytes(n).toString('hex');}
function literal(x){return '"'+x.slice(0,16)+'" . "'+x.slice(16)+'"';}
async function ports(){
  const sockets=[];
  try {
    for(let i=0;i<4;i++){
      const s=dgram.createSocket('udp4');sockets.push(s);
      await new Promise((resolve,reject)=>{s.once('error',reject);s.bind(0,'127.0.0.1',resolve);});
    }
    return sockets.map(s=>s.address().port);
  } finally {await Promise.all(sockets.map(s=>new Promise(resolve=>s.close(resolve))));}
}
async function startVm(name,links){
  const vm={name};vms.push(vm);
  await fs.mkdir(root,{recursive:true});vm.dir=await fs.mkdtemp(path.join(root,'session-'));
  vm.disk=path.join(vm.dir,'disk.img');await fs.copyFile(image,vm.disk,fsConstants.COPYFILE_EXCL);
  vm.server=net.createServer();
  await new Promise((resolve,reject)=>{vm.server.once('error',reject);vm.server.listen(0,'127.0.0.1',resolve);});
  const serial=vm.server.address().port;
  const args=['-machine','pc,accel=tcg','-m','256','-smp','1','-display','none','-monitor','none','-no-reboot','-serial',`tcp:127.0.0.1:${serial}`,'-drive',`file=${vm.disk.replace(/,/g,',,')},format=raw,if=ide`];
  links.forEach(([local,remote],i)=>args.push('-netdev',`socket,id=n${i},udp=127.0.0.1:${remote},localaddr=127.0.0.1:${local}`,'-device',`e1000,netdev=n${i}`));
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
  await vm.console.initialize('Lab_'+rand(20));
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
  const [left,right,lanLeft,lanRight]=await ports();
  stage='server boot';const server=await startVm('server',[[left,right],[lanLeft,lanRight]]);
  stage='client boot';const client=await startVm('client',[[right,left]]);
  stage='LAN host boot';const lan=await startVm('lan',[[lanRight,lanLeft]]);
  const pair=generateKeyPairSync('x25519');
  const peerPublic=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
  const peerPrivate=pair.privateKey.export({format:'der',type:'pkcs8'}).subarray(-32).toString('base64');
  const state={devices:[
    {id:'i',type:'isp',name:'CI ISP',cfg:{kind:'static',priority:'primary',ip:'198.51.100.2/30',gw:'198.51.100.1',dns:'1.1.1.1'}},
    {id:'r',type:'router',name:'CI server',cfg:{lan:'192.168.88.0/24',gw:'192.168.88.1',dhcp:true,nat:true,firewall:true,vpn:true,vpnType:'wireguard',vpnPort:'13231',vpnPool:'10.10.10.0/24',vpnPeer:peerPublic,routerFailover:false,wanFailover:false}},
    {id:'p',type:'pc',name:'CI PC',cfg:{mode:'dhcp'}}
  ],links:[{a:'i',b:'r'},{a:'r',b:'p'}]};
  const result=engine.run(state);assert.deepStrictEqual(result.errors,[]);
  stage='server configuration';await server.command('/ip dhcp-client disable [find]');
  for(const group of result.groups.filter(g=>g.id!=='verify'))for(const line of group.code.split('\n').filter(x=>x&&!x.startsWith('#')))await server.command(line);
  stage='server public key';const serverPublic=await publicKey(server);
  stage='VPN client configuration';await client.command('/ip dhcp-client disable [find]');
  for(const line of [
    '/ip address add address=198.51.100.1/30 interface=ether1',
    '/interface wireguard add name=wg-client listen-port=13232 private-key="'+peerPrivate+'"',
    '/ip address add address=10.10.10.2/24 interface=wg-client',
    '/ip route add dst-address=192.168.88.0/24 gateway=wg-client',
    '/interface wireguard peers add interface=wg-client public-key="'+serverPublic+'" allowed-address=10.10.10.1/32,192.168.88.0/24 endpoint-address=198.51.100.2 endpoint-port=13231 persistent-keepalive=5s'
  ])await client.command(line);
  stage='LAN host configuration';await lan.command('/ip dhcp-client disable [find]');
  await lan.command('/ip address add address=192.168.88.2/24 interface=ether1');
  await lan.command('/ip route add dst-address=10.10.10.0/24 gateway=192.168.88.1');
  stage='unsolicited LAN to VPN';await ping(lan,'10.10.10.2',false);
  stage='VPN address';await ping(client,'10.10.10.1',true);
  stage='forward to LAN host';await ping(client,'192.168.88.2',true);
  stage='disabled peer';await server.command('/interface wireguard peers disable [find]');await ping(client,'10.10.10.1',false);
  console.log('::notice title=Windows isolated WireGuard tunnel::Three disposable CHRs on a Windows runner: VPN client reached a separate LAN VM; unsolicited LAN-to-VPN ping and a disabled server peer were blocked. No external network, inbound host forwarding or application GUI tested.');
})().catch(err=>{console.log('::error title=Windows WireGuard tunnel::'+stage+': '+String(err.message).replace(/[\r\n%]/g,' '));process.exitCode=1;}).finally(async()=>{
  for(const vm of vms.reverse())try{await stopVm(vm);}catch(_){console.log('::error title=Windows WireGuard cleanup::Failed to remove a disposable session');process.exitCode=1;}
});
