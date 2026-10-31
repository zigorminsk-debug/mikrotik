#!/usr/bin/env node
'use strict';
// No network. Verifies that untrusted discovery values are rendered as text.
const assert=require('assert');const path=require('path');const {JSDOM,VirtualConsole}=require('jsdom');
(async()=>{
 const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));let calls=0;
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.routerOS={physicalInterfaces:async()=>({ok:true,interfaces:[{name:'<b>Ethernet</b>',address:'192.0.2.5'}]}),discoverPhysical:async(name,address)=>{calls++;assert.equal(name,'<b>Ethernet</b>');assert.equal(address,'192.0.2.5');return {ok:true,devices:[{mac:'02:11:22:33:44:55',identity:'<img src=x onerror=alert(1)>',hardware:'<script>',version:'7.23.8',sourceAddress:'0.0.0.0'}]};}};
 }});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));const d=w.document;
 w.location.hash='lab';await new Promise(r=>setTimeout(r,40));const router=w.Lab.place('router',200,120);w.Lab.openSettings(router);
 await new Promise(r=>setTimeout(r,50));const select=d.getElementById('lm_physical_if');assert(select.textContent.includes('<b>Ethernet</b>'));assert(!select.querySelector('b'));
 d.getElementById('lm_find_physical').click();await new Promise(r=>setTimeout(r,50));const out=d.getElementById('lm_physical_result');assert.equal(calls,1);assert(out.textContent.includes('<img src=x'));assert(!out.querySelector('img,script'));assert(out.textContent.includes('Подключение и применение пока недоступны'));
 assert(!errors.length,errors.join('; '));dom.window.close();console.log('Поиск физических устройств: недоверенные данные остаются текстом; отправка настроек недоступна.');
})().catch(e=>{console.error(e);process.exitCode=1;});
