#!/usr/bin/env node
'use strict';
// ISOLATED WINDOWS CI ONLY: one disposable CHR, a fixed synthetic plan,
// localhost Ethernet shim and a CI-only patched MAC client. This cannot accept
// a user plan or contact a physical interface. No credentials or commands log.
const fs=require('fs').promises, fsConstants=require('fs').constants;
const net=require('net'), dgram=require('dgram'),path=require('path');
const {spawn}=require('child_process'),{randomBytes}=require('crypto');
const {ChrConsole}=require('../windows/chr/console');
const {makeReader,verifyConfiguration}=require('../windows/chr/verify');
const framing=require('./mac-loopback-frame'),{fixture}=require('./test-mac-apply-fixture');
const [qemu,image,root,supervisor,helper]=process.argv.slice(2).map(x=>x&&path.resolve(x));
if(!qemu||!image||!root||!supervisor||!helper)throw Error('Missing CI arguments');
const target='02:11:22:33:44:55',password='TemporaryCI_'+randomBytes(16).toString('hex');
const {plan,commands}=fixture();
let vm,conn,dir,serial,eth,proxy,exitPromise;const clients=new Set();let sent=0,received=0,dropped=0,restarts=0,dropResponses=false,stage='initialization';
const bind=(s,port)=>new Promise((resolve,reject)=>{s.once('error',reject);s.bind(port,'127.0.0.1',()=>{s.removeListener('error',reject);resolve();});});
async function unusedUdpPort(){const s=dgram.createSocket('udp4');await bind(s,0);const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function unusedTcpPort(){const s=net.createServer();await new Promise((r,j)=>{s.once('error',j);s.listen(0,'127.0.0.1',r);});const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function apply(fixtureCommands,onCheckpoint){
 const proc=spawn(helper,[],{stdio:['pipe','pipe','ignore'],windowsHide:true});let stdout='';
 proc.stdout.setEncoding('utf8');let checkpointStarted=false;let checkpointError;
 proc.stdout.on('data',x=>{
  stdout+=x;if(stdout.length>8192){proc.kill();return;}
  if(!checkpointStarted&&stdout.includes('{"checkpoint":true}')){
   checkpointStarted=true;
   Promise.resolve().then(()=>{if(!onCheckpoint)throw Error('Unexpected checkpoint');return onCheckpoint();}).then(()=>{proc.stdin.end('drop-replies\n');}).catch(e=>{checkpointError=e;proc.kill();});
  }
 });proc.stdin.on('error',()=>{});
 const exit=new Promise(resolve=>{proc.once('error',()=>resolve({code:-1}));proc.once('exit',code=>resolve({code}));});
 proc.stdin.write(JSON.stringify({mac:target,password,commands:fixtureCommands})+'\n');
 let timer;const result=await Promise.race([exit,new Promise(resolve=>{timer=setTimeout(()=>{proc.kill();resolve({code:-2});},360000);})]);clearTimeout(timer);
 if(result.code===-2){await exit;throw Error('CI helper timed out');}
 if(checkpointError)throw checkpointError;
 try{const body=JSON.parse(stdout.trim().split('\n').at(-1));if(typeof body.ok!=='boolean'||(body.ok&&result.code!==0)||(!body.ok&&result.code!==1))throw Error();return body;}
 catch(_){throw Error('CI helper did not return a valid status');}
}
(async()=>{
 stage='local loopback shim';eth=dgram.createSocket('udp4');proxy=dgram.createSocket('udp4');eth.on('error',()=>{});proxy.on('error',()=>{});
 await bind(eth,0);await bind(proxy,20561);const bridgePort=eth.address().port,qemuPort=await unusedUdpPort(),managementPort=await unusedTcpPort();
 proxy.on('message',(payload,r)=>{
  if(r.address!=='127.0.0.1'||payload.length<22||payload.length>1400)return;clients.add(r.port);
  try{if(dropResponses&&payload[1]===0)restarts++;eth.send(framing.wrap(payload,r.port),qemuPort,'127.0.0.1',()=>{});sent++;}catch(_){}
 });
 eth.on('message',(frame,r)=>{if(r.address!=='127.0.0.1'||r.port!==qemuPort)return;const p=framing.unwrap(frame);if(!p||!clients.has(p.port))return;if(dropResponses){dropped++;return;}proxy.send(p.data,p.port,'127.0.0.1',()=>{});received++;});
 stage='disposable CHR boot';await fs.mkdir(root,{recursive:true});dir=await fs.mkdtemp(path.join(root,'session-'));
 const disk=path.join(dir,'disk.img');await fs.copyFile(image,disk,fsConstants.COPYFILE_EXCL);
 serial=net.createServer();await new Promise((res,rej)=>{serial.once('error',rej);serial.listen(0,'127.0.0.1',res);});const serialPort=serial.address().port;
 const args=['-machine','pc,accel=tcg','-m','256','-smp','1','-display','none','-monitor','none','-no-reboot','-serial',`tcp:127.0.0.1:${serialPort}`,'-drive',`file=${disk.replace(/,/g,',,')},format=raw,if=ide`,
  '-netdev',`socket,id=n0,udp=127.0.0.1:${bridgePort},localaddr=127.0.0.1:${qemuPort}`,'-device',`e1000,netdev=n0,mac=${target}`];
 for(let i=1;i<5;i++)args.push('-netdev',`user,id=n${i},restrict=on`,'-device',`e1000,netdev=n${i}`);
 args.push('-netdev',`user,id=mgmt,restrict=on,net=172.31.254.0/24,host=172.31.254.2,hostfwd=tcp:127.0.0.1:${managementPort}-172.31.254.15:80`,'-device','e1000,netdev=mgmt');
 let timer;const accepted=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Serial timeout')),60000);serial.once('connection',s=>{clearTimeout(timer);resolve(s);});});
 vm=spawn(supervisor,[disk,qemu,...args],{stdio:['pipe','ignore','ignore'],windowsHide:true});vm.stdin.on('error',()=>{});
 exitPromise=new Promise(resolve=>{vm.once('error',resolve);vm.once('exit',resolve);});
 const socket=await Promise.race([accepted,exitPromise.then(()=>{throw Error('QEMU exited before serial');})]).finally(()=>clearTimeout(timer));
 serial.close();conn=new ChrConsole(socket);await conn.initialize(password);
 for(const command of ['/ip dhcp-client disable [find]','/tool mac-server mac-winbox set allowed-interface-list=all','/ip address add address=172.31.254.15/24 interface=ether6','/ip service enable www','/ip firewall filter add chain=input in-interface=ether6 action=accept comment="Lab management"']) await conn.command(command);
 stage='fixture negative control';const changed=commands.slice();changed[0]+='-invalid';const before=sent;const reject=await apply(changed);
 if(reject.ok||reject.stage!=='fixture'||sent!==before)throw Error('Modified fixture not rejected before connection');
 stage='MAC-only fixture application';const get=makeReader(managementPort,'admin',password);
 const outcome=await apply(commands,async()=>{
  stage='independent REST verification';
  for(let i=0;;i++){try{await verifyConfiguration(plan.expected,get);break;}catch(e){if(!/Не удалось подключиться к виртуальной CHR/.test(e.message)||i===3)throw e;await new Promise(r=>setTimeout(r,2000));}}
  stage='lost reply simulation';dropResponses=true;
 });
 if(!outcome.ok||!outcome.interrupted)throw Error('Fixture application or loss simulation failed at '+String(outcome.stage)+' index '+String(outcome.index));
 if(!sent||!received||!dropped||restarts)throw Error('Missing exchange, reply loss or unexpected session restart');
 stage='independent post-interruption read';const identity=await get('/rest/system/identity');
 if(identity.name!=='CI interrupted probe')throw Error('The expected unknown-outcome case was not observed');
 console.log('::notice title=Isolated Windows CHR MAC apply::The fixed synthetic plan was sent by MAC to a disposable CHR and independently verified by REST. A changed fixture was rejected before connecting and a duplicate bridge returned an error. After simulated reply loss, the command reported failure although REST showed it had run; no session restart was observed. CI-only client, no physical NIC or router.');
})().catch(err=>{console.log('::error title=Isolated Windows CHR MAC apply::'+stage+': '+String(err.message).replace(/[\r\n%]/g,' ')+' (frames sent='+sent+', received='+received+')');process.exitCode=1;}).finally(async()=>{
 if(conn)conn.close();if(serial&&serial.listening)serial.close();if(vm&&vm.exitCode===null&&vm.signalCode===null)vm.stdin.end();
 if(exitPromise){let timer;const done=await Promise.race([exitPromise.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),10000);})]);clearTimeout(timer);if(!done){vm.kill();await exitPromise;}}
 for(const s of [proxy,eth])if(s)try{await new Promise(r=>s.close(r));}catch(_){}
 if(dir)try{await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch(_){console.log('::error title=MAC CHR cleanup::Failed to remove disposable VM');process.exitCode=1;}
});
