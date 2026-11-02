#!/usr/bin/env node
'use strict';
const assert=require('assert'),{JSDOM}=require('jsdom'),{createAuditUI}=require('../app/js/physical-audit');
(async()=>{
 const dom=new JSDOM('<main id="audit"></main>'),doc=dom.window.document,container=doc.getElementById('audit');let calls=0,resolve;
 const rows=Array.from({length:30},(_,i)=>[{label:'Имя',purpose:'Описание',present:true,value:i===0?'<img src=x onerror=alert(1)>':'ether'+i},{label:'Отключено',purpose:'Состояние',present:false,value:null}]);
 const ui=createAuditUI(container,{auditIp:request=>{calls++;assert.equal(request.password,'test-only-password');return new Promise(r=>{resolve=r;});}});
 doc.getElementById('audit-ip').value='192.168.88.1';doc.getElementById('audit-pin').value='AA:'.repeat(31)+'AA';doc.getElementById('audit-user').value='readonly';doc.getElementById('audit-password').value='test-only-password';
 container.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(doc.getElementById('audit-password').value,'');await new Promise(r=>setImmediate(r));assert.equal(calls,1);
 container.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(calls,1);
 resolve({ok:true,report:{complete:false,warning:'Неполно',sections:[{title:'Интерфейсы',purpose:'Описание',status:'ok',rows},{title:'NAT',status:'forbidden',rows:[]}]}});await new Promise(r=>setImmediate(r));
 assert(container.textContent.includes('<img src=x'));assert(!container.querySelector('img'));assert(container.textContent.includes('Неизвестно: поле отсутствует'));assert(container.textContent.includes('1–25 из 30'));assert(container.textContent.includes('Доступ запрещён'));
 const next=[...container.querySelectorAll('button')].find(x=>x.textContent.includes('Следующие 25'));next.click();assert(container.textContent.includes('26–30 из 30'));assert(!container.textContent.includes('<img src=x'));
 ui.dispose();assert.equal(container.textContent,'');
 const unsupported=createAuditUI(container,null);assert(container.querySelector('button[type=submit]').disabled);unsupported.dispose();
 let later;const ui2=createAuditUI(container,{auditIp:()=>new Promise(r=>{later=r;})});container.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setImmediate(r));ui2.dispose();later({ok:true,report:{sections:[]}});await new Promise(r=>setImmediate(r));assert.equal(container.textContent,'');
 let afterDispose=0;const ui3=createAuditUI(container,{auditIp:()=>{afterDispose++;}});container.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));ui3.dispose();await new Promise(r=>setImmediate(r));assert.equal(afterDispose,0);dom.window.close();
 console.log('Audit UI research: text-only untrusted output, bounded pagination, transient password and disposed-result guard; no actual IPC/network.');
})().catch(e=>{console.error(e);process.exitCode=1;});
