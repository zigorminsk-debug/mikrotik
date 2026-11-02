#!/usr/bin/env node
'use strict';
// CI only: actual app DOM -> injected bridge -> real isolated controller/VMs.
// Consent dialogs, real Electron IPC, installed EXE and physical network are
// covered separately or not tested. Never execute a renderer-provided command.
const assert=require('assert'),path=require('path'),fs=require('fs').promises;
const {JSDOM,VirtualConsole}=require('jsdom');
const engine=require('../app/js/lab-sim'),{ExperimentalLab}=require('../windows/chr/experimental-lab');
const [qemu,chrImage,linuxImage,tempRoot,supervisor]=process.argv.slice(2).map(x=>x&&path.resolve(x));
if(!qemu||!chrImage||!linuxImage||!tempRoot||!supervisor)throw Error('Missing CI parameters');
let lab,dom,launchOperation,pingOperation,stage='open UI';const errors=[];
(async()=>{
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
  w.routerOS={launch:async()=>{throw Error('Wrong mode');},launchClients:(routerId,state)=>{
   lab=new ExperimentalLab({engine,state,routerId,qemu,chrImage,linuxImage,tempRoot,supervisor});
   launchOperation=lab.start().then(info=>({ok:true,clients:info.clients}));return launchOperation;
  },ping:(routerId,state,target)=>{pingOperation=lab.ping(target).then(r=>({ok:true,address:target,...r}));return pingOperation;},
  pingClient:(routerId,clientId,state,target)=>{pingOperation=lab.pingClient(clientId,target).then(r=>({ok:true,address:target,...r}));return pingOperation;}};
 }});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));w.location.hash='lab';await new Promise(r=>setTimeout(r,50));
 const doc=w.document,$=id=>doc.getElementById(id);$('lab_example_chr_isolated').click();w.Lab.run({instant:true});
 const button=doc.querySelector('.lab-checked-launch[data-clients="true"]');assert(button);stage='launch actual VMs from UI';button.click();await new Promise(r=>setTimeout(r,100));assert(launchOperation);const launched=await launchOperation;await new Promise(r=>setTimeout(r,100));assert.equal(launched.clients.length,1);
 const client=launched.clients[0],router=JSON.parse(JSON.stringify(w.Lab.state)).devices.find(d=>d.type==='router');assert(router);
 stage='UI Linux client to CHR';$('lab-ping-source').value=client.id;$('lab-ping-target').value='192.168.88.1';$('lab-ping-run').click();await new Promise(r=>setTimeout(r,100));assert(pingOperation);let result=await pingOperation;await new Promise(r=>setTimeout(r,100));assert.equal(result.received,3);assert($('lab-ping-result').textContent.includes('получено 3'));
 stage='UI CHR to Linux client';$('lab-ping-source').value=router.id;$('lab-ping-target').value=client.address;$('lab-ping-run').click();await new Promise(r=>setTimeout(r,100));result=await pingOperation;await new Promise(r=>setTimeout(r,100));assert.equal(result.received,3);assert($('lab-ping-result').textContent.includes('получено 3'));
 assert(!errors.length,errors.join('; '));stage='cleanup';await lab.stop();assert.deepStrictEqual(await fs.readdir(tempRoot),[]);
 console.log('::notice title=UI to real Linux guest ping::Actual lab UI with injected test bridge launched one disposable CHR and Linux client from the checked example; both directions returned 3 replies and temporary disks were removed. No real Electron IPC, consent dialog, installed EXE, VPN or internet tested.');
})().catch(e=>{console.log('::error title=UI to real Linux guest::'+stage+': '+String(e.message).replace(/[\r\n%]/g,' '));process.exitCode=1;}).finally(async()=>{if(dom)dom.window.close();if(lab)try{await lab.stop();}catch(_){process.exitCode=1;}});
