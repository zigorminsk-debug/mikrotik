#!/usr/bin/env node
'use strict';
const assert=require('assert'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const engine=require('../app/js/lab-sim'),{makePlan}=require('../windows/chr/plan');
(async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};}});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));const doc=w.document;
 // Use actual device defaults, not a second copy that could drift.
 const saved={};['isp','router','pc','server'].forEach(type=>{const id=w.Lab.place(type,30,30);saved[type]=JSON.parse(JSON.stringify(w.Lab.state.devices.find(d=>d.id===id).cfg));});w.Lab.reset();
 const types=Object.fromEntries(Object.keys(saved).map(type=>[type,{cfg:()=>JSON.parse(JSON.stringify(saved[type]))}]));
 const sections=['intro','ros-ip','ros-interfaces','ros-bridge','ros-routing','ros-system','ros-queues','ros-log','ros-ipv6'];let checked=0,invalid=0;
 for(const section of sections){
  const cat=w.GuideLab.catalog(section);const available=cat.choices.filter(c=>!c.unavailable).map(c=>c.id);
  for(let bits=0;bits<(1<<available.length);bits++){
   const chosen=available.filter((_,i)=>bits&(1<<i)), validation=w.GuideLab.validate(section,chosen), draft=w.GuideLab.build(section,chosen,types,engine);
   if(validation.errors.length){assert(draft.errors.length,section+' accepted invalid '+chosen);invalid++;continue;}
   assert.equal(draft.errors.length,0,section+' '+chosen+': '+draft.errors.join('; '));
   const plan=makePlan(engine,JSON.parse(JSON.stringify(draft.state)),'d2');
   assert.equal(plan.blockers.length,0,section+' '+chosen+': '+plan.blockers.join('; '));
   const rt=draft.state.devices.find(d=>d.id==='d2');
   assert.equal(plan.expected.dhcp,rt.cfg.dhcp);assert.equal(plan.expected.vlan,rt.cfg.vlanGuest);
   assert.equal(plan.expected.wans[0].kind,chosen.includes('wan-dhcp')?'dhcp':'static');
   assert.equal(!!plan.expected.ntp,rt.cfg.ntpClient);assert.equal(!!plan.expected.staticRoute,rt.cfg.staticRoute);
   assert.equal(!!plan.expected.ipv6Lab,chosen.includes('ipv6-lan'));
   assert.deepStrictEqual(plan.expected.logTopics,['system','interface'].filter(x=>chosen.includes('log-'+x)));
   if(chosen.includes('simple-queue')){assert.deepStrictEqual(plan.expected.simpleQueue,{target:'192.168.88.10/32',rate:'10000000'});assert.equal(draft.state.devices.find(d=>d.type==='pc').cfg.mode,'static');}else assert.equal(plan.expected.simpleQueue,null);
   if(chosen.includes('publication')){const pub=plan.expected.natRules.filter(x=>x.chain==='dstnat');assert.equal(pub.length,1);assert.equal(pub[0]['dst-port'],'8443');assert.equal(pub[0]['to-addresses'],'192.168.88.20');assert.equal(pub[0]['to-ports'],'443');assert(plan.expected.filterRules.some(x=>x['connection-nat-state']==='dstnat'&&x['dst-port']==='443'));}else assert(!plan.expected.natRules.some(x=>x.chain==='dstnat'));
   checked++;
  }
 }
 assert(checked>20&&invalid>20);assert(w.GuideLab.validate('ros-ip',['wan-static','wan-dhcp','nat','firewall']).errors.some(x=>x.includes('одновременно')));
 assert(w.GuideLab.validate('ros-bridge',['bridge','guest-vlan']).errors.some(x=>x.includes('Firewall')));
 assert(w.GuideLab.validate('ros-bridge',['bridge','firewall','guest-dhcp']).errors.some(x=>x.includes('требует')));
 assert(w.GuideLab.validate('ros-ip',['wan-static','firewall','nat','dns-static']).errors.some(x=>x.includes('DNS-кэша')));
 assert(w.GuideLab.validate('ros-ip',['wan-static','firewall']).errors.some(x=>x.includes('NAT')));
 assert(w.GuideLab.validate('ros-ip',['wan-static','nat','publication']).errors.some(x=>x.includes('Публикация')));
 assert(w.GuideLab.catalog('ros-system').choices.some(x=>x.id==='log-system'&&!x.unavailable));
 assert(w.GuideLab.catalog('ros-system').choices.some(x=>x.id==='log-interface'&&!x.unavailable));
 assert(w.GuideLab.validate('ros-ipv6',['ipv6-dhcp']).errors.some(x=>x.includes('DHCPv6')));
 assert(w.GuideLab.validate('ros-ipv6',['ipv6-route']).errors.some(x=>x.includes('связность')));
 assert(w.GuideLab.validate('ros-log',['log-remote']).errors.some(x=>x.includes('syslog')));
 assert(w.GuideLab.validate('ros-queues',['queue-tree']).errors.some(x=>x.includes('Queue Tree')));
 assert(w.GuideLab.validate('ros-wifi',['wifi']).errors.some(x=>x.includes('Wi-Fi')));
 assert(w.GuideLab.validate('ros-ip',['unknown']).errors.length);
 // Every visible, normal guide section exposes the action, including unimplemented ones.
 for(const section of w.GUIDE.sections.filter(s=>!s.hiddenNav&&!s.type)){
  w.location.hash=section.id;await new Promise(r=>setTimeout(r,0));assert(doc.querySelector('.guide-lab'),section.id+' no action');
 }
 w.location.hash='ros-ip';await new Promise(r=>setTimeout(r,0));let root=doc.querySelector('.guide-lab');root.querySelector('button').click();
 const query=id=>root.querySelector('input[value="'+id+'"]');query('wan-dhcp').checked=true;query('wan-dhcp').dispatchEvent(new w.Event('change'));
 assert(root.querySelector('.guide-lab-start').disabled);assert(root.querySelector('.guide-lab-errors').textContent.includes('одновременно'));
 const before=JSON.stringify(w.Lab.state);root.querySelector('.guide-lab-start').click();assert.equal(JSON.stringify(w.Lab.state),before);assert.equal(w.location.hash,'#ros-ip');
 query('wan-static').checked=false;query('wan-static').dispatchEvent(new w.Event('change'));assert(!root.querySelector('.guide-lab-start').disabled);
 let launches=0;w.routerOS={launch:()=>{launches++;return Promise.resolve({ok:true});}};root.querySelector('.guide-lab-start').click();await new Promise(r=>setTimeout(r,40));assert.equal(w.location.hash,'#lab');assert.equal(launches,0);
 assert.equal(w.Lab.state.devices.find(d=>d.type==='isp').cfg.kind,'dhcp');assert(doc.getElementById('lab-results').textContent.includes('Проверка учебной модели пройдена'));
 // Cancel replacement must preserve state, and an invalid explicit API call must not mutate it.
 const original=JSON.stringify(w.Lab.state);w.location.hash='ros-bridge';await new Promise(r=>setTimeout(r,0));root=doc.querySelector('.guide-lab');root.querySelector('button').click();w.confirm=()=>false;root.querySelector('.guide-lab-start').click();assert.equal(JSON.stringify(w.Lab.state),original);assert.equal(w.location.hash,'#ros-bridge');
 assert(!w.Lab.loadGuide('ros-ip',['wan-static','wan-dhcp']).ok);assert.equal(JSON.stringify(w.Lab.state),original);
 w.location.hash='ros-wifi';await new Promise(r=>setTimeout(r,0));root=doc.querySelector('.guide-lab');root.querySelector('button').click();assert(root.querySelector('input[value="wifi"]').disabled);assert(root.textContent.includes('не эмулирует'));assert(root.querySelector('.guide-lab-start').disabled);
 assert(!errors.length,errors.join('; '));dom.window.close();console.log('Переходы учебника: '+checked+' допустимых и '+invalid+' конфликтных наборов; план CHR и защита проверены.');
})().catch(e=>{console.error(e);process.exitCode=1;});
