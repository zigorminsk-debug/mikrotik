#!/usr/bin/env node
'use strict';
const assert = require('assert');
const engine = require('../app/js/lab-sim');
const {makePlan} = require('../windows/chr/plan');
const sample = () => ({devices:[
  {id:'i',type:'isp',name:'ISP',cfg:{kind:'static',ip:'198.51.100.2/30',gw:'198.51.100.1',dns:'1.1.1.1'}},
  {id:'r',type:'router',name:'CHR',cfg:{lan:'192.168.88.0/24',gw:'192.168.88.1',dhcp:true,nat:true,firewall:true,vpn:false}},
  {id:'p',type:'pc',name:'PC',cfg:{mode:'dhcp'}}],links:[{a:'i',b:'r'},{a:'r',b:'p'}]});
let s = sample(), plan = makePlan(engine,s,'r');
assert.deepStrictEqual(plan.blockers, []);
assert(plan.groups.some(g => g.id === 'dhcp' && g.commands.some(x => x.includes('dhcp-lan'))));
assert(!plan.groups.some(g => g.id === 'verify'));
for (const flag of ['vpn','wifiAp','secureManagement','cloudDdns','wanFailover','routerFailover','staticRoute','dnsStatic','identityOn']) {
  s = sample(); s.devices[1].cfg[flag] = true; plan = makePlan(engine,s,'r');
  assert(plan.blockers.length && !plan.groups.length, flag);
}
s = sample(); s.devices[0].cfg.kind = 'dhcp'; assert(makePlan(engine,s,'r').blockers.length);
s = sample(); s.devices[0].cfg.kind = 'lte'; assert(makePlan(engine,s,'r').blockers.some(x => /LTE/.test(x)));
s = sample(); s.devices[2].cfg.external = true; assert(makePlan(engine,s,'r').blockers.length);
s = sample(); s.devices[1].cfg.lan = '172.31.254.0/24'; assert(makePlan(engine,s,'r').blockers.length);
s = sample(); s.devices[0].on = false; assert(makePlan(engine,s,'r').blockers.length);
assert.throws(() => makePlan(engine,{devices:Array(101).fill({}),links:[]},'r'), /формат/);
console.log('CHR план: неподдерживаемые настройки блокируются целиком.');
