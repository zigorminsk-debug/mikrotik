#!/usr/bin/env node
'use strict';
const assert=require('assert'),{EventEmitter}=require('events');
const {ChrConsole}=require('../windows/chr/console'),{validTarget,pingConsole}=require('../windows/chr/ping');
class Socket extends EventEmitter { constructor(){super();this.writes=[];} write(s){this.writes.push(s);} destroy(){this.emit('close');} input(s){this.emit('data',Buffer.from(s));} }
(async()=>{
 for(const value of ['192.168.88.1','1.1.1.1','10.0.2.2','203.0.113.10'])assert(validTarget(value),value);
 for(const value of [null,{},'','example.com','127.0.0.1','0.0.0.0','192.168.88.0','192.168.88.255','224.0.0.1','169.254.2.2','01.2.3.4','1.1.1.1; /system reset','1.1.1.1\n/system reset','256.0.0.1'])assert(!validTarget(value),String(value));
 const s=new Socket(),c=new ChrConsole(s,{timeout:80});c.settle=async()=>{c.buffer='';};
 let p=pingConsole(c,'192.168.88.1');await new Promise(r=>setImmediate(r));
 let text=s.writes[0],parts=[...text.matchAll(/"([A-Za-z0-9]+)"/g)].map(x=>x[1]);assert(text.includes('/ping 192.168.88.1 count=3'));assert.equal(parts.length,7);
 s.input(text);let done=false;p.then(()=>{done=true;});await new Promise(r=>setImmediate(r));assert(!done,'echo must not be accepted');
 s.input(parts[0]+parts[1]+'R3END');assert.deepStrictEqual(await p,{sent:3,received:3});
 p=pingConsole(c,'192.168.88.2');await new Promise(r=>setImmediate(r));text=s.writes[1];parts=[...text.matchAll(/"([A-Za-z0-9]+)"/g)].map(x=>x[1]);s.input(parts[0]+parts[1]+'R0END');assert.deepStrictEqual(await p,{sent:3,received:0});
 p=pingConsole(c,'192.168.88.2');await new Promise(r=>setImmediate(r));text=s.writes[2];parts=[...text.matchAll(/"([A-Za-z0-9]+)"/g)].map(x=>x[1]);s.input(parts[0]+parts[1]+'ERR');await assert.rejects(p,/отклонила/);
 const count=s.writes.length;await assert.rejects(pingConsole(c,'1.1.1.1;bad'),/IPv4/);assert.equal(s.writes.length,count);
 c.close();console.log('CHR ping: только IPv4 узла, ограниченные данные, эхо и ошибки проверены.');
})().catch(e=>{console.error(e);process.exitCode=1;});
