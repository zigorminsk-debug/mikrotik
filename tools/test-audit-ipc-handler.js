#!/usr/bin/env node
'use strict';
const assert=require('assert'),{createAuditHandler}=require('../windows/audit/ipc-handler');
(async()=>{
 let consent=0,readCalls=0,pending=null,stop=false,optionsSeen,dialogSeen;
 const good={host:'192.168.88.1',port:443,fingerprint:'AA:'.repeat(31)+'AA',user:'reader',password:'not-a-real-password'};
 const audit=createAuditHandler({isTrusted:e=>e==='main-frame',isStopped:()=>stop,showDialog:async o=>{dialogSeen=o;return {response:consent};},collect:async o=>{readCalls++;optionsSeen={...o};if(pending)await pending;return {sections:[],complete:false};},describe:()=>({complete:false,sections:[]})});
 assert(!(await audit('untrusted',good)).ok);assert.equal(readCalls,0);
 assert(!(await audit('main-frame',{...good,host:'localhost'})).ok);assert.equal(readCalls,0);
 assert((await audit('main-frame',good)).cancelled);assert.equal(readCalls,0);assert.equal(dialogSeen.defaultId,0);assert.equal(dialogSeen.cancelId,0);assert(dialogSeen.detail.includes(good.host));assert(dialogSeen.detail.includes(good.fingerprint));assert(!dialogSeen.detail.includes(good.password));assert(dialogSeen.detail.includes('независимому доверенному каналу'));
 consent=1;let release;pending=new Promise(r=>{release=r;});const first=audit('main-frame',{...good,path:'/rest/system/reset-configuration',method:'POST',allowLoopback:true});await new Promise(r=>setImmediate(r));assert.equal(readCalls,1);assert(!(await audit('main-frame',good)).ok);assert.deepStrictEqual(Object.keys(optionsSeen).sort(),['fingerprint','host','password','port','user']);release();assert((await first).ok);
 pending=null;stop=true;assert((await audit('main-frame',good)).cancelled);assert.equal(readCalls,1);stop=false;
 let releaseSecond;pending=new Promise(r=>{releaseSecond=r;});const second=audit('main-frame',good);await new Promise(r=>setImmediate(r));stop=true;releaseSecond();assert((await second).cancelled);stop=false;pending=null;
 const authHandler=createAuditHandler({isTrusted:()=>true,isStopped:()=>false,showDialog:async()=>({response:1}),collect:async()=>({sections:[{status:'auth'}]}),describe:()=>{throw Error('must not call');}});assert(!(await authHandler('main-frame',good)).ok);
 const secretHandler=createAuditHandler({isTrusted:()=>true,isStopped:()=>false,showDialog:async()=>({response:1}),collect:async()=>{throw Error('secret '+good.password);},describe:()=>{throw Error('unused');}});
 const failure=await secretHandler('main-frame',good);assert(!failure.ok && !failure.message.includes(good.password));
 console.log('Audit IPC research: trusted frame, consent before read, no arbitrary method/path, concurrent lock and redacted errors; no Electron or router contacted.');
})().catch(e=>{console.error(e);process.exitCode=1;});
