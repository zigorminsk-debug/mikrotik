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
  const withNtp={...e,ntp:{server:'192.0.2.123',zone:'Europe/Minsk'}};
  records['/rest/system/clock']={'time-zone-name':'Europe/Minsk','time-zone-autodetect':'false'};
  records['/rest/system/ntp/client']={enabled:'true'};
  records['/rest/system/ntp/client/servers']=[{address:'192.0.2.123',disabled:'false'}];
  await verifyConfiguration(withNtp,get);
  records['/rest/system/ntp/client'].enabled='false';await assert.rejects(verifyConfiguration(withNtp,get),/клиент NTP/);records['/rest/system/ntp/client'].enabled='true';
  records['/rest/system/clock']['time-zone-name']='Etc/UTC';await assert.rejects(verifyConfiguration(withNtp,get),/часовой пояс/);records['/rest/system/clock']['time-zone-name']='Europe/Minsk';
  records['/rest/system/ntp/client/servers'][0].address='192.0.2.124';await assert.rejects(verifyConfiguration(withNtp,get),/NTP-сервер/);records['/rest/system/ntp/client/servers'][0].address='192.0.2.123';
  records['/rest/system/ntp/client/servers'].push({address:'192.0.2.124',disabled:'false'});await assert.rejects(verifyConfiguration(withNtp,get),/NTP-сервер/);records['/rest/system/ntp/client/servers'].pop();
  records['/rest/ip/dhcp-client'][0].disabled = 'false'; await assert.rejects(verifyConfiguration(e,get),/DHCP-клиент WAN/); records['/rest/ip/dhcp-client'][0].disabled = 'true';
  records['/rest/ip/address'][0].address = '192.0.2.1/24';
  await assert.rejects(verifyConfiguration(e,get),/адреса/);
  records['/rest/ip/address'][0].address = e.lanAddress;
  records['/rest/ip/firewall/filter'][1].disabled='true'; await assert.rejects(verifyConfiguration(e,get),/firewall/); delete records['/rest/ip/firewall/filter'][1].disabled;
  records['/rest/ip/firewall/filter'][1].action = 'drop';
  await assert.rejects(verifyConfiguration(e,get),/firewall/);
  records['/rest/ip/route'][1].disabled = 'true'; await assert.rejects(verifyConfiguration(e,get),/статический маршрут/); delete records['/rest/ip/route'][1].disabled;
  records['/rest/system/identity'].name = 'wrong'; await assert.rejects(verifyConfiguration(e,get),/имя/); records['/rest/system/identity'].name = e.identity;
  records['/rest/ip/dns/static'][0].address = '192.0.2.8'; await assert.rejects(verifyConfiguration(e,get),/DNS-запись/);
  records['/rest/ip/dns/static'][0].address = e.dnsStatic.address; records['/rest/ip/firewall/filter'][1].action = e.filterRules[0].action;
  const dstnat = records['/rest/ip/firewall/nat'].find(x => x.chain === 'dstnat'); dstnat['to-ports'] = '444'; await assert.rejects(verifyConfiguration(e,get),/правила NAT/);
  dstnat['to-ports']='443';dstnat.disabled='true';await assert.rejects(verifyConfiguration(e,get),/правила NAT/);delete dstnat.disabled;dstnat['to-ports']='444';
  dstnat['to-ports']='443';
  const dhcpExpected={...e,wans:[{kind:'dhcp',port:e.wanPort,distance:'1'}]};
  const oldClients=records['/rest/ip/dhcp-client'],oldAddr=records['/rest/ip/address'];
  records['/rest/ip/dhcp-client']=[{interface:e.wanPort,disabled:'false','use-peer-dns':'false','add-default-route':'yes','default-route-distance':'1',status:'bound',address:'10.0.2.15/24'}];
  records['/rest/ip/address']=oldAddr.filter(x=>x.interface!==e.wanPort).concat([{interface:e.wanPort,address:'10.0.2.15/24',dynamic:'true'}]);
  await verifyConfiguration(dhcpExpected,get);
  records['/rest/ip/dhcp-client'][0].status='searching';await assert.rejects(verifyConfiguration(dhcpExpected,get),/ожидание DHCP/);records['/rest/ip/dhcp-client'][0].status='bound';
  records['/rest/ip/dhcp-client'][0]['use-peer-dns']='true';await assert.rejects(verifyConfiguration(dhcpExpected,get),/DHCP-клиент WAN/);records['/rest/ip/dhcp-client'][0]['use-peer-dns']='false';
  records['/rest/ip/dhcp-client'].push({...records['/rest/ip/dhcp-client'][0]});await assert.rejects(verifyConfiguration(dhcpExpected,get),/DHCP-клиент WAN/);records['/rest/ip/dhcp-client'].pop();
  records['/rest/ip/address'].at(-1).dynamic='false';await assert.rejects(verifyConfiguration(dhcpExpected,get),/динамический адрес/);
  records['/rest/ip/dhcp-client']=oldClients;records['/rest/ip/address']=oldAddr;
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
