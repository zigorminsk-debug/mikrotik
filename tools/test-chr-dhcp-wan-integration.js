#!/usr/bin/env node
'use strict';
// Windows GitHub Actions only: select DHCP WAN in the UI example,
// then run its main-process plan on one disposable isolated CHR. This does not
// test Electron system dialogs, real clients, physical networks or hardware.
const assert=require('assert'),fs=require('fs'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const E=require('../app/js/lab-sim'),{makePlan}=require('../windows/chr/plan');
const {ChrSession}=require('../windows/chr/session');
const [qemu,image,work,supervisor]=process.argv.slice(2);
if(!qemu||!image||!work||!supervisor)throw Error('Missing CI paths');
let session,dom;const errors=[];
(async()=>{
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};}});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));w.location.hash='lab';await new Promise(r=>setTimeout(r,30));
 w.document.getElementById('lab_example_chr_isolated').click();
 const isp=w.Lab.state.devices.find(d=>d.type==='isp');assert(isp);w.Lab.openSettings(isp.id);
 w.document.getElementById('lm_kind').value='dhcp';w.document.getElementById('lm_kind').dispatchEvent(new w.Event('change'));w.document.getElementById('lm_save').click();assert(w.document.getElementById('lab-modal').hidden);
 const state=JSON.parse(JSON.stringify(w.Lab.state)),router=state.devices.find(d=>d.type==='router');
 assert(router&&!errors.length);const plan=makePlan(E,state,router.id);assert.deepStrictEqual(plan.blockers,[]);
 assert.equal(plan.expected.wans[0].kind,'dhcp');assert.equal(plan.expected.wanPort,'ether1');
 session=new ChrSession({qemu:path.resolve(qemu),image:path.resolve(image),tempRoot:path.resolve(work),supervisor:path.resolve(supervisor)});
 assert.equal(session.internetConsent,false);const info=await session.start(plan);assert.equal(new URL(info.url).hostname,'127.0.0.1');
 const dir=session.directory;await session.stop();assert(!fs.existsSync(dir));
 console.log('::notice title=Isolated DHCP WAN::The UI-selected DHCP WAN was applied and verified on a disposable Windows CHR; temporary disk removed. The restricted QEMU lease is not proof of a default route or Internet. No physical device, client VM, external internet or native Electron dialogs tested.');
})().catch(e=>{console.log('::error title=Isolated CHR example::'+String(e.message).replace(/[\r\n%]/g,' '));process.exitCode=1;}).finally(async()=>{if(dom)dom.window.close();if(session)try{await session.stop();}catch(_){process.exitCode=1;}});
