#!/usr/bin/env node
'use strict';
// Mock bridge only: verifies wiring and lifecycle, never contacts a router.
const assert=require('assert'),path=require('path'),{JSDOM,VirtualConsole}=require('jsdom');
(async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));let calls=0,resolve;
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.routerOS={physicalInterfaces:async()=>({ok:true,interfaces:[]}),auditIp:async input=>{calls++;assert.equal(input.password,'mock-password');return await new Promise(r=>{resolve=r;});}};
 }});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));w.location.hash='lab';await new Promise(r=>setTimeout(r,30));const id=w.Lab.place('router',200,120);w.Lab.openSettings(id);const d=w.document;
 assert(d.getElementById('lm_physical_audit'));assert(!d.querySelector('#lm_physical_audit button[type=submit]').disabled);
 d.getElementById('audit-ip').value='192.168.88.1';d.getElementById('audit-pin').value='AA:'.repeat(31)+'AA';d.getElementById('audit-user').value='readonly';d.getElementById('audit-password').value='mock-password';
 d.querySelector('#lm_physical_audit form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(d.getElementById('audit-password').value,'');await new Promise(r=>setTimeout(r,0));assert.equal(calls,1);assert(!JSON.stringify(w.Lab.state).includes('mock-password'));
 resolve({ok:true,report:{warning:'Отчёт неполный',sections:[{title:'Интерфейсы',purpose:'Назначение',status:'ok',rows:[[{label:'Имя',purpose:'Подпись',present:true,value:'<svg onload=alert(1)>'}]]}]}});await new Promise(r=>setTimeout(r,0));
 assert(d.getElementById('lm_physical_audit').textContent.includes('<svg onload=alert(1)>'));assert(!d.getElementById('lm_physical_audit').querySelector('svg'));
 d.getElementById('lm_cancel').click();assert(!d.getElementById('audit-password'));assert(!d.getElementById('lm_physical_audit').textContent);
 w.Lab.openSettings(id);assert.equal(d.getElementById('audit-ip').value,'');d.getElementById('audit-password').value='mock-password';d.querySelector('#lm_physical_audit form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(calls,2);
 d.getElementById('lm_cancel').click();resolve({ok:true,report:{sections:[]}});await new Promise(r=>setTimeout(r,0));assert(!d.getElementById('lm_physical_audit').textContent);assert(!errors.length,errors.join('; '));dom.window.close();
 console.log('Audit product DOM: mocked bridge, safe text, no scheme storage, cleanup and stale-result guard; no Electron or network.');
})().catch(e=>{console.error(e);process.exitCode=1;});
