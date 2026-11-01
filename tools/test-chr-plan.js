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
for (const flag of ['vpn','wifiAp','secureManagement','cloudDdns','wanFailover','routerFailover']) {
  s = sample(); s.devices[1].cfg[flag] = true; plan = makePlan(engine,s,'r');
  assert(plan.blockers.length && !plan.groups.length, flag);
}
s = sample(); Object.assign(s.devices[1].cfg, {staticRoute:true, routeDst:'10.20.0.0/24', routeGw:'192.168.88.254', routeDistance:'2', dnsStatic:true, dnsStaticName:'host.lan', dnsStaticIp:'192.168.88.20', identityOn:true, systemIdentity:'Router Lab'});
plan = makePlan(engine,s,'r'); assert.deepStrictEqual(plan.blockers, []); assert(plan.groups.some(g=>g.id==='route')); assert(plan.groups.some(g=>g.id==='services')); assert.strictEqual(plan.expected.identity, 'Router Lab');
// Logging is explicitly selected; defaults in older saved schemes remain off.
s = sample();Object.assign(s.devices[1].cfg,{logSystem:true,logInterface:true});plan=makePlan(engine,s,'r');assert.deepStrictEqual(plan.blockers,[]);assert.deepStrictEqual(plan.expected.logTopics,['system','interface']);assert(plan.groups.find(g=>g.id==='services').commands.includes('/system logging add topics=system action=memory prefix=lab-system'));assert(plan.groups.find(g=>g.id==='services').commands.includes('/system logging add topics=interface action=memory prefix=lab-interface'));
// One Simple Queue only, strictly validated before commands are generated.
s = sample(); Object.assign(s.devices[1].cfg,{simpleQueue:true,queueTarget:'192.168.88.10',queueRate:'10'});
plan=makePlan(engine,s,'r');assert.deepStrictEqual(plan.blockers,[]);assert.deepStrictEqual(plan.expected.simpleQueue,{target:'192.168.88.10/32',rate:'10000000'});assert(plan.groups.find(g=>g.id==='queue').commands.includes('/queue simple add name=queue-lab target=192.168.88.10/32 max-limit=10M/10M'));assert(!plan.expected.filterRules.some(x=>x.action==='fasttrack-connection'));
for(const bad of ['0','1001','-1','1M','10; /system reboot']){s.devices[1].cfg.queueRate=bad;assert(makePlan(engine,s,'r').blockers.length,bad);}s.devices[1].cfg.queueRate='10';for(const bad of ['192.168.88.1','192.168.88.0','192.168.88.255','192.168.88.100','192.0.2.1','192.168.88.10;reboot']){s.devices[1].cfg.queueTarget=bad;assert(makePlan(engine,s,'r').blockers.length,bad);}
// NTP settings may be configured; connectivity/synchronization are not assumed.
s = sample(); Object.assign(s.devices[1].cfg,{ntpClient:true,ntpServer:'192.0.2.123',timeZone:'Europe/Minsk'});
plan=makePlan(engine,s,'r');assert.deepStrictEqual(plan.blockers,[]);assert.deepStrictEqual(plan.expected.ntp,{server:'192.0.2.123',zone:'Europe/Minsk'});assert(plan.groups.some(g=>g.id==='services' && g.commands.some(x=>x.includes('/system ntp client servers add'))));
s.devices[1].cfg.ntpServer='bad; /system reboot';assert(makePlan(engine,s,'r').blockers.length);
s.devices[1].cfg.ntpServer='192.0.2.123';s.devices[1].cfg.timeZone='Bad;reboot';assert(makePlan(engine,s,'r').blockers.length);
s = sample(); s.devices[0].cfg.kind = 'dhcp'; plan=makePlan(engine,s,'r');assert.deepStrictEqual(plan.blockers,[]);assert.equal(plan.expected.wans[0].kind,'dhcp');assert.equal(plan.expected.wanAddress,null);assert.equal(plan.expected.wanGateway,null);assert(plan.groups.find(g=>g.id==='wan').commands.some(c=>c.includes('/ip dhcp-client add interface=ether1')));
s.devices[1].cfg.lan='10.0.2.0/24';s.devices[1].cfg.gw='10.0.2.1';assert(makePlan(engine,s,'r').blockers.some(x=>/пересекается/.test(x)));
s = sample(); s.devices[0].cfg.kind = 'lte'; assert(makePlan(engine,s,'r').blockers.some(x => /LTE/.test(x)));
s = sample(); s.devices[2].cfg.external = true; assert(makePlan(engine,s,'r').blockers.length); // DHCP target rejected
s = sample(); Object.assign(s.devices[2].cfg,{mode:'static',ip:'192.168.88.20/24',gw:'192.168.88.1',external:true,extProto:'tcp',extPort:'8443',localPort:'443'});
plan = makePlan(engine,s,'r'); assert.deepStrictEqual(plan.blockers,[]); assert(plan.expected.natRules.some(x => x.chain === 'dstnat' && x['dst-port'] === '8443' && x['to-addresses'] === '192.168.88.20')); assert(plan.expected.filterRules.some(x => x['connection-nat-state'] === 'dstnat' && x['dst-port'] === '443'));
// Several publications must be verified individually, not just the first rule.
s.devices[2].cfg.extraPublications = [{proto:'udp',external:'5353',local:'53'}];
plan = makePlan(engine,s,'r'); assert.deepStrictEqual(plan.blockers,[]);
assert(plan.expected.natRules.some(x => x.protocol === 'udp' && x['dst-port'] === '5353' && x['to-ports'] === '53'));
assert(plan.expected.filterRules.some(x => x.protocol === 'udp' && x['dst-port'] === '53' && x['connection-nat-state'] === 'dstnat'));
// 3 endpoints * 16 publications would exceed the CHR command limit.
s = sample(); s.devices.pop(); s.links.pop();
for (let i=0; i<3; i++) {
  const id='p'+i, base=10000+i*16;
  s.devices.push({id,type:'pc',name:id,cfg:{mode:'static',ip:'192.168.88.'+(20+i)+'/24',gw:'192.168.88.1',external:true,extProto:'tcp',extPort:String(base),localPort:'80',extraPublications:Array.from({length:15},(_,n)=>({proto:'tcp',external:String(base+n+1),local:'80'}))}});
  s.links.push({a:'r',b:id});
}
plan=makePlan(engine,s,'r'); assert(plan.blockers.some(x=>/максимум 100/.test(x))); assert.deepStrictEqual(plan.groups,[]);
const dualState = require('./chr-ci-dual-wan-fixture').state;
assert(makePlan(engine,dualState,'r').blockers.length, 'Dual WAN must remain blocked by default');
plan = makePlan(engine,dualState,'r',{allowDualStaticWan:true});
assert.deepStrictEqual(plan.blockers,[]); assert.deepStrictEqual(plan.expected.wans.map(w=>w.distance),['1','2']);
assert(plan.expected.wans.some(w=>w.address==='198.51.101.2/30' && w.gateway==='198.51.101.1'));
const notStatic=JSON.parse(JSON.stringify(dualState));notStatic.devices.find(x=>x.id==='isp2').cfg.kind='dhcp';assert(makePlan(engine,notStatic,'r',{allowDualStaticWan:true}).blockers.length);
const routers=JSON.parse(JSON.stringify(dualState));routers.devices.find(x=>x.id==='r').cfg.routerFailover=true;assert(makePlan(engine,routers,'r',{allowDualStaticWan:true}).blockers.length);
s = sample(); s.devices[2].cfg.nics = [{id:'nic2'}]; assert(makePlan(engine,s,'r').blockers.length);
s = sample(); s.devices[1].cfg.lan = '172.31.254.0/24'; assert(makePlan(engine,s,'r').blockers.length);
s = sample(); Object.assign(s.devices[1].cfg,{vpn:true,vpnType:'wireguard',vpnPool:'172.31.254.0/24',vpnPort:'13231'}); assert(engine.chrPreflight(s,'r').blockers.some(x=>/управления CHR подсетью/.test(x))); assert(makePlan(engine,s,'r').blockers.length);
for (const type of ['wireguard','ikev2','l2tp-ipsec']) { s=sample(); Object.assign(s.devices[1].cfg,{vpn:true,vpnType:type,vpnPool:'10.10.10.0/24',vpnPort:'13231',vpnServerCert:'server',vpnClientCert:'client',vpnUser:'test',vpnPass:'test-password',vpnPsk:'test-secret'}); assert(makePlan(engine,s,'r').blockers.length, type); }
s = sample(); s.devices[0].on = false; assert(makePlan(engine,s,'r').blockers.length);
assert.throws(() => makePlan(engine,{devices:Array(101).fill({}),links:[]},'r'), /формат/);
console.log('CHR план: неподдерживаемые настройки блокируются целиком.');
