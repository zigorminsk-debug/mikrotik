#!/usr/bin/env node
'use strict';
// CI-only experiment. One RouterOS CHR and two independent CirrOS guests,
// connected solely by loopback QEMU UDP Ethernet links. No app integration.
const assert=require('assert');
const fs=require('fs').promises,constants=require('fs').constants,path=require('path'),net=require('net'),dgram=require('dgram');
const {spawn}=require('child_process'),{randomBytes}=require('crypto');
const {ChrConsole}=require('../windows/chr/console'),{pingConsole}=require('../windows/chr/ping');
const {EthernetHub}=require('../windows/chr/ethernet-hub');
const {LinuxGuest}=require('../windows/chr/linux-guest');
const [qemu,chrImage,linuxImage,root,supervisor]=process.argv.slice(2).map(x=>x&&path.resolve(x));
if(!qemu||!chrImage||!linuxImage||!root||!supervisor)throw Error('Missing CI-only paths');
const vms=[],guests=[];let stage='initialization',hub;const mode=process.env.CI_L2_MODE || 'direct';if(!['direct','hub'].includes(mode))throw Error('Invalid CI L2 mode');
async function ports(count){const sockets=[];try{for(let i=0;i<count;i++){const s=dgram.createSocket('udp4');sockets.push(s);await new Promise((ok,no)=>{s.once('error',no);s.bind(0,'127.0.0.1',ok);});}return sockets.map(s=>s.address().port);}finally{await Promise.all(sockets.map(s=>new Promise(ok=>s.close(ok))));}}
async function startVm(name,image,format,links){
 const vm={name};vms.push(vm);await fs.mkdir(root,{recursive:true});vm.dir=await fs.mkdtemp(path.join(root,'session-'));vm.disk=path.join(vm.dir,'disk.img');await fs.copyFile(image,vm.disk,constants.COPYFILE_EXCL);
 vm.server=net.createServer();await new Promise((ok,no)=>{vm.server.once('error',no);vm.server.listen(0,'127.0.0.1',ok);});
 const args=['-machine','pc,accel=tcg','-m','256','-smp','1','-display','none','-monitor','none','-no-reboot','-serial',`tcp:127.0.0.1:${vm.server.address().port}`,'-drive',`file=${vm.disk.replace(/,/g,',,')},format=${format},if=${format==='raw'?'ide':'virtio'}`];
 links.forEach(([local,remote,mac],i)=>args.push('-netdev',`socket,id=n${i},udp=127.0.0.1:${remote},localaddr=127.0.0.1:${local}`,'-device',`e1000,netdev=n${i},mac=${mac}`));
 let timer;const accepted=new Promise((ok,no)=>{timer=setTimeout(()=>no(Error('Serial timeout')),60000);vm.server.once('connection',ok);vm.server.once('error',no);});
 vm.proc=spawn(supervisor,[vm.disk,qemu,...args],{stdio:['pipe','ignore','ignore'],windowsHide:true});vm.proc.stdin.on('error',()=>{});
 vm.exit=new Promise(ok=>{vm.proc.once('error',ok);vm.proc.once('exit',ok);});
 const socket=await Promise.race([accepted,vm.exit.then(()=>{throw Error('QEMU exited before serial connection');})]).finally(()=>clearTimeout(timer));vm.server.close();vm.console=new ChrConsole(socket,{timeout:180000});return vm.console;
}
async function stopVm(vm){if(vm.console)vm.console.close();if(vm.server&&vm.server.listening)vm.server.close();if(vm.proc&&vm.proc.exitCode===null&&vm.proc.signalCode===null)vm.proc.stdin.end();if(vm.exit){let timer;const done=await Promise.race([vm.exit.then(()=>true),new Promise(ok=>{timer=setTimeout(()=>ok(false),10000);})]);clearTimeout(timer);if(!done){vm.proc.kill();await vm.exit;}}if(vm.dir)await fs.rm(vm.dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
async function linuxLogin(c){await c.expect(/login:\s*$/im,180000);await c.settle();c.send('cirros');await c.expect(/password:\s*$/im,30000);await c.settle();c.send('gocubsgo');await c.expect(/\$\s*$/m,30000);await c.settle();}
async function linuxCommand(c,cmd,expected=0){const token='LNX'+randomBytes(16).toString('hex'),a=token.slice(0,16),b=token.slice(16);await c.settle();c.send(cmd+`; result=$?; printf '%s%s%sEND\\n' '${a}' '${b}' "$result"`);const match=await c.expect(new RegExp(token+'[0-9]+END'),60000);const result=Number(match.slice(token.length,-3));assert.equal(result,expected,'Unexpected Linux command exit status');}
(async()=>{
 const [r1,p1,r2,p2]=await ports(4);
 let routerLinks=[[r1,p1,'52:54:00:00:01:01'],[r2,p2,'52:54:00:00:01:02']], pcLink=[p1,r1,'52:54:00:00:02:01'],serverLink=[p2,r2,'52:54:00:00:02:02'];
 if(mode==='hub'){hub=await EthernetHub.create();for(const port of [r1,p1,p2])hub.addPeer(port);routerLinks=[[r1,hub.port,'52:54:00:00:01:01']];pcLink=[p1,hub.port,'52:54:00:00:02:01'];serverLink=[p2,hub.port,'52:54:00:00:02:02'];}
 stage='CHR boot';const router=await startVm('router',chrImage,'raw',routerLinks);await router.initialize('Lab_'+randomBytes(20).toString('hex'));
 stage='CHR bridge and DHCP';const cmds=['/ip dhcp-client remove [find]','/interface bridge add name=bridge-lab','/interface bridge port add bridge=bridge-lab interface=ether1'];
 if(mode==='direct')cmds.push('/interface bridge port add bridge=bridge-lab interface=ether2');
 cmds.push('/ip address add address=192.168.88.1/24 interface=bridge-lab','/ip pool add name=pool-lab ranges=192.168.88.100-192.168.88.150','/ip dhcp-server network add address=192.168.88.0/24 gateway=192.168.88.1','/ip dhcp-server add name=dhcp-lab interface=bridge-lab address-pool=pool-lab disabled=no');
 for(const cmd of cmds)await router.command(cmd);
 stage='first Linux boot';const pc=new LinuxGuest({qemu,image:linuxImage,tempRoot:root,supervisor,localPort:pcLink[0],hubPort:pcLink[1],mac:pcLink[2]});guests.push(pc);await pc.start();
 stage='second Linux boot';const server=new LinuxGuest({qemu,image:linuxImage,tempRoot:root,supervisor,localPort:serverLink[0],hubPort:serverLink[1],mac:serverLink[2]});guests.push(server);await server.start();
 stage='DHCP leases';for(const guest of guests){assert(/^192\.168\.88\.1(?:0[0-9]|[1-4][0-9]|50)$/.test(await guest.address()));assert.deepStrictEqual(await guest.ping('192.168.88.1'),{sent:3,received:3});}
 stage='Linux static addresses';await pc.setStatic('192.168.88.10','192.168.88.1');await server.setStatic('192.168.88.20','192.168.88.1');assert.equal(await pc.address(),'192.168.88.10');assert.equal(await server.address(),'192.168.88.20');
 stage='PC to router';assert.deepStrictEqual(await pc.ping('192.168.88.1'),{sent:3,received:3});
 stage='PC to server';assert.deepStrictEqual(await pc.ping('192.168.88.20'),{sent:3,received:3});
 stage='server to PC';assert.deepStrictEqual(await server.ping('192.168.88.10'),{sent:3,received:3});
 stage='Router to PC';assert.equal((await pingConsole(router,'192.168.88.10')).received,3);
 stage='Router to server';assert.equal((await pingConsole(router,'192.168.88.20')).received,3);
 stage='negative server NIC down';await linuxCommand(server.console,'sudo ip link set eth0 down');assert.deepStrictEqual(await pc.ping('192.168.88.20'),{sent:3,received:0});assert.equal((await pingConsole(router,'192.168.88.20')).received,0);
 stage='NIC restore';await linuxCommand(server.console,'sudo ip link set eth0 up');assert.deepStrictEqual(await pc.ping('192.168.88.20'),{sent:3,received:3});
 console.log('::notice title=Real Linux client and CHR ping::Two CirrOS Linux guests and one CHR were linked by isolated loopback virtual Ethernet (mode: '+mode+'). Guests acquired DHCP leases then used static addresses; PC and server pinged each other in both directions; each pinged the router or was pinged by it. Disabling and restoring the server NIC gave negative and recovery controls. CI-only static fixture, no app integration, VPN, public internet or physical devices.');
})().catch(err=>{console.log('::error title=Linux endpoints experiment::'+stage+': '+String(err.message).replace(/[\r\n%]/g,' '));for(const vm of guests){if(vm.console){const text=vm.console.buffer.replace(/letsgocubs|gocubsgo/gi,'[fixture-password]').replace(/\x1b\[[0-9;?]*[A-Za-z]/g,'').replace(/[\r\n%]/g,' ').slice(-3500);console.log('::warning title=Disposable Linux boot console::'+text);}}process.exitCode=1;}).finally(async()=>{for(const guest of guests.reverse())try{await guest.stop();}catch(_){console.log('::error title=Linux cleanup::Failed to remove a disposable Linux session');process.exitCode=1;}for(const vm of vms.reverse())try{await stopVm(vm);}catch(_){console.log('::error title=VM cleanup::Failed to remove a disposable session');process.exitCode=1;}if(hub)await hub.close();});
