#!/usr/bin/env node
'use strict';
const assert=require('assert'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
(async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};}});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));
 for(const [id,g,p,names] of [['ros-ppp',w.PPP_GUIDE,w.PPP_PRACTICE,['Interface','PPPoE Servers','Secrets','Profiles','Active Connections']],['ros-bridge',w.BRIDGE_GUIDE,w.BRIDGE_PRACTICE,['Bridge','Ports','VLANs','Hosts']]]){
  assert.deepStrictEqual(Array.from(g,t=>t.name),names);assert(g.reduce((n,t)=>n+t.fields.length,0)>=20);
  for(const t of g){assert(p[t.name].steps.length>=3);assert.deepStrictEqual(Object.keys(p[t.name].fields).sort(),Array.from(t.fields,f=>f.name).sort());for(const f of t.fields){for(const key of ['name','purpose','use','setup'])assert(f[key].length>=15||key==='name',t.name+' '+f.name+' '+key);}}
  w.location.hash=id;await new Promise(r=>setTimeout(r,30));const doc=w.document,tabs=[...doc.querySelectorAll('.wb-tabs [role=tab]')];assert.deepStrictEqual(tabs.map(x=>x.textContent),names);
  for(let i=0;i<tabs.length;i++){tabs[i].click();const panel=doc.getElementById(tabs[i].getAttribute('aria-controls'));assert(panel&&!panel.hidden);assert.equal(panel.getAttribute('aria-labelledby'),tabs[i].id);assert.equal(tabs.filter(x=>x.getAttribute('aria-selected')==='true').length,1);assert(panel.querySelector('.wb-practice').textContent.includes('не примен'));assert(panel.querySelector('a[href^="https://manual.mikrotik.com/docs/"]'));assert.equal(panel.querySelectorAll('.wb-field').length,g[i].fields.length);for(const x of panel.querySelectorAll('.wb-field'))assert(x.querySelector('.wb-field-use')&&x.querySelector('.wb-field-purpose')&&x.querySelector('.wb-field-setup'));}
  tabs[0].click();tabs[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(doc.activeElement,tabs[1]);assert.equal(tabs[1].getAttribute('aria-selected'),'true');
  const old=g[0].fields[0].purpose;g[0].fields[0].purpose='<img src=x onerror=alert(1)> тест';w.location.hash='ros-ip';await new Promise(r=>setTimeout(r,10));w.location.hash=id;await new Promise(r=>setTimeout(r,30));const purpose=doc.querySelector('.wb-field-purpose');assert(purpose.textContent.includes('<img'));assert(!purpose.querySelector('img'));g[0].fields[0].purpose=old;
  const lab=doc.querySelector('.guide-lab');lab.querySelector('button').click();if(id==='ros-ppp'){assert(lab.querySelector('input[value="pppoe"]').disabled);assert(lab.querySelector('input[value="vpn"]').disabled);assert(lab.querySelector('.guide-lab-start').disabled);}
 }
 assert(!errors.length,errors.join('; '));dom.window.close();console.log('PPP и Bridge: структура, DOM, клавиатура, экранирование и запрет неподдержанного PPP.');
})().catch(e=>{console.error(e);process.exitCode=1;});
