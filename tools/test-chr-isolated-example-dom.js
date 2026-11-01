#!/usr/bin/env node
'use strict';
// UI creates only a diagram. Test the exact preset through the real CHR plan;
// no CHR, network, device, native dialog or application build is involved.
const assert=require('assert'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const E=require('../app/js/lab-sim'),{makePlan}=require('../windows/chr/plan');
(async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};}});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));const $=id=>w.document.getElementById(id);
 w.location.hash='lab';await new Promise(r=>setTimeout(r,30));
 let launch=0,confirm=0,received=null;w.routerOS={launch:(id,selected)=>{launch++;received={id,selected};return Promise.resolve({ok:true});}};
 w.Lab.place('router',50,50);const before=JSON.stringify(w.Lab.state);
 w.confirm=message=>{confirm++;assert(message.includes('будут удалены'));assert(message.includes('не запускает CHR'));return false;};
 $('lab_example_chr_isolated').click();assert.equal(JSON.stringify(w.Lab.state),before);assert.equal(confirm,1);assert.equal(launch,0);
 w.confirm=()=>true;$('lab_example_chr_isolated').click();assert.equal(launch,0);
 const state=JSON.parse(JSON.stringify(w.Lab.state));assert.equal(state.devices.length,3);assert.equal(state.links.length,2);
 const router=state.devices.find(d=>d.type==='router'),isp=state.devices.find(d=>d.type==='isp'),pc=state.devices.find(d=>d.type==='pc');
 assert(router&&!router.cfg.wanFailover&&!router.cfg.routerFailover);assert.equal(isp.cfg.ip,'198.51.100.2/30');assert.equal(pc.cfg.mode,'dhcp');
 const plan=makePlan(E,state,router.id);assert.deepStrictEqual(plan.blockers,[]);assert.equal(plan.expected.wanPort,'ether1');assert.equal(plan.expected.wanAddress,isp.cfg.ip);assert.equal(plan.expected.lanPorts[0].name,'ether2');
 // A successful model check never launches CHR on its own.
 w.LAB_INSTANT=true;$('lab_run').click();assert.equal(launch,0);
 const button=w.document.querySelector('.lab-checked-launch');assert(button);assert($('lab-checked-chr').textContent.includes('снимки всех настроек'));
 button.click();button.click();await new Promise(r=>setTimeout(r,0));assert.equal(launch,1);assert.equal(received.id,router.id);assert.deepStrictEqual(JSON.parse(JSON.stringify(received.selected)),state);assert.deepStrictEqual(makePlan(E,received.selected,router.id).blockers,[]);
 assert($('lab-checked-chr-status').textContent.includes('открыта'));
 // Even state changes that leave the model displayed must not launch stale results.
 w.Lab.state.devices.find(d=>d.id===router.id).on=false;button.click();await new Promise(r=>setTimeout(r,0));assert.equal(launch,1);assert($('lab-checked-chr-status').textContent.includes('изменилась'));
 // Invalidating the result removes the action; no automatic launch on recheck.
 $('lab_reset').click();assert(!$('lab-checked-chr'));assert.equal(launch,1);w.confirm=()=>true;$('lab_example_chr_isolated').click();$('lab_run').click();assert.equal(launch,1);
 // A second click into an empty diagram must not require confirmation.
 $('lab_reset').click();w.confirm=()=>{throw Error('Unexpected confirmation');};$('lab_example_chr_isolated').click();assert.equal(launch,1);
 assert(!errors.length,errors.join('; '));dom.window.close();console.log('Изолированный пример CHR: подтверждение замены, схема, реальный план и отсутствие запуска проверены.');
})().catch(e=>{console.error(e);process.exitCode=1;});
