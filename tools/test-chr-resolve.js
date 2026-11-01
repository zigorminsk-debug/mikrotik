#!/usr/bin/env node
'use strict';
const assert=require('assert'),{EventEmitter}=require('events');
const {ChrConsole}=require('../windows/chr/console'),{validName,resolveConsole}=require('../windows/chr/resolve');
class Socket extends EventEmitter {constructor(){super();this.writes=[];}write(s){this.writes.push(s);}destroy(){this.emit('close');}input(s){this.emit('data',Buffer.from(s));}}
(async()=>{
 for(const s of ['example.com','lab.example','printer','xn--e1afmkfd.xn--p1ai','EXAMPLE.COM'])assert(validName(s),s);
 for(const s of [null,{},'', '192.168.1.1','example.com;reboot','https://example.com','a..b','-a.b','a-.b','a\nb','a'.repeat(64)+'.com'])assert(!validName(s),String(s));
 const s=new Socket(),c=new ChrConsole(s,{timeout:80});c.settle=async()=>{c.buffer='';};
 async function probe(output,expected){const p=resolveConsole(c,'lab.example');await new Promise(r=>setImmediate(r));const text=s.writes.at(-1),parts=[...text.matchAll(/"([A-Za-z0-9]+)"/g)].map(x=>x[1]);s.input(text);let done=false;p.then(()=>{done=true;});await new Promise(r=>setImmediate(r));assert(!done,'echo must not be accepted');s.input(parts[0]+parts[1]+output);assert.deepStrictEqual(await p,expected);}
 await probe('R192.168.88.20END',{ok:true,address:'192.168.88.20'});
 await probe('ERR',{ok:false,reason:'dns'});await probe('R127.0.0.1END',{ok:false,reason:'address'});
 const n=s.writes.length;await assert.rejects(resolveConsole(c,'test;bad'),/DNS/);assert.equal(s.writes.length,n);c.close();
 console.log('CHR DNS: безопасное имя, эхозащита, результат и ошибки проверены.');
})().catch(e=>{console.error(e);process.exitCode=1;});
