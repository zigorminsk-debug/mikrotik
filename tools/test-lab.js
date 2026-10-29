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
assert(r.winbox.length >= 7); assert(r.winbox.some(x=>x.image === 'official/pppoe-general.png')); assert(r.winbox.some(x=>x.instructions.join(' ').includes('192.168.88.1/24'))); assert(r.winbox.some(x=>x.instructions.join(' ').includes('pool-lan')));
assert(!E.validIp('192.168.088.1'));
s=make(); s.devices[0].cfg.kind='static'; r=E.run(s); assert(code(r).includes('/ip dns set servers=1.1.1.1,8.8.8.8')); assert.deepStrictEqual(r.errors,[]); assert(code(r).includes('gateway=198.51.100.1')); assert(!code(r).includes('gateway=198.51.100.2'));
s=make(); s.devices[0].cfg.kind='dhcp'; r=E.run(s); assert(r.winbox.some(x=>x.instructions.join(' ').includes('Interface = ether1') && x.illustrations.length === 5 && x.illustrations.some(pic=>pic.image === 'examples/dhcp-client-create-winbox3.png') && x.illustrations.some(pic=>pic.image === 'official/interface-list-member.png'))); assert.deepStrictEqual(r.errors,[]); assert(code(r).includes('/ip dhcp-client add interface=ether1 add-default-route=yes'));
s=make(); s.devices[0].cfg.kind='lte'; r=E.run(s); assert(r.winbox.some(x=>x.image===null && x.instructions.join(' ').includes('APN = internet'))); assert.deepStrictEqual(r.errors,[]); assert(code(r).includes('interface=lte1')); assert(code(r).includes('interface=ether1')); assert(r.warnings.length);
s=make(); s.devices[0].cfg.pass='a"$b\\c'; r=E.run(s); assert(code(r).includes('password="a\\"\\$b\\\\c"'));
s=make(); Object.assign(s.devices[1].cfg,{vpn:true,vpnType:'wireguard',vpnPort:'13231',vpnPool:'10.10.10.0/24'}); r=E.run(s); assert.deepStrictEqual(r.errors,[]); assert(code(r).includes('/interface wireguard add')); assert(r.warnings.some(x=>/ключ клиента/.test(x)));
s=make(); s.devices[1].cfg.lan='192.168.88.0/23'; fails(s,/\/24/);
s=make(); s.devices[1].cfg.lan='invalid'; fails(s,/LAN/);
s=make(); s.devices[1].cfg.gw='192.168.88.100'; fails(s,/пул/);
s=make(); s.devices[4].cfg.ip='192.168.88.120/24'; fails(s,/пул/);
s=make(); s.devices[4].cfg.ip='192.168.88.255/24'; fails(s,/адрес LAN/);
s=make(); s.devices[4].cfg.ip='192.168.88.20/25'; fails(s,/адрес LAN/);
s=make(); s.devices[4].cfg.gw='192.168.88.2'; fails(s,/шлюз/);
s=make(); s.devices[4].cfg.gw=''; fails(s,/шлюз/);
s=make(); s.devices[1].cfg.dhcp=false; fails(s,/DHCP/);
s=make(); s.devices[1].cfg.firewall=false; r=E.run(s); assert(!r.winbox.some(x=>x.image==='official/firewall-rule.png'));
s=make(); s.devices[1].cfg.dhcp=false; s.devices[3].cfg={mode:'static',ip:'192.168.88.10/24',gw:'192.168.88.1'}; r=E.run(s); assert(!r.winbox.some(x=>x.image==='official/dhcp-server.png'));
s=make(); s.devices[1].cfg.nat=false; fails(s,/NAT/);
s=make(); s.links.pop(); fails(s,/соединён/);
s=make(); s.links.push({a:'p',b:'i'}); fails(s,/Провайдера/);
s=make(); s.links.push({a:'a',b:'r'}); fails(s,/деревом/);
s=make(); s.devices.push({id:'i2',type:'isp',name:'Второй',cfg:{kind:'dhcp'}}); s.links.push({a:'i2',b:'r'}); r=E.run(s);
assert.deepStrictEqual(r.errors,[]); assert.strictEqual(r.model.isps.length,2);
assert(code(r).includes('default-route-distance=1')); assert(code(r).includes('default-route-distance=2'));
assert(code(r).includes('list=WAN interface=pppoe-out1')); assert(code(r).includes('list=WAN interface=ether3'));
assert(r.timeline.some(x=>/Резерв включён/.test(x.text || ''))); assert(r.warnings.some(x=>/условно/.test(x)));
s.devices[0].cfg.priority='backup'; s.devices[5].cfg.priority='primary'; r=E.run(s); assert.strictEqual(r.model.primaryIsp.id,'i2'); assert(code(r).includes('default-route-distance=2'));
s.devices[0].cfg.priority='primary'; fails(s,/основного и одного резервного/);
s=make(); s.devices.push({id:'i2',type:'isp',name:'PPPoE резерв',cfg:{kind:'pppoe',user:'backup',pass:'pass'}}); s.links.push({a:'i2',b:'r'}); r=E.run(s); assert.deepStrictEqual(r.errors,[]); assert(code(r).includes('name=pppoe-out2 interface=ether3')); assert(code(r).includes('list=WAN interface=pppoe-out2'));
s.devices[0].cfg.priority='backup';s.devices[5].cfg.priority='primary';r=E.run(s);assert.equal(r.model.primaryIsp.iface,'pppoe-out2');assert(code(r).includes('name=pppoe-out2 interface=ether3 user="backup" password="pass" add-default-route=yes default-route-distance=1'));
s=make(); s.devices.push({id:'i2',type:'isp',name:'Резерв',cfg:{kind:'static',ip:'203.0.113.2/30',gw:'203.0.113.1'}}); s.links.push({a:'i2',b:'r'}); r=E.run(s); assert.deepStrictEqual(r.errors,[]); assert(code(r).includes('gateway=203.0.113.1 distance=2 check-gateway=ping')); assert(r.winbox.some(x=>x.instructions.join(' ').includes('Gateway = 203.0.113.1')));
s.devices[0].cfg.kind='static'; s.devices[5].cfg.ip='198.51.100.2/30'; s.devices[5].cfg.gw='198.51.100.1'; fails(s,/двух WAN/);
s=make(); s.devices.push({id:'i2',type:'isp',name:'Резерв',cfg:{kind:'lte',apn:'internet'}}); s.links.push({a:'i2',b:'r'}); r=E.run(s); assert.deepStrictEqual(r.errors,[]); assert(code(r).includes('default-route-distance=2 apn=')); assert(code(r).includes('list=WAN interface=lte1')); assert.equal(r.model.isps[1].phys,'USB');
s.devices[0].cfg.kind='lte'; fails(s,/только один LTE/);
s=make(); s.devices[0].cfg.kind='static'; s.devices[0].cfg.gw='198.51.100.10'; fails(s,/WAN/);

// Поддержка VPN: проверяем не только поля, но и порядок firewall до drop.
s=make(); Object.assign(s.devices[1].cfg,{vpn:true,vpnType:'wireguard',vpnPort:'13231',vpnPool:'10.10.10.0/24',vpnPeer:'A'.repeat(43)+'='}); r=E.run(s);
assert.deepStrictEqual(r.errors,[]); assert(code(r).includes('allowed-address=10.10.10.2/32')); assert(code(r).includes('in-interface=wg-lab out-interface-list=LAN')); assert(code(r).indexOf('dst-port=13231 action=accept') < code(r).indexOf('chain=input action=drop\n'));
s.devices[1].cfg.vpnPool='192.168.88.0/24'; fails(s,/пересекаются/);
s.devices[1].cfg.vpnPool='10.10.10.0/24';s.devices[1].cfg.vpnPort='65536';fails(s,/порт/);
s=make(); Object.assign(s.devices[1].cfg,{vpn:true,vpnType:'ikev2',vpnPool:'10.10.10.0/24',vpnServerCert:'server1',vpnClientCert:'client1'});r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(code(r).includes('exchange-mode=ike2'));assert(code(r).includes('proposal=ike-lab'));assert(code(r).includes('pfs-group=none'));assert(code(r).includes('remote-certificate="client1"'));assert(code(r).includes('ipsec-policy=in,ipsec src-address=10.10.10.0/24'));
s.devices[1].cfg.vpnClientCert='';fails(s,/сертификат/);
s=make();Object.assign(s.devices[1].cfg,{vpn:true,vpnType:'l2tp-ipsec',vpnPool:'10.10.10.0/24',vpnUser:'vpn-user',vpnPass:'password123',vpnPsk:'longsecret'});r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(code(r).includes('use-ipsec=required ipsec-secret="longsecret"'));assert(code(r).includes('in-interface-list=VPN'));assert(code(r).includes('dst-port=1701 ipsec-policy=in,ipsec'));
s.devices[1].cfg.vpnPsk='short'; fails(s,/общий ключ/);
// Публикация: статический адрес, строго заданный WAN dstnat и разрешение forward до drop.
s=make();Object.assign(s.devices[4].cfg,{external:true,extProto:'tcp',extPort:'8080',localPort:'80'});r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(code(r).includes('chain=dstnat in-interface-list=WAN protocol=tcp dst-port=8080 action=dst-nat to-addresses=192.168.88.20 to-ports=80'));assert(code(r).includes('connection-nat-state=dstnat protocol=tcp dst-address=192.168.88.20 dst-port=80 action=accept'));assert(code(r).indexOf('dst-address=192.168.88.20 dst-port=80 action=accept')<code(r).indexOf('chain=forward action=drop\n'));
s.devices[4].cfg.mode='dhcp';fails(s,/статический LAN/);
s=make();Object.assign(s.devices[3].cfg,{mode:'static',ip:'192.168.88.10/24',gw:'192.168.88.1',external:true,extProto:'tcp',extPort:'08080',localPort:'80'});Object.assign(s.devices[4].cfg,{external:true,extProto:'tcp',extPort:'8080',localPort:'80'});fails(s,/уже используется/);
s=make();Object.assign(s.devices[1].cfg,{vpn:true,vpnType:'wireguard',vpnPort:'13231',vpnPool:'10.10.10.0/24'});Object.assign(s.devices[4].cfg,{external:true,extProto:'udp',extPort:'13231',localPort:'80'});fails(s,/занят VPN/);
// Включение/отключение WAN, переключение по галочке и восстановление основного.
s=make();s.devices.push({id:'i2',type:'isp',name:'Второй',cfg:{kind:'dhcp',priority:'backup'}});s.links.push({a:'i2',b:'r'});s.devices[0].cfg.priority='primary';s.devices[1].cfg.wanFailover=false;r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(code(r).includes('interface=ether3 add-default-route=no'));assert(!r.model.backupIsp);assert.equal(E.activeRoutes(s)[0].isp,'i');s.devices[0].on=false;assert.equal(E.activeRoutes(s).length,0);s.devices[1].cfg.wanFailover=true;assert.equal(E.activeRoutes(s)[0].isp,'i2');s.devices[0].on=true;assert.equal(E.activeRoutes(s)[0].isp,'i');s.devices[2].on=false;assert.equal(E.activeRoutes(s).length,0);
// Два MikroTik, два провайдера и общий коммутатор: только учебный план VRRP.
s=make();s.devices[0].cfg.priority='primary';s.devices[1].cfg.routerRole='primary';s.devices[1].cfg.wanFailover=true;s.devices[1].cfg.routerFailover=true;
s.devices.push({id:'r2',type:'router',name:'Резервный MikroTik',cfg:{lan:'192.168.88.0/24',gw:'192.168.88.1',dhcp:true,nat:true,firewall:true,vpn:false,routerRole:'backup'}});
s.devices.push({id:'i2',type:'isp',name:'Второй провайдер',cfg:{kind:'dhcp',priority:'backup'}});s.links.push({a:'r2',b:'s'},{a:'i2',b:'r2'});
r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(r.dual);assert(r.groups.every(g=>g.code.split('\n').every(line=>!line || line.startsWith('#'))));assert.equal(E.activeRoutes(s)[0].router,'r');
s.devices[1].cfg.secureManagement=true;fails(s,/сервисы в двухроутерной модели/);s.devices[1].cfg.secureManagement=false;
s.devices[1].on=false;assert.equal(E.activeRoutes(s)[0].router,'r2');s.devices[1].on=true;assert.equal(E.activeRoutes(s)[0].router,'r');s.devices[0].on=false;assert.equal(E.activeRoutes(s)[0].router,'r2');s.devices[1].cfg.wanFailover=false;assert.equal(E.activeRoutes(s).length,0);s.devices[1].on=false;s.devices[1].cfg.routerFailover=false;assert.equal(E.activeRoutes(s).length,0);
s.devices[6].cfg.priority='backup'; s.devices[5].cfg.gw='192.168.88.2'; fails(s,/виртуальный IP/);
s.devices[5].cfg.gw='192.168.88.1';s.devices[1].cfg.vlanGuest=true;fails(s,/двухроутерной модели/);


// VLAN: гостевой ПК на отдельном access-порту, отдельный DHCP и изоляция.
function guestState() {
  const z=make(), rt=z.devices[1]; Object.assign(rt.cfg,{vlanGuest:true,guestVlan:'20',guestNet:'192.168.99.0/24',guestGw:'192.168.99.1',guestDhcp:true});
  z.links=z.links.filter(l=>!(l.a==='s'&&l.b==='a'));z.links.push({a:'r',b:'a'});Object.assign(z.devices[4].cfg,{segment:'guest',mode:'dhcp'});return z;
}
s=guestState();r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert.equal(r.model.assignments.a.ip,'192.168.99.100/24');assert.equal(r.model.assignments.a.gw,'192.168.99.1');assert.equal(r.model.router.lanPorts.find(p=>p.dev.id==='a').segment,'guest');assert(code(r).includes('interface=ether3 pvid=20 frame-types=admit-only-untagged-and-priority-tagged ingress-filtering=yes disabled=yes'));assert(code(r).indexOf('vlan-filtering=yes')<code(r).indexOf('interface=ether3] disabled=no'));assert(code(r).includes('tagged=bridge-lan untagged=ether3 vlan-ids=20'));assert(code(r).includes('in-interface=vlan-guest out-interface-list=WAN action=accept'));assert(code(r).includes('in-interface=vlan-guest protocol=udp dst-port=53,67 action=accept'));assert(code(r).indexOf('chain=input action=drop\n')<code(r).indexOf('vlan-filtering=yes'));assert(r.winbox.some(x=>x.title.includes('Гостевой VLAN')));
s.devices[4].cfg.mode='static';s.devices[4].cfg.ip='192.168.99.25/24';s.devices[4].cfg.gw='192.168.99.1';r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert.equal(r.model.assignments.a.ip,'192.168.99.25/24');
s=guestState();s.devices=s.devices.filter(d=>d.id!=='p'&&d.id!=='s');s.links=s.links.filter(l=>l.a!=='s'&&l.b!=='s');r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(r.warnings.some(x=>/порта основной LAN/.test(x)));
s=guestState();s.devices[1].cfg.guestNet='192.168.88.0/24';fails(s,/пересекаются/);
s=guestState();s.devices[1].cfg.guestVlan='1';fails(s,/VLAN ID/);
s=guestState();s.devices[1].cfg.firewall=false;fails(s,/изоляции/);
s=guestState();s.devices[1].cfg.guestDhcp=false;fails(s,/DHCP-сервер нужного сегмента/);
s=guestState();s.links=s.links.filter(l=>l.b!=='a');s.links.push({a:'s',b:'a'});fails(s,/неуправляемый коммутатор/);
s=guestState();s.devices[4].cfg.mode='static';s.devices[4].cfg.gw='192.168.88.1';fails(s,/выбранном сегменте/);
// Wi-Fi настройки, VLAN-гость, порядок безопасной активации и отсутствие секретов в ошибки.
s=guestState();Object.assign(s.devices[1].cfg,{wifiAp:true,wifiIf:'wifi1',wifiCountry:'Belarus',wifiSsid:'Work Net',wifiPass:'StrongPassword',wifiGuest:true,wifiGuestSsid:'Guest Net',wifiGuestPass:'GuestPassword'});r=E.run(s);assert.deepStrictEqual(r.errors,[]);let generated=code(r);
assert(generated.includes('security.authentication-types=wpa2-psk security.passphrase="StrongPassword"'));assert(generated.includes('master-interface="wifi1" disabled=yes'));assert(generated.includes('untagged=ether3,wifi-guest vlan-ids=20'));assert(generated.indexOf('add name=wifi-guest')<generated.indexOf('untagged=ether3,wifi-guest'));assert(generated.indexOf('chain=forward action=drop')<generated.indexOf('vlan-filtering=yes'));assert(generated.indexOf('vlan-filtering=yes')<generated.indexOf('[find name=wifi-guest] disabled=no'));assert(r.winbox.some(x=>x.title.includes('Wi-Fi')));
s=make(); Object.assign(s.devices[1].cfg,{wifiAp:true,wifiIf:'wifi1',wifiCountry:'Belarus',wifiSsid:'Main',wifiPass:'StrongPassword',wifiGuest:false});r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(code(r).includes('/interface wifi set [find name="wifi1"] disabled=yes'));assert(!code(r).includes('name=wifi-guest'));assert(!code(r).includes('vlan-filtering=yes'));assert(code(r).indexOf('chain=forward action=drop')<code(r).indexOf('[find name="wifi1"] disabled=no'));
// Точка доступа может быть создана без нарисованного проводного клиента, но радио не эмулируется.
s=make();Object.assign(s.devices[1].cfg,{wifiAp:true,wifiIf:'wifi1',wifiCountry:'Belarus',wifiSsid:'Main',wifiPass:'StrongPassword'});s.devices=s.devices.filter(x=>x.type==='router'||x.type==='isp');s.links=s.links.filter(x=>x.a==='i'&&x.b==='r');r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(r.warnings.some(x=>/Беспроводные клиенты/.test(x)));assert.equal(r.model.router.lanPorts.length,0);
s=guestState();s.devices[1].cfg.guestDhcp=false;Object.assign(s.devices[4].cfg,{mode:'static',ip:'192.168.99.10/24',gw:'192.168.99.1'});r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(!code(r).includes('name=dhcp-guest'));assert(code(r).includes('name=vlan-guest'));
s=guestState();Object.assign(s.devices[1].cfg,{wifiAp:true,wifiIf:'wifi1',wifiCountry:'Belarus',wifiSsid:'Work',wifiPass:'StrongPassword',wifiGuest:true,wifiGuestSsid:'Guest',wifiGuestPass:'GuestPassword'});r=E.run(s);
s.devices[1].cfg.wifiPass='short';fails(s,/пароль WPA2/);
s=guestState();Object.assign(s.devices[1].cfg,{wifiAp:true,wifiIf:'wifi1',wifiCountry:'Belarus',wifiSsid:'a'.repeat(33),wifiPass:'StrongPassword'});fails(s,/SSID/);
s=guestState();Object.assign(s.devices[1].cfg,{wifiAp:true,wifiIf:'wifi1',wifiCountry:'',wifiSsid:'x',wifiPass:'StrongPassword'});fails(s,/страну/);
s=guestState();Object.assign(s.devices[1].cfg,{wifiAp:false,wifiGuest:true});fails(s,/требует включённой/);
s=guestState();Object.assign(s.devices[1].cfg,{vpn:true,vpnType:'wireguard',vpnPort:'13231',vpnPool:'192.168.99.0/24'});fails(s,/VPN и гостевая/);

console.log('Лаборатория: проверки модели, адресов, топологии и генерации прошли.');

// Новые сервисы: настройки реально влияют на DHCP, DNS, firewall, VPN и команды.
s=make(); Object.assign(s.devices[1].cfg,{customDns:true,dnsPrimary:'9.9.9.9',dnsSecondary:'149.112.112.112',dnsCache:false,ntpClient:true,ntpServer:'pool.ntp.org',timeZone:'Europe/Minsk',cloudDdns:true,identityOn:true,systemIdentity:'Office-Router'});
r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(code(r).includes('servers=9.9.9.9,149.112.112.112 allow-remote-requests=no'));assert(code(r).includes('gateway=192.168.88.1 dns-server=9.9.9.9'));assert.equal(r.model.assignments.p.dns,'9.9.9.9');assert(code(r).includes('/system identity set name="Office-Router"'));assert(code(r).includes('time-zone-name="Europe/Minsk"'));assert(code(r).includes('/system ntp client servers add address="pool.ntp.org"'));assert(code(r).includes('/ip cloud set ddns-enabled=yes'));assert(r.warnings.some(x=>/CGNAT/.test(x)));
s.devices[1].cfg.dnsStatic=true;s.devices[1].cfg.dnsStaticName='host.lan';s.devices[1].cfg.dnsStaticIp='192.168.88.20';fails(s,/DNS-запись требует/);
s.devices[1].cfg.dnsCache=true;r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(code(r).includes('name="host.lan" address=192.168.88.20 type=A'));assert.equal(r.model.assignments.p.dns,'192.168.88.1');
s.devices[1].cfg.dnsStaticName='host";bad';fails(s,/DNS-запись/);
s=guestState();Object.assign(s.devices[1].cfg,{dnsCache:false,customDns:true,dnsPrimary:'9.9.9.9'});r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert.equal(r.model.assignments.a.dns,'9.9.9.9');assert(code(r).includes('in-interface=vlan-guest protocol=udp dst-port=67 action=accept'));assert(!code(r).includes('in-interface=vlan-guest protocol=tcp dst-port=53'));
s=make();Object.assign(s.devices[1].cfg,{dnsCache:false,customDns:true,dnsPrimary:'9.9.9.9',vpn:true,vpnType:'ikev2',vpnPool:'10.10.10.0/24',vpnServerCert:'server1',vpnClientCert:'client1'});r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(code(r).includes('static-dns=9.9.9.9'));assert(!code(r).includes('ipsec-policy=in,ipsec src-address=10.10.10.0/24 protocol=udp dst-port=53'));
s=make();Object.assign(s.devices[1].cfg,{staticRoute:true,routeDst:'10.20.0.0/24',routeGw:'192.168.88.254',routeDistance:'1'});r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(code(r).includes('dst-address=10.20.0.0/24 gateway=192.168.88.254 distance=1'));assert(code(r).includes('in-interface=bridge-lan out-interface=bridge-lan dst-address=10.20.0.0/24 action=accept'));assert(code(r).indexOf('dst-address=10.20.0.0/24 action=accept')<code(r).indexOf('chain=forward action=drop\n'));
s.devices[1].cfg.routeDst='192.168.88.0/24';fails(s,/пересекается/);s.devices[1].cfg.routeDst='0.0.0.0/0';fails(s,/маршрут по умолчанию/);s.devices[1].cfg.routeDst='10.20.0.1/24';fails(s,/адрес сети/);s.devices[1].cfg.routeDst='10.20.0.0/24';s.devices[1].cfg.routeGw='192.168.99.1';fails(s,/шлюз/);
// Отдельный контрольный узел: конфиг и обратимая имитация, без настоящего ping.
s=make();s.devices[0].cfg.kind='static';s.devices[0].cfg.priority='primary';s.devices.push({id:'i2',type:'isp',name:'Резерв',cfg:{kind:'dhcp',priority:'backup'}});s.links.push({a:'i2',b:'r'});Object.assign(s.devices[1].cfg,{wanFailover:true,wanMonitor:true,monitorHost:'1.1.1.1'});r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(code(r).includes('dst-address=1.1.1.1/32 gateway=198.51.100.1 scope=10'));assert(code(r).includes('gateway=1.1.1.1 distance=1 target-scope=11 check-gateway=ping'));assert(!code(r).includes('gateway=198.51.100.1 distance=1 check-gateway'));assert.equal(E.activeRoutes(s)[0].isp,'i');s.devices[1].probeOn=false;assert.equal(E.activeRoutes(s)[0].isp,'i2');s.devices[1].probeOn=true;assert.equal(E.activeRoutes(s)[0].isp,'i');s.devices[1].cfg.dnsCache=false;fails(s,/отличный от DNS/);s.devices[1].cfg.dnsCache=true;s.devices[0].cfg.kind='dhcp';fails(s,/только статический/);s.devices[0].cfg.kind='static';s.devices[1].cfg.monitorHost='192.168.88.3';fails(s,/внешний unicast/);

// Многопортовые ПК и серверы разворачиваются в отдельные конечные узлы, не в мост.
s=make();s.devices[3].cfg.nics=[{id:'nic2',segment:'guest',mode:'dhcp',ip:'',gw:'',dns:''}];
Object.assign(s.devices[1].cfg,{vlanGuest:true,guestVlan:'20',guestNet:'192.168.99.0/24',guestGw:'192.168.99.1',guestDhcp:true});
s.links[2].nicId='nic1';s.links.push({id:'second',a:'r',b:'p',nicId:'nic2'});r=E.run(s);
assert.deepStrictEqual(r.errors,[]);assert.equal(r.model.assignments.p.ip,'192.168.88.100/24');assert.equal(r.model.assignments['p::nic2'].ip,'192.168.99.100/24');assert(r.addrRows.some(row=>row[0].includes('карта 2') && row[2]==='192.168.99.100/24'));assert(r.model.router.lanPorts.some(port=>port.segment==='guest'));assert(code(r).includes('pvid=20'));
let routes=E.activeRoutes(s).filter(x=>x.endpoint==='p');assert.equal(routes.length,2);assert(routes.some(x=>x.linkIds.includes('second')));assert(r.timeline.filter(x=>x.t==='pkt').every(x=>!x.from.includes('::')&&!x.to.includes('::')));assert(r.timeline.some(x=>x.linkId==='second'));
s.links[s.links.length-1].nicId='nic1';fails(s,/один кабель/);s.links[s.links.length-1].nicId='nic9';fails(s,/несуществующей сетевой карте/);
s=make();s.devices[3].cfg.nics=[{id:'nic2',segment:'main',mode:'dhcp'}];s.links[2].id='first';s.links[2].nicId='nic1';s.links.push({id:'second',a:'s',b:'p',nicId:'nic2'});r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert.notEqual(r.model.assignments.p.ip,r.model.assignments['p::nic2'].ip);assert.equal(E.activeRoutes(s).filter(x=>x.endpoint==='p').length,2);
s.links.pop();r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(r.addrRows.some(row=>row[0].includes('карта 2') && row[5]==='не подключена'));
s=make();s.devices[3].cfg.nics=[{id:'nic2',segment:'main',mode:'static',ip:'192.168.88.20/24',gw:'192.168.88.1'}];s.links[2].nicId='nic1';s.links.push({id:'second',a:'s',b:'p',nicId:'nic2'});fails(s,/уже занят/);
s=guestState();s.devices[3].cfg.nics=[{id:'nic2',segment:'guest',mode:'dhcp'}];s.links.push({a:'s',b:'p',nicId:'nic2'});fails(s,/неуправляемый коммутатор/);
s=make();s.devices[4].cfg.nics=[{id:'nic2',mode:'dhcp',segment:'main'}];s.links[3].nicId='nic2';r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(r.addrRows.some(row=>row[0].includes('карта 1') && row[5]==='не подключена'));assert(r.model.assignments['a::nic2']);
// Частичная изоляция клиентов Wi-Fi: opt-in, валидируется и не обещает защиту проводных клиентов.
s=guestState();Object.assign(s.devices[1].cfg,{wifiAp:true,wifiIf:'wifi1',wifiCountry:'Belarus',wifiSsid:'Work',wifiPass:'StrongPassword',wifiGuest:true,wifiGuestSsid:'Guest',wifiGuestPass:'GuestPassword',wifiGuestIsolation:true});r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(code(r).includes('datapath.client-isolation=yes'));assert(r.warnings.some(x=>/проводных гостей/.test(x)));assert(r.winbox.some(x=>x.instructions.join(' ').includes('Client Isolation')));s.devices[1].cfg.wifiGuestIsolation=false;r=E.run(s);assert(!code(r).includes('datapath.client-isolation=yes'));s.devices[1].cfg.wifiGuestIsolation=true;s.devices[1].cfg.wifiGuest=false;fails(s,/требует включённого гостевого Wi-Fi/);
// Ограничение административных служб опционально и применяется после включения VLAN.
s=guestState();s.devices[1].cfg.secureManagement=true;r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(code(r).includes('/ip service set [find name=winbox] address=192.168.88.0/24'));assert(code(r).includes('/tool mac-server mac-winbox set allowed-interface-list=none'));assert(code(r).includes('/ip neighbor discovery-settings set discover-interface-list=LAN'));assert(code(r).indexOf('vlan-filtering=yes')<code(r).indexOf('/tool mac-server mac-winbox set'));assert(r.warnings.some(x=>/MAC WinBox/.test(x)));assert(r.winbox.some(x=>x.title.includes('Ограничение служб управления')));s.devices[1].cfg.secureManagement=false;r=E.run(s);assert(!code(r).includes('/tool mac-server mac-winbox set allowed-interface-list=none'));
// Две физически независимые сети: сервер НЕ соединяет свои карты мостом.
function isolatedNetworks() {
  const z=make(); z.devices[3].cfg.mode='static'; z.devices[3].cfg.ip='192.168.88.11/24'; z.devices[3].cfg.gw='192.168.88.1';
  z.devices[4].cfg.nics=[{id:'nic2',segment:'main',mode:'dhcp'}];
  z.devices.push({id:'r2',type:'router',name:'MikroTik 2',cfg:{lan:'192.168.99.0/24',gw:'192.168.99.1',dhcp:true,nat:true,firewall:true,routerRole:'backup'}});
  z.devices.push({id:'i2',type:'isp',name:'Провайдер 2',cfg:{kind:'dhcp',priority:'backup'}});
  z.links.push({id:'l-card2',a:'r2',b:'a',nicId:'nic2'},{id:'l-wan2',a:'r2',b:'i2'});
  return z;
}
s=isolatedNetworks();r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(r.independent && !r.dual);assert.equal(r.model.assignments['a::nic2'].gw,'192.168.99.1');assert.equal(r.model.assignments.a.gw,'192.168.88.1');assert(r.addrRows.some(row=>row[0].includes('сетевая карта 2') && row[2]==='192.168.99.100/24'));assert(r.groups.some(g=>g.title.includes('MikroTik 2') && g.code.includes('192.168.99.1/24')));assert(r.warnings.some(w=>w.includes('гипервизора')));
routes=E.activeRoutes(s);assert.equal(routes.filter(x=>x.endpoint==='a').length,2);assert(routes.some(x=>x.endpoint==='a' && x.router==='r2' && x.isp==='i2' && x.linkIds.includes('l-card2')));assert(routes.some(x=>x.endpoint==='a' && x.router==='r' && x.isp==='i'));
s.devices.find(x=>x.id==='i2').on=false;routes=E.activeRoutes(s);assert(!routes.some(x=>x.router==='r2'));assert(routes.some(x=>x.router==='r'));s.devices.find(x=>x.id==='i2').on=true;s.devices.find(x=>x.id==='r').on=false;routes=E.activeRoutes(s);assert(!routes.some(x=>x.router==='r'));assert(routes.some(x=>x.router==='r2'));
s=isolatedNetworks();s.devices.find(x=>x.id==='r2').cfg.dhcp=false;fails(s,/«MikroTik 2».+DHCP/);
s=isolatedNetworks();s.devices.find(x=>x.id==='r2').cfg.lan='192.168.88.0/24';s.devices.find(x=>x.id==='r2').cfg.gw='192.168.88.1';r=E.run(s);assert.deepStrictEqual(r.errors,[]);assert(r.warnings.some(w=>/пересекаются/.test(w)));
s=isolatedNetworks();s.links.push({a:'r2',b:'s'});r=E.run(s);assert(!r.independent);assert(r.errors.length);
s=isolatedNetworks();assert.equal(E.routerForCard(s,'a','nic1').id,'r');assert.equal(E.routerForCard(s,'a','nic2').id,'r2');
