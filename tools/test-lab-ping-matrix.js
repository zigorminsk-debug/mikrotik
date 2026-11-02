#!/usr/bin/env node
'use strict';
const assert=require('assert'),path=require('path'),{JSDOM,VirtualConsole}=require('jsdom');
const delay=()=>new Promise(r=>setTimeout(r,20));
(async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));let calls=[],handler,closed;
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
  w.routerOS={onClosed:fn=>{closed=fn;},launch:async()=>({ok:true}),launchClients:async(id,state)=>({ok:true,clients:[{id:state.devices.find(d=>d.type==='pc').id,address:'192.168.88.10',type:'pc',mode:'static'}]}),
   ping:(...a)=>{calls.push(['chr',...a]);return handler('chr',a);},pingClient:(...a)=>{calls.push(['client',...a]);return handler('client',a);}};
 }});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));w.location.hash='intro';await delay();assert(w.document.querySelector('img[src="assets/img/own/lab-matrix-button-windows.png"]'), 'missing illustrated tutorial action');w.location.hash='lab';await delay();const d=w.document,$=id=>d.getElementById(id);
 $('lab_example_chr_isolated').click();w.Lab.run({instant:true});assert($('lab-matrix-start').disabled);
 d.querySelector('.lab-checked-launch[data-clients="true"]').click();await delay();assert(!$('lab-matrix-start').disabled);assert($('lab-matrix-status').textContent.includes('готовы к проверке'));
 const client=w.Lab.state.devices.find(x=>x.type==='pc'),router=w.Lab.state.devices.find(x=>x.type==='router');
 handler=(kind,args)=>Promise.resolve({ok:true,address:args.at(-1),sent:3,received:kind==='chr'?3:0});
 $('lab-matrix-start').click();await delay();assert.equal(calls.length,2);assert.equal(calls[0][0],'chr');assert.equal(calls[0].at(-1),'192.168.88.10');assert.equal(calls[1][0],'client');assert.equal(calls[1][2],client.id);assert.equal(calls[1].at(-1),router.cfg.gw);
 assert($('lab-matrix-status').textContent.includes('проверены'));assert($('lab-matrix-results').textContent.includes('получено 3 из 3'));assert($('lab-matrix-results').textContent.includes('получено 0 из 3'));
 calls=[];let pendingOne;handler=()=>new Promise(r=>{pendingOne=r;});$('lab-ping-target').value='192.168.88.10';$('lab-ping-run').click();await delay();assert($('lab-matrix-start').disabled);$('lab-matrix-start').click();assert.equal(calls.length,1);pendingOne({ok:false,cancelled:true});await delay();assert(!$('lab-matrix-start').disabled);
 calls=[];handler=()=>Promise.resolve({ok:false,cancelled:true});$('lab-matrix-start').click();await delay();assert.equal(calls.length,1);assert($('lab-matrix-status').textContent.includes('остановлена'));assert($('lab-matrix-results').textContent.includes('отменено'));
 calls=[];handler=()=>Promise.resolve({ok:true,address:'192.168.88.99',sent:3,received:3});$('lab-matrix-start').click();await delay();assert.equal(calls.length,1);assert($('lab-matrix-results').textContent.includes('неизвестен'));
 calls=[];let finish;handler=()=>new Promise(r=>{finish=r;});$('lab-matrix-start').click();await delay();assert.equal(calls.length,1);assert($('lab-ping-run').disabled);$('lab-matrix-stop').click();finish({ok:true,address:'192.168.88.10',sent:3,received:3});await delay();assert.equal(calls.length,1);assert($('lab-matrix-status').textContent.includes('остановлена'));assert(!$('lab-ping-run').disabled);
 calls=[];handler=()=>new Promise(r=>{finish=r;});$('lab-matrix-start').click();await delay();closed();finish({ok:true,address:'192.168.88.10',sent:3,received:3});await delay();assert.equal(calls.length,1);assert($('lab-matrix-start').disabled);
 // Scheme replacement while a response is outstanding must not launch another pair.
 d.querySelector('.lab-checked-launch[data-clients="true"]').click();await delay();calls=[];handler=()=>new Promise(r=>{finish=r;});$('lab-matrix-start').click();await delay();w.Lab.reset();finish({ok:true,address:'192.168.88.10',sent:3,received:3});await delay();assert.equal(calls.length,1);
 assert(!errors.length,errors.join('; '));dom.window.close();console.log('Ping matrix: sequential pairs, stop/cancel, stale scheme, close and malformed responses verified on mocks.');
})().catch(e=>{console.error(e);process.exitCode=1;});
