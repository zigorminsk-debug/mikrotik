#!/usr/bin/env node
'use strict';
// Disposable Windows CI only: WinBox-MAC client and a real CHR, connected via
// a localhost UDP/Ethernet shim. No real NIC, router, credentials or writes.
const fs=require('fs').promises, fsConstants=require('fs').constants;
const net=require('net'), dgram=require('dgram'),path=require('path');
const {spawn}=require('child_process'),{randomBytes}=require('crypto');
const {ChrConsole}=require('../windows/chr/console');
const framing=require('./mac-loopback-frame');
const [qemu,image,root,supervisor,helper]=process.argv.slice(2).map(x=>x&&path.resolve(x));
if(!qemu||!image||!root||!supervisor||!helper)throw Error('Missing CI arguments');
const target='02:11:22:33:44:55',password='TemporaryCI_'+randomBytes(16).toString('hex');
let vm,conn,dir,serial,eth,proxy,exitPromise;const clients=new Set();let sent=0,received=0,stage='initialization';
const listen=(s,port)=>new Promise((resolve,reject)=>{s.once('error',reject);s.bind(port,'127.0.0.1',()=>{s.removeListener('error',reject);resolve();});});
async function unusedPort(){const s=dgram.createSocket('udp4');await listen(s,0);const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function readOnly(pass,mac=target){
 const proc=spawn(helper,[],{stdio:['pipe','pipe','ignore'],windowsHide:true});
 let stdout='';proc.stdout.setEncoding('utf8');proc.stdout.on('data',x=>{stdout+=x;if(stdout.length>8192)proc.kill();});proc.stdin.on('error',()=>{});
 const result=new Promise(resolve=>{proc.once('error',()=>resolve({code:-1}));proc.once('exit',code=>resolve({code}));});
 proc.stdin.end(JSON.stringify({mac,password:pass})+'\n');
 let timer;const out=await Promise.race([result,new Promise(resolve=>{timer=setTimeout(()=>{proc.kill();resolve({code:-2});},100000);})]);clearTimeout(timer);
 try{const x=JSON.parse(stdout.trim().split('\n').at(-1));return out.code===0&&x.ok===true;}catch(_){return false;}
}
(async()=>{
 stage='loopback shim';eth=dgram.createSocket('udp4');proxy=dgram.createSocket('udp4');
 eth.on('error',()=>{});proxy.on('error',()=>{});
 await listen(eth,0);await listen(proxy,20561);const bridgePort=eth.address().port,qemuPort=await unusedPort();
 proxy.on('message',(payload,r)=>{
   if(r.address!=='127.0.0.1'||payload.length<22||payload.length>1400)return;
   clients.add(r.port);
   try{eth.send(framing.wrap(payload,r.port),qemuPort,'127.0.0.1',()=>{});sent++;}catch(_){}
 });
 eth.on('message',(frame,r)=>{
   if(r.address!=='127.0.0.1'||r.port!==qemuPort)return;
   const p=framing.unwrap(frame);if(!p||!clients.has(p.port))return;
   proxy.send(p.data,p.port,'127.0.0.1',()=>{});received++;
 });
 stage='disposable CHR boot';await fs.mkdir(root,{recursive:true});dir=await fs.mkdtemp(path.join(root,'session-'));
 const disk=path.join(dir,'disk.img');await fs.copyFile(image,disk,fsConstants.COPYFILE_EXCL);
 serial=net.createServer();await new Promise((res,rej)=>{serial.once('error',rej);serial.listen(0,'127.0.0.1',res);});
 const serialPort=serial.address().port;
 const args=['-machine','pc,accel=tcg','-m','256','-smp','1','-display','none','-monitor','none','-no-reboot',
   '-serial',`tcp:127.0.0.1:${serialPort}`,'-drive',`file=${disk.replace(/,/g,',,')},format=raw,if=ide`,
   '-netdev',`socket,id=n0,udp=127.0.0.1:${bridgePort},localaddr=127.0.0.1:${qemuPort}`,
   '-device',`e1000,netdev=n0,mac=${target}`];
 let timer;const accepted=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Serial timeout')),60000);serial.once('connection',s=>{clearTimeout(timer);resolve(s);});});
 vm=spawn(supervisor,[disk,qemu,...args],{stdio:['pipe','ignore','ignore'],windowsHide:true});vm.stdin.on('error',()=>{});
 exitPromise=new Promise(resolve=>{vm.once('error',resolve);vm.once('exit',resolve);});
 const socket=await Promise.race([accepted,exitPromise.then(()=>{throw Error('QEMU exited before serial');})]).finally(()=>clearTimeout(timer));
 serial.close();conn=new ChrConsole(socket);await conn.initialize(password);
 await conn.command('/ip dhcp-client disable [find]');
 await conn.command('/tool mac-server mac-winbox set allowed-interface-list=all');
 stage='wrong-password negative';if(await readOnly('wrong_'+randomBytes(16).toString('hex')))throw Error('Wrong password read a result');
 stage='MAC-only authenticated read';if(!await readOnly(password))throw Error('MAC-only read did not succeed');
 if(!sent||!received)throw Error('No QEMU Ethernet exchange');
 console.log('::notice title=Windows CHR MAC loopback::CI-only patched client read the version of a disposable CHR by MAC via a localhost Ethernet shim; a wrong password could not read it. No physical NIC, real network, device identity or Windows broadcast tested.');
})().catch(err=>{console.log('::error title=Windows MAC CHR research::'+stage+': '+String(err.message).replace(/[\r\n%]/g,' ')+' (frames sent='+sent+', received='+received+')');process.exitCode=1;}).finally(async()=>{
 if(conn)conn.close();if(serial&&serial.listening)serial.close();
 if(vm&&vm.exitCode===null&&vm.signalCode===null)vm.stdin.end();
 if(exitPromise){let timer;const done=await Promise.race([exitPromise.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),10000);})]);clearTimeout(timer);if(!done){vm.kill();await exitPromise;}}
 for(const s of [proxy,eth])if(s)try{await new Promise(r=>s.close(r));}catch(_){}
 if(dir)try{await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch(_){console.log('::error title=MAC CHR cleanup::Failed to remove disposable VM');process.exitCode=1;}
});
