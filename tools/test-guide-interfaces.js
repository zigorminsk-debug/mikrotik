#!/usr/bin/env node
'use strict';
const assert=require('assert'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
(async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};}});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));
 const examples=w.INTERFACES_PRACTICE;assert.equal(Object.keys(examples).length,w.INTERFACES_GUIDE.length);
 for(const tab of w.INTERFACES_GUIDE){const example=examples[tab.name];assert(example&&example.steps.length>=3);assert.deepStrictEqual(Object.keys(example.fields).sort(),Array.from(tab.fields,f=>f.name).sort(),tab.name+' has missing or stale use cases');}
 // User-facing lesson data are always rendered as text, not executable HTML.
 const originalUse=examples.Interface.use,originalSource=examples.Interface.source;
 examples.Interface.use='<img src=x onerror=alert(1)> учебный текст';examples.Interface.source='https://example.com/untrusted';
 w.location.hash='ros-interfaces';await new Promise(r=>setTimeout(r,30));
 assert(w.document.querySelector('.wb-practice').textContent.includes('<img src=x onerror=alert(1)>'));assert(!w.document.querySelector('.wb-practice img'));assert(!w.document.querySelector('.wb-practice').querySelector('a'));
 examples.Interface.use=originalUse;examples.Interface.source=originalSource;
 const doc=w.document,buttons=[...doc.querySelectorAll('.wb-tabs [role=tab]')];
 assert.deepStrictEqual(buttons.map(b=>b.textContent),['Interface','Interface List','Ethernet','EoIP Tunnel','IP Tunnel','GRE Tunnel','VLAN','VXLAN','VRRP','MACsec','MACVLAN','Bonding','LTE']);
 assert(doc.querySelector('.guide-lab'));
 for(let i=0;i<buttons.length;i++){
  buttons[i].click();assert.equal(buttons.filter(b=>b.getAttribute('aria-selected')==='true').length,1);
  const panel=doc.getElementById(buttons[i].getAttribute('aria-controls'));assert(panel&&!panel.hidden);assert.equal(panel.getAttribute('aria-labelledby'),buttons[i].id);
  assert.equal([...doc.querySelectorAll('.wb-tab-panel')].filter(p=>!p.hidden).length,1);
  const practice=panel.querySelector('.wb-practice');assert(practice,buttons[i].textContent+' missing practice');practice.open=true;assert(practice.querySelectorAll('li').length>=3);assert(practice.textContent.includes('Где применяется:')&&practice.textContent.includes('Как проверить:')&&practice.textContent.includes('В лаборатории:')&&practice.textContent.includes('скриншоты WinBox'));
  const fields=[...panel.querySelectorAll('.wb-field')];assert(fields.length>=3,buttons[i].textContent);
  fields.forEach(d=>{assert(d.querySelector('summary').textContent);assert(d.querySelector('.wb-field-purpose').textContent.length>30);assert(d.querySelector('.wb-field-use')&&d.querySelector('.wb-field-use').textContent.length>45);assert(d.querySelector('.wb-field-setup').textContent.length>30);});
  fields[0].open=true;assert(fields[0].open);assert(panel.textContent.includes('не изменяет RouterOS'));
 }
 buttons[0].click();buttons[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(buttons[1].getAttribute('aria-selected'),'true');assert.equal(doc.activeElement,buttons[1]);
 buttons[1].dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(buttons[12].getAttribute('aria-selected'),'true');
 buttons[12].dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(buttons[0].getAttribute('aria-selected'),'true');
 const lab=doc.querySelector('.guide-lab');lab.querySelector('button').click();assert(lab.querySelector('input[value="guest-vlan"]'));assert(lab.querySelector('input[value="guest-dhcp"]'));
 assert(!errors.length,errors.join('; '));dom.window.close();console.log('Interfaces: порядок 13 вкладок, описания, клавиатура и лабораторные варианты проверены.');
})().catch(e=>{console.error(e);process.exitCode=1;});
