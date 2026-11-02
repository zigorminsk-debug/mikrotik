#!/usr/bin/env node
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
(async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};}});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));w.location.hash='ros-ip';await new Promise(r=>setTimeout(r,60));
 const section=w.GUIDE.sections.find(s=>s.id==='ros-ip');const step=section.steps.find(s=>s.t==='IP → Addresses: учебный пример со стрелками');assert(step);
 const list=step.b.find(b=>b.k==='ol');assert.equal(list.items.length,5);
 const names=['new','row','address','interface','ok'];names.forEach((name,i)=>{
  const item=list.items[i],src='assets/img/own/winbox-address-example-'+name+'.png';assert.equal(item.shot.src,src);assert(item.shot.cap);assert(fs.existsSync(path.join(__dirname,'../app',src)));assert(w.document.querySelector('#content img[src="'+src+'"]'),src);
 });
 const text=step.b.map(b=>JSON.stringify(b)).join(' ');assert(text.includes('не снимки текущей схемы'));assert(text.includes('пока не реализованы'));assert(text.includes('не пустая форма New'));assert(text.includes('не подтверждают нажатие'));assert(!errors.length,errors.join('; '));dom.window.close();console.log('Учебные стрелки: 5 снимков, подписи и ограничения отображаются в разделе IP.');
})().catch(e=>{console.error(e);process.exitCode=1;});
