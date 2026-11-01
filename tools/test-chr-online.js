'use strict';
const assert = require('assert');
const {makePlan} = require('../windows/chr/plan');
const {validateDualInternet} = require('../windows/chr/online');
const E = require('../app/js/lab-sim');
const state = JSON.parse(JSON.stringify(require('./chr-ci-dual-wan-fixture').state));
Object.assign(state.devices.find(d=>d.id==='isp').cfg,{ip:'10.0.2.20/24',gw:'10.0.2.2',dns:'10.0.2.3'});
Object.assign(state.devices.find(d=>d.id==='isp2').cfg,{ip:'10.0.3.20/24',gw:'10.0.3.2',dns:'10.0.3.3'});
Object.assign(state.devices.find(d=>d.id==='r').cfg,{customDns:true,dnsPrimary:'10.0.2.3',dnsSecondary:'10.0.3.3'});
assert(makePlan(E,state,'r').blockers.length);
const expected = makePlan(E,state,'r',{allowDualStaticWan:true}).expected;
assert(validateDualInternet(expected));
for (const change of [
  e=>e.wans[0].port='ether4', e=>e.wans[1].gateway='10.0.3.4', e=>e.wans[1].address='10.0.3.21/24',
  e=>e.wans[0].distance='2', e=>e.wans.pop(), e=>e.dns='8.8.8.8', e=>e.lanPorts.push({name:'ether4'}),
  e=>e.ipv6Lab={address:'fd42:7469:6b::1/64',interface:'bridge-lan'},
  e=>e.wanPort='ether2', e=>e.wanAddress='10.0.2.21/24'
]) {
  const copy = JSON.parse(JSON.stringify(expected)); change(copy);
  assert(!validateDualInternet(copy));
}
assert(!validateDualInternet(null));
console.log('CHR интернет: разрешены только два проверяемых виртуальных WAN с заданными адресами и DNS.');
