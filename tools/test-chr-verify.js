#!/usr/bin/env node
'use strict';
const assert = require('assert');
const E = require('../app/js/lab-sim');
const {state} = require('./chr-ci-fixture');
const {makePlan} = require('../windows/chr/plan');
const {verifyConfiguration,makeReader} = require('../windows/chr/verify');
const e = makePlan(E, state, 'r').expected;
const records = {
  '/rest/system/resource': {version:'7.23.8 (long-term)', 'architecture-name':'x86_64'},
  '/rest/interface/bridge': [{name:'bridge-lan','vlan-filtering':'true'}],
  '/rest/interface/bridge/port': e.lanPorts.map(p=>({bridge:'bridge-lan',interface:p.name,disabled:'false',pvid:p.segment === 'guest' ? e.guestId : '1','frame-types':'admit-only-untagged-and-priority-tagged','ingress-filtering':'true'})),
  '/rest/interface/list': [{name:'LAN'},{name:'WAN'}],
  '/rest/interface/list/member': [{list:'LAN',interface:'bridge-lan'},{list:'WAN',interface:e.wanPort}],
  '/rest/ip/dhcp-client': [{interface:e.wanPort,disabled:'true'}],
  '/rest/ip/address': [{address:e.lanAddress,interface:'bridge-lan'}, {address:e.wanAddress,interface:e.wanPort}, {address:e.guestAddress,interface:'vlan-guest'}],
  '/rest/ip/route': [{'dst-address':'0.0.0.0/0',gateway:e.wanGateway,distance:'1','check-gateway':'ping'}, {'dst-address':e.staticRoute.destination,gateway:e.staticRoute.gateway,distance:e.staticRoute.distance}],
  '/rest/system/identity': {name:e.identity},
  '/rest/ip/dns/static': [{name:e.dnsStatic.name,address:e.dnsStatic.address,type:'A',disabled:'false'}],
  '/rest/ip/dns': {servers:e.dns,'allow-remote-requests':'true'},
  '/rest/ip/dhcp-server': [{name:'dhcp-lan',interface:'bridge-lan','address-pool':'pool-lan',disabled:'false'},{name:'dhcp-guest',interface:'vlan-guest','address-pool':'pool-guest',disabled:'false'}],
  '/rest/ip/pool': [{name:'pool-lan',ranges:e.lanPool},{name:'pool-guest',ranges:e.guestPool}],
  '/rest/ip/dhcp-server/network': [{address:e.lanNetwork,gateway:e.lanGateway,'dns-server':e.lanClientDns},{address:e.guestNetwork,gateway:e.guestGateway,'dns-server':e.guestDns}],
  '/rest/interface/vlan': [{name:'vlan-guest',interface:'bridge-lan','vlan-id':e.guestId}],
  '/rest/interface/bridge/vlan': [{bridge:'bridge-lan','vlan-ids':e.guestId,tagged:'bridge-lan',untagged:e.lanPorts.filter(p=>p.segment==='guest').map(p=>p.name).join(',')}],
  '/rest/ip/firewall/filter': [{chain:'input',action:'accept','in-interface':'ether6'},...e.filterRules.map(x=>({...x}))],
  '/rest/ip/firewall/nat': e.natRules.map(x=>({...x}))
};
const get = async key => { assert(key in records, key); return records[key]; };
(async () => {
  await verifyConfiguration(e,get);
  records['/rest/ip/dhcp-client'][0].disabled = 'false'; await assert.rejects(verifyConfiguration(e,get),/DHCP-клиент WAN/); records['/rest/ip/dhcp-client'][0].disabled = 'true';
  records['/rest/ip/address'][0].address = '192.0.2.1/24';
  await assert.rejects(verifyConfiguration(e,get),/адреса/);
  records['/rest/ip/address'][0].address = e.lanAddress;
  records['/rest/ip/firewall/filter'][1].action = 'drop';
  await assert.rejects(verifyConfiguration(e,get),/firewall/);
  records['/rest/ip/route'][1].disabled = 'true'; await assert.rejects(verifyConfiguration(e,get),/статический маршрут/); delete records['/rest/ip/route'][1].disabled;
  records['/rest/system/identity'].name = 'wrong'; await assert.rejects(verifyConfiguration(e,get),/имя/); records['/rest/system/identity'].name = e.identity;
  records['/rest/ip/dns/static'][0].address = '192.0.2.8'; await assert.rejects(verifyConfiguration(e,get),/DNS-запись/);
  records['/rest/ip/dns/static'][0].address = e.dnsStatic.address; records['/rest/ip/firewall/filter'][1].action = e.filterRules[0].action;
  const dstnat = records['/rest/ip/firewall/nat'].find(x => x.chain === 'dstnat'); dstnat['to-ports'] = '444'; await assert.rejects(verifyConfiguration(e,get),/правила NAT/);
  // Both WAN entries must be checked, including duplicate/incorrect settings.
  const dual = makePlan(E,require('./chr-ci-dual-wan-fixture').state,'r',{allowDualStaticWan:true}).expected;
  const second = dual.wans[1];
  const oldNat=records['/rest/ip/firewall/nat'].find(x=>x.chain==='dstnat'); oldNat['to-ports']='443';
  records['/rest/interface/list/member'].push({list:'WAN',interface:second.port});
  records['/rest/ip/address'].push({address:second.address,interface:second.port});
  records['/rest/ip/route'].push({'dst-address':'0.0.0.0/0',gateway:second.gateway,distance:'2','check-gateway':'ping'});
  await verifyConfiguration(dual,get);
  records['/rest/ip/route'].at(-1).distance='1'; await assert.rejects(verifyConfiguration(dual,get),/маршруты WAN/); records['/rest/ip/route'].at(-1).distance='2';
  records['/rest/ip/address'].at(-1).address='198.51.101.3/30'; await assert.rejects(verifyConfiguration(dual,get),/адреса LAN и WAN/);
  assert.throws(()=>makeReader(0,'admin','secret'), /параметры/);
  console.log('CHR сверка: неправильные адреса и правила не выдаются за успех.');
})().catch(err => {console.error(err);process.exitCode = 1;});
