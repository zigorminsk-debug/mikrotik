#!/usr/bin/env node
'use strict';
// Renderer UI -> exact IPC snapshot -> real main-process plan/online guard.
// Network and native dialogs are tested separately; this does not start CHR.
const assert = require('assert');
const path = require('path');
const {JSDOM,VirtualConsole} = require('jsdom');
const E = require('../app/js/lab-sim');
const {makePlan} = require('../windows/chr/plan');
const {validateDualInternet} = require('../windows/chr/online');
(async () => {
 const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};}});
 const w=dom.window; await new Promise(r=>w.addEventListener('load',r));
 const d=w.document,$=id=>d.getElementById(id);
 w.location.hash='lab'; await new Promise(r=>setTimeout(r,30));
 const r=w.Lab.place('router',200,120), a=w.Lab.place('isp',20,10), b=w.Lab.place('isp',400,10), pc=w.Lab.place('pc',100,300), pc2=w.Lab.place('pc',300,300);
 w.Lab.link(a,r); w.Lab.link(r,pc); w.Lab.link(r,pc2); w.Lab.link(b,r);
 function configureIsp(id,priority,ip,gw,dns) {
  w.Lab.openSettings(id); $('lm_kind').value='static';$('lm_kind').dispatchEvent(new w.Event('change'));$('lm_priority').value=priority;
  $('lm_ip').value=ip; $('lm_gw2').value=gw; $('lm_dns').value=dns; $('lm_save').click(); assert($('lab-modal').hidden, $('lm_err').textContent);
 }
 configureIsp(a,'primary','10.0.2.20/24','10.0.2.2','10.0.2.3');
 configureIsp(b,'backup','10.0.3.20/24','10.0.3.2','10.0.3.3');
 for (const id of [pc,pc2]) { w.Lab.openSettings(id);$('lm_mode').value='dhcp';$('lm_mode').dispatchEvent(new w.Event('change'));$('lm_save').click();assert($('lab-modal').hidden); }
 w.Lab.openSettings(r);$('lm_wan_failover').checked=true;$('lm_router_failover').checked=false;
 $('lm_custom_dns').checked=true;$('lm_custom_dns').dispatchEvent(new w.Event('change'));$('lm_dns_primary').value='10.0.2.3';$('lm_dns_secondary').value='10.0.3.3';
 let captured;w.routerOS={launch:async(id,state)=>{captured={id,state};return {ok:true};}};
 $('lm_open_chr').click();await new Promise(r=>setTimeout(r,20));assert(captured && captured.id===r, $('lm_err').textContent);
 const state=JSON.parse(JSON.stringify(captured.state)), plan=makePlan(E,state,r,{allowDualStaticWan:true});
 assert.deepStrictEqual(plan.blockers,[]);assert(validateDualInternet(plan.expected));
 assert.deepStrictEqual(plan.expected.wans.map(x=>x.port),['ether1','ether4']);
 assert.equal(plan.expected.dns,'10.0.2.3,10.0.3.3');assert(!errors.length,errors.join('; '));
 dom.window.close();console.log('Два WAN: настройки форм и порядок соединений передаются в план CHR без замены адресов.');
})().catch(e=>{console.error(e);process.exitCode=1;});
