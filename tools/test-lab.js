#!/usr/bin/env node
'use strict';
const assert = require('assert');
const E = require('../app/js/lab-sim');
const make = () => ({ devices: [
  {id:'i',type:'isp',name:'Интернет',cfg:{kind:'pppoe',user:'user',pass:'secret',ip:'198.51.100.2/30',gw:'198.51.100.1',dns:'1.1.1.1',apn:'internet'}},
  {id:'r',type:'router',name:'MikroTik',cfg:{lan:'192.168.88.0/24',gw:'192.168.88.1',dhcp:true,nat:true,firewall:true,vpn:false}},
  {id:'s',type:'switch',name:'Свитч',cfg:{}},
  {id:'p',type:'pc',name:'ПК',cfg:{mode:'dhcp'}},
  {id:'a',type:'server',name:'Сервер',cfg:{mode:'static',ip:'192.168.88.20/24',gw:'192.168.88.1'}}
], links: [{a:'i',b:'r'}, {a:'r',b:'s'}, {a:'s',b:'p'}, {a:'s',b:'a'}] });
const code = r => r.groups.map(g=>g.code).join('\n');
function fails(s, re) { const r=E.run(s); assert(r.errors.some(e => re.test(e)), r.errors.join('; ')); assert(!r.model && !r.groups.length && !r.timeline.length); }
let s=make(), r=E.run(s);
assert.deepStrictEqual(r.errors, []);
assert.strictEqual(r.model.assignments.p.ip, '192.168.88.100/24');
assert(r.timeline.some(x=>x.proto==='DHCP Discover'));
assert(code(r).includes('interface=pppoe-out1'));
assert(code(r).indexOf('/interface pppoe-client add') < code(r).indexOf('list=WAN interface=pppoe-out1'));
assert(code(r).includes('interface=ether2'));
assert(code(r).includes('action=masquerade'));
assert(!E.validIp('192.168.088.1'));
s=make(); s.devices[0].cfg.kind='static'; r=E.run(s); assert(code(r).includes('/ip dns set servers=1.1.1.1,8.8.8.8')); assert.deepStrictEqual(r.errors,[]); assert(code(r).includes('gateway=198.51.100.1')); assert(!code(r).includes('gateway=198.51.100.2'));
s=make(); s.devices[0].cfg.kind='dhcp'; r=E.run(s); assert.deepStrictEqual(r.errors,[]); assert(code(r).includes('/ip dhcp-client add interface=ether1 add-default-route=yes'));
s=make(); s.devices[0].cfg.kind='lte'; r=E.run(s); assert.deepStrictEqual(r.errors,[]); assert(code(r).includes('interface=lte1')); assert(code(r).includes('interface=ether1')); assert(r.warnings.length);
s=make(); s.devices[0].cfg.pass='a"$b\\c'; r=E.run(s); assert(code(r).includes('password="a\\"\\$b\\\\c"'));
s=make(); s.devices[1].cfg.vpn=true; fails(s,/VPN/);
s=make(); s.devices[1].cfg.lan='192.168.88.0/23'; fails(s,/\/24/);
s=make(); s.devices[1].cfg.lan='invalid'; fails(s,/LAN/);
s=make(); s.devices[1].cfg.gw='192.168.88.100'; fails(s,/пул/);
s=make(); s.devices[4].cfg.ip='192.168.88.120/24'; fails(s,/пул/);
s=make(); s.devices[4].cfg.ip='192.168.88.255/24'; fails(s,/адрес LAN/);
s=make(); s.devices[4].cfg.ip='192.168.88.20/25'; fails(s,/адрес LAN/);
s=make(); s.devices[4].cfg.gw='192.168.88.2'; fails(s,/шлюз/);
s=make(); s.devices[4].cfg.gw=''; fails(s,/шлюз/);
s=make(); s.devices[1].cfg.dhcp=false; fails(s,/DHCP/);
s=make(); s.devices[1].cfg.nat=false; fails(s,/NAT/);
s=make(); s.links.pop(); fails(s,/соединён/);
s=make(); s.links.push({a:'p',b:'i'}); fails(s,/Провайдера/);
s=make(); s.links.push({a:'a',b:'r'}); fails(s,/деревом/);
s=make(); s.devices.push({id:'i2',type:'isp',name:'Второй',cfg:{kind:'dhcp'}}); s.links.push({a:'i2',b:'r'}); r=E.run(s);
assert.deepStrictEqual(r.errors,[]); assert.strictEqual(r.model.isps.length,2);
assert(code(r).includes('default-route-distance=1')); assert(code(r).includes('default-route-distance=2'));
assert(code(r).includes('list=WAN interface=pppoe-out1')); assert(code(r).includes('list=WAN interface=ether3'));
assert(r.timeline.some(x=>/через резерв/.test(x.proto || ''))); assert(r.warnings.some(x=>/условно/.test(x)));
s.devices[0].cfg.priority='backup'; s.devices[5].cfg.priority='primary'; r=E.run(s); assert.strictEqual(r.model.primaryIsp.id,'i2'); assert(code(r).includes('default-route-distance=2'));
s.devices[0].cfg.priority='primary'; fails(s,/основного и одного резервного/);
s=make(); s.devices.push({id:'i2',type:'isp',name:'PPPoE резерв',cfg:{kind:'pppoe',user:'backup',pass:'pass'}}); s.links.push({a:'i2',b:'r'}); r=E.run(s); assert.deepStrictEqual(r.errors,[]); assert(code(r).includes('name=pppoe-out2 interface=ether3')); assert(code(r).includes('list=WAN interface=pppoe-out2'));
s.devices[0].cfg.priority='backup';s.devices[5].cfg.priority='primary';r=E.run(s);assert.equal(r.model.primaryIsp.iface,'pppoe-out2');assert(code(r).includes('name=pppoe-out2 interface=ether3 user="backup" password="pass" add-default-route=yes default-route-distance=1'));
s=make(); s.devices.push({id:'i2',type:'isp',name:'Резерв',cfg:{kind:'static',ip:'203.0.113.2/30',gw:'203.0.113.1'}}); s.links.push({a:'i2',b:'r'}); r=E.run(s); assert.deepStrictEqual(r.errors,[]); assert(code(r).includes('gateway=203.0.113.1 distance=2 check-gateway=ping'));
s.devices[0].cfg.kind='static'; s.devices[5].cfg.ip='198.51.100.2/30'; s.devices[5].cfg.gw='198.51.100.1'; fails(s,/двух WAN/);
s=make(); s.devices.push({id:'i2',type:'isp',name:'Резерв',cfg:{kind:'lte',apn:'internet'}}); s.links.push({a:'i2',b:'r'}); r=E.run(s); assert.deepStrictEqual(r.errors,[]); assert(code(r).includes('default-route-distance=2 apn=')); assert(code(r).includes('list=WAN interface=lte1')); assert.equal(r.model.isps[1].phys,'USB');
s.devices[0].cfg.kind='lte'; fails(s,/только один LTE/);
s=make(); s.devices[0].cfg.kind='static'; s.devices[0].cfg.gw='198.51.100.10'; fails(s,/WAN/);
console.log('Лаборатория: проверки модели, адресов, топологии и генерации прошли.');
