#!/usr/bin/env node
'use strict';
const assert=require('assert'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
(async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};}});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));w.location.hash='ros-switch';await new Promise(r=>setTimeout(r,25));
 const d=w.document, section=w.GUIDE.sections.find(x=>x.id==='ros-switch');
 assert.equal(section.steps.length,7);assert(!d.querySelector('.wb-tabs'), 'thematic chapters must not pretend to be WinBox tabs');
 for(const title of ['Switch, Bridge','Порты моста','VLAN: access','MAC-таблица','Зеркалирование','Проверка в лаборатории']) assert(d.body.textContent.includes(title));
 for(const s of section.steps.slice(1)){assert(s.b.some(x=>x.k==='ol'));assert(s.b.some(x=>x.k==='warn'));}
 for(const name of ['menu','host','vlan']) {const img=d.querySelector('img[src="assets/img/own/switch-example-'+name+'.png"]');assert(img && img.closest('li'),name+' has no action image');}
 assert(d.body.textContent.includes('не воспроизводит физический switch-chip'));
 assert(d.body.textContent.includes('Фильтрацию') || d.body.textContent.includes('VLAN Filtering'));
 const lab=d.querySelector('.guide-lab');lab.querySelector('button').click();
 assert(lab.querySelector('input[value="switch-software"]').checked);
 for(const id of ['switch-offload','switch-mirror','switch-acl']) assert(lab.querySelector(`input[value="${id}"]`).disabled);
 const fire=lab.querySelector('input[value="firewall"]');fire.checked=false;fire.dispatchEvent(new w.Event('change'));assert(lab.querySelector('.guide-lab-start').disabled);
 assert(lab.querySelector('.guide-lab-errors').textContent.includes('Firewall'));
 assert(!errors.length,errors.join('; '));dom.window.close();console.log('Switch: тематические главы, реальные ограничения CHR и блокировка аппаратных функций проверены.');
})().catch(e=>{console.error(e);process.exitCode=1;});
