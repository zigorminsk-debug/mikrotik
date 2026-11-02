#!/usr/bin/env node
'use strict';
const assert=require('assert'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
(async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};}});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));const guide=w.WIREGUARD_GUIDE,practice=w.WIREGUARD_PRACTICE;
 assert.deepStrictEqual(Array.from(guide,x=>x.name),['WireGuard','Peers']);assert.equal(guide.reduce((n,t)=>n+t.fields.length,0),29);
 for(const tab of guide){assert(practice[tab.name].steps.length>=3);assert.deepStrictEqual(Object.keys(practice[tab.name].fields).sort(),Array.from(tab.fields,x=>x.name).sort());}
 w.location.hash='ros-wireguard';await new Promise(r=>setTimeout(r,30));const doc=w.document,tabs=[...doc.querySelectorAll('.wb-tabs [role=tab]')];
 assert.deepStrictEqual(tabs.map(x=>x.textContent),['WireGuard','Peers']);
 for(let i=0;i<tabs.length;i++){
  tabs[i].click();const panel=doc.getElementById(tabs[i].getAttribute('aria-controls'));assert(panel&&!panel.hidden);assert.equal(panel.getAttribute('aria-labelledby'),tabs[i].id);assert.equal(tabs.filter(x=>x.getAttribute('aria-selected')==='true').length,1);
  assert(panel.querySelector('img[src="'+guide[i].image+'"]'));assert(panel.querySelector('figcaption').textContent.includes('одноразов'));assert(panel.querySelector('.wb-practice').textContent.includes('не применяет WireGuard')||panel.querySelector('.wb-practice').textContent.includes('заблокирован'));
  for(const field of panel.querySelectorAll('.wb-field')){assert(field.querySelector('.wb-field-purpose').textContent.length>30);assert(field.querySelector('.wb-field-use').textContent.length>30);assert(field.querySelector('.wb-field-setup').textContent.length>30);}
  assert(panel.querySelector('a[href^="https://manual.mikrotik.com/docs/"]'));
 }
 tabs[0].click();tabs[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(tabs[1].getAttribute('aria-selected'),'true');assert.equal(doc.activeElement,tabs[1]);
 const lab=doc.querySelector('.guide-lab');lab.querySelector('button').click();assert(lab.querySelector('input[value="vpn"]').disabled);assert(lab.textContent.includes('не реализовано'));assert(lab.querySelector('.guide-lab-start').disabled);
 const peers=guide[1],key=peers.fields.find(f=>f.name==='Allowed Address');assert(key.warning.includes('пересекаться'));assert(practice.Peers.caution.includes('ключи'));
 // Render all guide text as text, not HTML.
 const old=key.purpose;key.purpose='<img src=x onerror=alert(1)> тест';w.location.hash='ros-ip';await new Promise(r=>setTimeout(r,10));w.location.hash='ros-wireguard';await new Promise(r=>setTimeout(r,20));doc.querySelectorAll('.wb-tab')[1].click();const item=[...doc.querySelectorAll('.wb-field')].find(d=>d.querySelector('summary').textContent==='Allowed Address');assert(item.querySelector('.wb-field-purpose').textContent.includes('<img'));assert(!item.querySelector('.wb-field-purpose img'));key.purpose=old;
 assert(!errors.length,errors.join('; '));dom.window.close();console.log('WireGuard: 2 вкладки, 29 параметров, оригинальные снимки, практика, клавиатура и блокировка непроверенного VPN.');
})().catch(e=>{console.error(e);process.exitCode=1;});
