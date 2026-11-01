#!/usr/bin/env node
'use strict';
const assert=require('assert'),path=require('path'),fs=require('fs'),{execFileSync}=require('child_process');
const {JSDOM,VirtualConsole}=require('jsdom');
(async()=>{
 execFileSync(process.execPath,[path.join(__dirname,'generate-release-history.js'),'--check'],{stdio:'pipe'});
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));let requests=0;
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.fetch=()=>{requests++;return Promise.reject(Error('offline'));};}});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));
 const doc=w.document, nav=doc.querySelector('a[data-sec="about"]');assert(nav);assert.equal(nav.textContent.includes('О программе'),true);
 const current=w.APP_VERSION;const files=fs.readdirSync(path.join(__dirname,'../docs/releases')).filter(x=>/^\d+\.\d+\.\d+\.md$/.test(x));
 assert.equal(w.RELEASE_HISTORY.length,files.length);assert(w.RELEASE_HISTORY.some(x=>x.version==='1.19.2'));assert(w.RELEASE_HISTORY.some(x=>x.version===current));
 // Inject untrusted text: it must remain text, never become markup.
 w.RELEASE_HISTORY.find(x=>x.version===current).entries.push({kind:'text',text:'<img src=x onerror=alert(1)> тест'});
 w.location.hash='about';await new Promise(r=>setTimeout(r,20));
 assert.equal(doc.getElementById('topbar-title').textContent,'О программе');assert(!doc.getElementById('content').hidden);assert.equal(doc.querySelector('.guide-lab'),null);
 assert(doc.getElementById('content').textContent.includes('версия '+current));assert.equal(doc.querySelectorAll('.release-entry').length,files.length);
 const active=doc.querySelector('.release-entry[open]');assert(active);assert(active.querySelector('summary').textContent.includes(current));assert(active.textContent.includes('тест'));assert(!active.querySelector('img'));
 assert(doc.querySelector('.release-history').textContent.includes('1.19.2'));assert(doc.getElementById('content').textContent.includes('без интернета'));assert.equal(requests,0);
 const old=Array.from(doc.querySelectorAll('.release-entry')).find(x=>x.querySelector('summary').textContent.includes('1.19.2'));assert(old&&!old.open);old.open=true;assert(old.textContent.includes('MAC'));
 assert(!errors.length,errors.join('; '));dom.window.close();console.log('О программе: офлайн-история версий, навигация и безопасный рендер проверены.');
})().catch(e=>{console.error(e);process.exitCode=1;});
