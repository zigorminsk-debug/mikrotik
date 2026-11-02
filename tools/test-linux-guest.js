#!/usr/bin/env node
'use strict';
const assert=require('assert'),path=require('path'),fs=require('fs').promises,os=require('os');
const {LinuxGuest,portOk,macOk}=require('../windows/chr/linux-guest');
const base=path.resolve('/tmp/isolated-lab'),opts={qemu:path.join(base,'qemu-system-x86_64.exe'),image:path.join(base,'cirros-0.6.3-x86_64-disk.img'),tempRoot:base,supervisor:path.join(base,'chr-supervisor.exe'),localPort:2001,hubPort:2002,mac:'52:54:00:00:02:01'};
(async()=>{
 assert(portOk(1)&&!portOk(0)&&!portOk(65536));assert(macOk(opts.mac)&&!macOk('01:00:00:00:00:01'));
 for(const patch of [{qemu:'relative'},{image:path.join(base,'other.img')},{localPort:0},{hubPort:2001},{mac:'bad;reboot'}])assert.throws(()=>new LinuxGuest({...opts,...patch}));
 const g=new LinuxGuest(opts);g.started=true;let sent='',sentCommands=[],response='3';
 g.console={settle:async()=>{},send:s=>{sent=s;sentCommands.push(s);},expect:async()=>{const parts=[...sent.matchAll(/'([A-Za-z0-9]+)'/g)].map(x=>x[1]);const i=parts.findIndex(x=>x.startsWith('LINUX'));return parts[i]+parts[i+1]+'R'+response+'END';},close(){}};
 assert.deepStrictEqual(await g.ping('192.168.88.20'),{sent:3,received:3});assert(sent.includes('ping -c 3 -W 2 192.168.88.20'));
 await assert.rejects(g.ping('192.168.88.20; reboot'),/IPv4/);assert(!g.failed);
 response='192.168.88.10';assert.equal(await g.address(),'192.168.88.10');
 response='0';assert(await g.hasDns('192.168.88.1'));await assert.rejects(g.hasDns('1.1.1.1;reboot'),/DNS/);
 response='0';assert(await g.hasGateway('192.168.88.1'));assert(sent.includes('ip -4 route show default dev eth0'));assert(await g.hasGateway(''));await assert.rejects(g.hasGateway('1.1.1.1;reboot'),/шлюз/);
 response='192.168.88.20';assert.deepStrictEqual(await g.resolve('server.lab'),{ok:true,address:'192.168.88.20'});assert(sent.includes('nslookup -timeout=2 -retry=1 -type=a server.lab'));assert(!sent.includes('server.lab;reboot'));
 response='0';assert.deepStrictEqual(await g.resolve('missing.lab'),{ok:false,reason:'dns'});
 response='127.0.0.1';assert.deepStrictEqual(await g.resolve('special.lab'),{ok:false,reason:'address'});
 await assert.rejects(g.resolve('server.lab;reboot'),/DNS-имя/);assert(!g.failed);
 response='0';sentCommands=[];await g.setStatic('192.168.88.10','192.168.88.1','192.168.88.1');assert(sentCommands[0].includes('192.168.88.10/24')&&sentCommands[0].includes('default via 192.168.88.1'));assert(sent.includes('awk')&&sent.includes('192.168.88.1'));assert(sentCommands[0].includes('sudo dhcpcd -k >/dev/null'));assert(sentCommands[0].includes('pidof dhcpcd'));
 await assert.rejects(g.setStatic('192.168.88.10','1.1.1.1;reboot','192.168.88.1'),/IPv4/);await assert.rejects(g.setStatic('192.168.88.10','192.168.88.1','1.1.1.1;reboot'),/IPv4/);assert(!g.failed);
 let resolve;g.console.expect=()=>new Promise(ok=>{resolve=ok;});const pending=g.ping('192.168.88.20');await new Promise(r=>setImmediate(r));await assert.rejects(g.address(),/занят/);const parts=[...sent.matchAll(/'([A-Za-z0-9]+)'/g)].map(x=>x[1]);const i=parts.findIndex(x=>x.startsWith('LINUX'));resolve(parts[i]+parts[i+1]+'R1END');assert.equal((await pending).received,1);
 g.console.expect=async()=>{throw Error('timeout');};await assert.rejects(g.ping('192.168.88.20'),/timeout/);assert(g.failed);await assert.rejects(g.address(),/перезапустите/);await g.stop();
 // Stop must not resolve while a disk operation can still recreate data.
 for(const phase of ['mkdir','mkdtemp','copyFile']){
   const root=await fs.mkdtemp(path.join(os.tmpdir(),'linux-cancel-test-'));
   const image=path.join(root,'cirros-0.6.3-x86_64-disk.img');await fs.writeFile(image,'fixture');
   const sessions=path.join(root,'sessions');const guest=new LinuxGuest({...opts,image,tempRoot:sessions});
   const original=fs[phase];let release,entered;const gate=new Promise(r=>{release=r;}),arrived=new Promise(r=>{entered=r;});
   fs[phase]=async function(...args){
     if(phase==='mkdir'){const value=await original.apply(fs,args);entered();await gate;return value;}
     if(phase==='mkdtemp'){const value=await original.apply(fs,args);entered();await gate;return value;}
     entered();await gate;return original.apply(fs,args);
   };
   try {
     const starting=guest.start();await arrived;let stopped=false;
     const stopping=guest.stop();assert.strictEqual(guest.stop(),stopping);stopping.then(()=>{stopped=true;});
     await new Promise(r=>setTimeout(r,30));assert.equal(stopped,false,'stop must wait during '+phase);
     release();await assert.rejects(starting,/остановлен/);await stopping;
     const files=await fs.readdir(sessions).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e));assert.deepStrictEqual(files,[],'temporary guest directory remains after '+phase);
   } finally {fs[phase]=original;release();await fs.rm(root,{recursive:true,force:true});}
 }
 console.log('Linux guest: проверены аргументы, ошибки, конкуренция и очистка при остановке на этапах mkdir/mkdtemp/copyFile; реальная VM проверяется отдельно в CI.');
})().catch(e=>{console.error(e);process.exitCode=1;});
