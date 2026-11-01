#!/usr/bin/env node
'use strict';
// CI only: real guide UI -> model -> private plan -> disposable isolated CHR.
// No physical router, actual clients, internet, WinBox or packaged EXE tested.
const assert=require('assert'),fs=require('fs'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const engine=require('../app/js/lab-sim'),{makePlan}=require('../windows/chr/plan');
const {ChrSession}=require('../windows/chr/session');
const [qemu,image,work,supervisor]=process.argv.slice(2),kind=process.env.CI_GUIDE_CASE;
const cases={ip:'ros-ip',dhcp:'ros-ip',bridge:'ros-bridge',system:'ros-system',routing:'ros-routing'};
if(!qemu||!image||!work||!supervisor||!cases[kind])throw Error('Missing or invalid CI arguments');
let session,dom;const errors=[];
(async()=>{
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};}});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));w.location.hash=cases[kind];await new Promise(r=>setTimeout(r,30));
 const root=w.document.querySelector('.guide-lab');assert(root);root.querySelector('button').click();
 const enable=id=>{const input=root.querySelector('input[value="'+id+'"]');assert(input&&!input.disabled);input.checked=true;input.dispatchEvent(new w.Event('change'));};
 if(kind==='dhcp'){const input=root.querySelector('input[value="wan-static"]');input.checked=false;input.dispatchEvent(new w.Event('change'));enable('wan-dhcp');}
 if(kind==='ip')enable('dns-static');
 if(kind==='bridge'){enable('guest-vlan');enable('guest-dhcp');}
 if(kind==='system')enable('ntp');
 const button=root.querySelector('.guide-lab-start');assert(button&&!button.disabled);button.click();await new Promise(r=>setTimeout(r,50));
 assert.equal(w.location.hash,'#lab');assert(w.document.getElementById('lab-results').textContent.includes('Проверка учебной модели пройдена'));
 const state=JSON.parse(JSON.stringify(w.Lab.state)),router=state.devices.find(x=>x.type==='router');assert(router&&!errors.length);
 const plan=makePlan(engine,state,router.id);assert.deepStrictEqual(plan.blockers,[]);
 if(kind==='dhcp')assert.equal(plan.expected.wans[0].kind,'dhcp');
 if(kind==='ip')assert(plan.expected.dnsStatic);
 if(kind==='bridge')assert(plan.expected.vlan&&plan.expected.guestDhcp);
 if(kind==='system')assert(plan.expected.ntp&&plan.expected.identity);
 if(kind==='routing')assert(plan.expected.staticRoute);
 session=new ChrSession({qemu:path.resolve(qemu),image:path.resolve(image),tempRoot:path.resolve(work),supervisor:path.resolve(supervisor)});
 assert.equal(session.internetConsent,false);const info=await session.start(plan);assert.equal(new URL(info.url).hostname,'127.0.0.1');
 const dir=session.directory;await session.stop();assert(!fs.existsSync(dir));
 console.log('::notice title=Guide to isolated CHR::Selected '+kind+' in the actual guide UI, applied and verified its generated plan in disposable CHR and deleted the disk. No physical device, client VM, internet, WinBox screenshots or packaged EXE tested.');
})().catch(e=>{console.log('::error title=Guide to isolated CHR::'+String(e.message).replace(/[\r\n%]/g,' '));process.exitCode=1;}).finally(async()=>{if(dom)dom.window.close();if(session)try{await session.stop();}catch(_){process.exitCode=1;}});
