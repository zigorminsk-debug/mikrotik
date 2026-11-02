#!/usr/bin/env node
'use strict';
const assert=require('assert'),{createAuditHandler}=require('../windows/audit/ipc-handler'),{fixture}=require('./audit-safe-fixture');
(async()=>{
 const input={host:'192.0.2.10',port:443,fingerprint:'AA'.repeat(32),user:'test',password:'fixture-password'};
 const {snapshot,mapping}=fixture();let collect=async()=>snapshot,allow=true;
 const audit=createAuditHandler({isTrusted:e=>e==='main',isStopped:()=>false,showDialog:async()=>({response:allow?1:0}),collect:o=>collect(o),describe:()=>({complete:false,sections:[]})});
 assert(!(await audit.preview('main',mapping)).ok);assert(!(await audit.preview('other',mapping)).ok);assert(!(await audit.clear('other')).ok);
 let read=await audit('main',input);assert(read.ok);assert.deepStrictEqual(read.portSources,['physical-1','physical-2']);assert(!JSON.stringify(read).includes(input.password));
 assert(!(await audit.preview('other',mapping)).ok);let result=await audit.preview('main',mapping);assert(result.ok&&result.plan.items.length===4);assert.equal(result.plan.executable,false);assert(result.plan.skipped.length);assert(!JSON.stringify(result).includes('/interface bridge add'));
 for(const bad of [null,{},[1],Array(5).fill({}),[{source:'physical-1',target:'ether2;:execute'}],[{source:'physical-1',target:'ether2',command:'/system reset-configuration'}]]){
  result=await audit.preview('main',bad);assert(!result.ok||!result.plan.items.length);
 }
 result=await audit.preview('main',[{...mapping[0],command:'/system reset-configuration'},mapping[1]]);assert(result.ok&&result.plan.items.length===4);assert(!JSON.stringify(result).includes('reset-configuration'));
 assert((await audit.clear('main')).ok);assert(!(await audit.preview('main',mapping)).ok);
 read=await audit('main',input);assert(read.ok);allow=false;assert((await audit('main',input)).cancelled);assert(!(await audit.preview('main',mapping)).ok);allow=true;
 read=await audit('main',input);assert(read.ok);assert(!(await audit('main',{...input,host:'localhost'})).ok);assert(!(await audit.preview('main',mapping)).ok);
 let release;collect=()=>new Promise(r=>{release=r;});const pending=audit('main',input);await new Promise(r=>setImmediate(r));assert(!(await audit.preview('main',mapping)).ok);await audit.clear('main');release(snapshot);assert((await pending).cancelled);assert(!(await audit.preview('main',mapping)).ok);
 collect=async()=>snapshot;read=await audit('main',input);assert(read.ok);const clock=Date.now;try{Date.now=()=>clock()+10*60*1000+1;assert(!(await audit.preview('main',mapping)).ok);}finally{Date.now=clock;}assert(!(await audit.preview('main',mapping)).ok);
 let dialogRelease,readCount=0;
 const dialogRace=createAuditHandler({isTrusted:e=>e==='main',isStopped:()=>false,showDialog:()=>new Promise(r=>{dialogRelease=r;}),collect:async()=>{readCount++;return snapshot;},describe:()=>({sections:[]})});
 const waiting=dialogRace('main',input);await new Promise(r=>setImmediate(r));dialogRace.clear('main');dialogRelease({response:1});assert((await waiting).cancelled);assert.equal(readCount,0);
 read=await audit('main',input);assert(read.ok);audit.reset();assert(!(await audit.preview('main',mapping)).ok);
 console.log('Audit preview IPC: trusted frame, transient last snapshot, explicit mappings, no command IPC, expiration and close/read race. No network.');
})().catch(e=>{console.error(e);process.exitCode=1;});
