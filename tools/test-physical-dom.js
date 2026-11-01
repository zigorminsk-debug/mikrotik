#!/usr/bin/env node
'use strict';
// No network. Verifies that untrusted discovery values are rendered as text.
const assert=require('assert');const path=require('path');const {JSDOM,VirtualConsole}=require('jsdom');
(async()=>{
 const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));let calls=0, launches=0, copies=[], finishScan;
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.routerOS={copyPhysicalMac:async mac=>{copies.push(mac);return {ok:true};},openWinbox:async()=>{launches++;return {ok:true};},physicalInterfaces:async()=>({ok:true,interfaces:[{name:'<b>Ethernet</b>',address:'192.0.2.5'},{name:'Другой адаптер',address:'192.0.2.6'}]}),discoverPhysical:async(name,address)=>{calls++;assert.equal(name,'<b>Ethernet</b>');assert.equal(address,'192.0.2.5');await new Promise(r=>{finishScan=r;});return {ok:true,devices:[{mac:'02:11:22:33:44:55',identity:'<img src=x onerror=alert(1)>',hardware:'<script>',version:'7.23.8',sourceAddress:'0.0.0.0'},{mac:'02:00:00:00:00:02',identity:'Второй',hardware:'CHR',version:'7.23',sourceAddress:'192.0.2.8'},{mac:'<script>',identity:'Invalid'},{mac:'FF:FF:FF:FF:FF:FF'},{mac:'00:00:00:00:00:00'}]};}};
 }});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));const d=w.document;
 w.location.hash='lab';await new Promise(r=>setTimeout(r,40));const router=w.Lab.place('router',200,120);w.Lab.openSettings(router);
 await new Promise(r=>setTimeout(r,50));const external=d.getElementById('lm_open_winbox');assert(external && !external.disabled);external.click();await new Promise(r=>setTimeout(r,10));assert.equal(launches,1);assert(d.getElementById('lm_winbox_status').textContent.includes('не проверяет вход'));const select=d.getElementById('lm_physical_if');assert(select.textContent.includes('<b>Ethernet</b>'));assert(!select.querySelector('b'));
 d.getElementById('lm_find_physical').click();assert(select.disabled);assert(d.getElementById('lm_find_physical').disabled);finishScan();await new Promise(r=>setTimeout(r,50));assert(!select.disabled);const out=d.getElementById('lm_physical_result');assert.equal(calls,1);assert(out.textContent.includes('<img src=x'));assert(!out.querySelector('img,script'));assert(out.textContent.includes('Подключение и применение пока недоступны'));assert(out.textContent.includes('другой адаптер'));
 const manual=d.getElementById('lm_manual_mac'),copy=d.getElementById('lm_copy_mac');manual.value='not-a-mac';copy.click();assert.equal(copies.length,0);
 manual.value='02:aa:bb:cc:dd:ee';manual.dispatchEvent(new w.Event('input'));copy.click();await new Promise(r=>setTimeout(r,10));assert.equal(copies[0],'02:AA:BB:CC:DD:EE');assert(d.getElementById('lm_copy_mac_status').textContent.includes('скопирован'));
 const buttons=out.querySelectorAll('button');assert.equal(buttons.length,2);assert.equal(buttons[0].getAttribute('aria-pressed'),'false');assert(!d.getElementById('lm_selected_mac'));
 buttons[0].click();assert.equal(manual.value,'02:11:22:33:44:55');assert.equal(d.getElementById('lm_selected_mac').value,'02:11:22:33:44:55');assert(d.getElementById('lm_selected_mac').readOnly);assert.equal(buttons[0].getAttribute('aria-pressed'),'true');assert(out.textContent.includes('не подтверждён'));
 buttons[1].click();assert.equal(d.getElementById('lm_selected_mac').value,'02:00:00:00:00:02');assert.equal(buttons[0].getAttribute('aria-pressed'),'false');assert.equal(buttons[1].getAttribute('aria-pressed'),'true');
 d.getElementById('lm_find_physical').click();assert(!d.getElementById('lm_selected_mac'));finishScan();await new Promise(r=>setTimeout(r,50));assert.equal(calls,2);out.querySelector('button').click();assert(d.getElementById('lm_selected_mac'));
 select.selectedIndex=1;select.dispatchEvent(new w.Event('change'));assert.equal(out.textContent,'');assert.equal(manual.value,'');assert(!d.getElementById('lm_selected_mac'));assert.equal(calls,2);
 assert(!errors.length,errors.join('; '));dom.window.close();console.log('Поиск физических устройств: недоверенные данные остаются текстом; выбор адаптера блокируется на время поиска, старые результаты очищаются.');
})().catch(e=>{console.error(e);process.exitCode=1;});
