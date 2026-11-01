#!/usr/bin/env node
'use strict';
const assert=require('assert'),engine=require('../app/js/lab-sim'),{makePlan}=require('../windows/chr/plan'),{endpointPlan}=require('../windows/chr/endpoint-plan');
const sample=()=>({devices:[
 {id:'i',type:'isp',name:'Провайдер',cfg:{kind:'static',priority:'primary',ip:'198.51.100.2/30',gw:'198.51.100.1',dns:'1.1.1.1'}},
 {id:'r',type:'router',name:'MikroTik',cfg:{lan:'192.168.88.0/24',gw:'192.168.88.1',dhcp:true,nat:true,firewall:true,vpn:false}},
 {id:'s',type:'switch',name:'Коммутатор',cfg:{}},
 {id:'p',type:'pc',name:'ПК',cfg:{mode:'static',ip:'192.168.88.10/24',gw:'192.168.88.1',segment:'main'}},
 {id:'v',type:'server',name:'Сервер',cfg:{mode:'static',ip:'192.168.88.20/24',gw:'192.168.88.1',segment:'main'}}],links:[{a:'i',b:'r'},{a:'r',b:'s'},{a:'s',b:'p'},{a:'s',b:'v'}]});
let s=sample();assert.deepStrictEqual(makePlan(engine,s,'r').blockers,[]);let p=endpointPlan(engine,s,'r');assert.deepStrictEqual(p.blockers,[]);assert.equal(p.segments.length,1);assert.equal(p.segments[0].routerPort,'ether2');assert.deepStrictEqual(p.segments[0].clients.map(x=>x.ip).sort(),['192.168.88.10','192.168.88.20']);
// Direct connections stay attached to the matching router port, not silently replaced.
s.links=[{a:'i',b:'r'},{a:'r',b:'p'},{a:'r',b:'v'}];s.devices=s.devices.filter(x=>x.id!=='s');p=endpointPlan(engine,s,'r');assert.deepStrictEqual(p.blockers,[]);assert.deepStrictEqual(p.segments.map(x=>x.routerPort),['ether2','ether3']);
s=sample();s.devices[3].cfg.mode='dhcp';p=endpointPlan(engine,s,'r');assert.deepStrictEqual(p.blockers,[]);assert.equal(p.segments[0].clients.find(x=>x.id==='p').mode,'dhcp');assert.equal(p.segments[0].clients.find(x=>x.id==='p').ip,null);
for(const change of [s=>s.devices[3].cfg.mode='unsupported',s=>s.devices[1].cfg.dhcp=false,s=>s.devices[3].cfg.segment='guest',s=>s.devices[3].cfg.ip='192.168.88.10;reboot/24',s=>s.devices[3].cfg.nics=[{id:'nic2'}],s=>s.devices[3].on=false,s=>s.devices[1].cfg.vlanGuest=true]){s=sample();change(s);assert(endpointPlan(engine,s,'r').blockers.length);}
s=sample();s.devices.push({id:'r2',type:'router',name:'R2',cfg:{}});assert(endpointPlan(engine,s,'r').blockers.length);assert(endpointPlan(engine,s,'other').blockers.length);
console.log('План виртуальных клиентов: настоящий адрес, порты, коммутатор и отклонение неподдержанных схем проверены.');
