#!/usr/bin/env node
'use strict';
const assert=require('assert'),path=require('path');
const {LinuxGuest,portOk,macOk}=require('../windows/chr/linux-guest');
const base=path.resolve('/tmp/isolated-lab'),opts={qemu:path.join(base,'qemu-system-x86_64.exe'),image:path.join(base,'cirros-0.6.3-x86_64-disk.img'),tempRoot:base,supervisor:path.join(base,'chr-supervisor.exe'),localPort:2001,hubPort:2002,mac:'52:54:00:00:02:01'};
(async()=>{
 assert(portOk(1)&&!portOk(0)&&!portOk(65536));assert(macOk(opts.mac)&&!macOk('01:00:00:00:00:01'));
 for(const patch of [{qemu:'relative'},{image:path.join(base,'other.img')},{localPort:0},{hubPort:2001},{mac:'bad;reboot'}])assert.throws(()=>new LinuxGuest({...opts,...patch}));
 const g=new LinuxGuest(opts);g.started=true;let sent='',response='3';
 g.console={settle:async()=>{},send:s=>{sent=s;},expect:async()=>{const parts=[...sent.matchAll(/'([A-Za-z0-9]+)'/g)].map(x=>x[1]);const i=parts.findIndex(x=>x.startsWith('LINUX'));return parts[i]+parts[i+1]+'R'+response+'END';},close(){}};
 assert.deepStrictEqual(await g.ping('192.168.88.20'),{sent:3,received:3});assert(sent.includes('ping -c 3 -W 2 192.168.88.20'));
 await assert.rejects(g.ping('192.168.88.20; reboot'),/IPv4/);assert(!g.failed);
 response='192.168.88.10';assert.equal(await g.address(),'192.168.88.10');
 response='0';await g.setStatic('192.168.88.10','192.168.88.1');assert(sent.includes('192.168.88.10/24')&&sent.includes('default via 192.168.88.1'));
 await assert.rejects(g.setStatic('192.168.88.10','1.1.1.1;reboot'),/IPv4/);assert(!g.failed);
 let resolve;g.console.expect=()=>new Promise(ok=>{resolve=ok;});const pending=g.ping('192.168.88.20');await new Promise(r=>setImmediate(r));await assert.rejects(g.address(),/занят/);const parts=[...sent.matchAll(/'([A-Za-z0-9]+)'/g)].map(x=>x[1]);const i=parts.findIndex(x=>x.startsWith('LINUX'));resolve(parts[i]+parts[i+1]+'R1END');assert.equal((await pending).received,1);
 g.console.expect=async()=>{throw Error('timeout');};await assert.rejects(g.ping('192.168.88.20'),/timeout/);assert(g.failed);await assert.rejects(g.address(),/перезапустите/);await g.stop();
 console.log('Linux guest: безопасные аргументы, результаты, конкуренция и ошибка проверены на моках; реальная VM проверяется отдельно в CI.');
})().catch(e=>{console.error(e);process.exitCode=1;});
