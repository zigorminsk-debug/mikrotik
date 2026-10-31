#!/usr/bin/env node
'use strict';
const assert=require('assert');const path=require('path');const {JSDOM,VirtualConsole}=require('jsdom');
(async()=>{
 const errs=[];let scans=0,launches=0;const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.routerOS={physicalInterfaces:async()=>({ok:true,interfaces:[{name:'example',address:'192.0.2.5'}]}),discoverPhysical:async()=>{scans++;return {ok:true,devices:[]};},launch:async()=>{launches++;return {ok:false};}};
 }});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));const d=w.document,$=x=>d.getElementById(x);
 w.location.hash='lab';await new Promise(r=>setTimeout(r,40));
 const isp=w.Lab.place('isp',100,0),rt=w.Lab.place('router',100,120),pc=w.Lab.place('pc',100,250);w.Lab.link(isp,rt);w.Lab.link(rt,pc);
 const provider=w.Lab.state.devices.find(x=>x.id===isp);provider.name='<img src=x onerror=alert(1)>';Object.assign(provider.cfg,{kind:'static',ip:'198.51.100.2/30',gw:'198.51.100.1',dns:'1.1.1.1',pass:'SECRET_ISP'});
 w.Lab.state.devices.find(x=>x.id===pc).cfg.gw='192.168.88.2';
 w.Lab.openSettings(rt);await new Promise(r=>setTimeout(r,20));$('lm_gw').value='192.168.88.2';$('lm_preview_physical').click();
 assert($('lab-modal').hidden);assert.equal(w.Lab.state.devices.find(x=>x.id===rt).cfg.gw,'192.168.88.2');
 const preview=$('physical-preview');assert(preview&&!$('lab-results').hidden);assert(preview.textContent.includes('192.168.88.2'));assert(preview.textContent.includes('ничего')||preview.textContent.includes('Ничего'));
 assert(preview.textContent.includes('<img src=x'));assert(!preview.querySelector('img,script'));assert(!preview.textContent.includes('SECRET_ISP'));assert(preview.textContent.includes('Применение недоступно'));
 assert.equal(scans,0);assert.equal(launches,0);
 // An edit invalidates the displayed result, rather than keeping a stale plan.
 w.Lab.openSettings(rt);$('lm_gw').value='192.168.88.3';$('lm_save').click();assert($('lab-results').hidden);assert(!$('physical-preview'));
 // Invalid form values must not save or render a misleading preview.
 w.Lab.openSettings(rt);$('lm_gw').value='invalid';$('lm_preview_physical').click();assert(!$('lab-modal').hidden);assert(!$('lm_err').hidden);assert($('lab-results').hidden);$('lm_cancel').click();
 // Invalid topology displays errors, never details of a different device.
 w.Lab.place('router',300,100);w.Lab.openSettings(rt);$('lm_preview_physical').click();assert($('physical-preview').textContent.includes('одним'));assert(!$('physical-preview').textContent.includes('Предполагаемые порты'));
 await new Promise(r=>setTimeout(r,50));assert(!errs.length,errs.join('; '));dom.window.close();console.log('DOM: сохранение формы, отсутствие сети, очистка, ошибки и защита от HTML проверены.');
})().catch(e=>{console.error(e);process.exitCode=1;});
