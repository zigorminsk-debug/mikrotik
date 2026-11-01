/* Каталог проверяемых учебных сценариев. Никаких команд RouterOS и запуска. */
(function(global) {
'use strict';
var features = {
  'wan-static': {label:'Статический WAN (учебный адрес)', detail:'Изолированный WAN, не физический провайдер.'},
  'wan-dhcp': {label:'DHCP WAN', detail:'Аренда QEMU, не подтверждение интернета.'},
  'dhcp-lan': {label:'DHCP-сервер основной LAN'},
  'firewall': {label:'Firewall для IPv4'},
  'nat': {label:'NAT masquerade для выхода в WAN'},
  'dns-cache': {label:'DNS-кэш роутера'},
  'dns-static': {label:'Локальная DNS-запись A', detail:'Требует DNS-кэш.'},
  'publication': {label:'NAT: доступ извне к учебному серверу', detail:'Пример TCP 8443 → 192.168.88.20:443. Правило открывает сервис; в изолированной CHR порт хоста не пробрасывается, сервер и доступ извне не проверяются.'},
  'bridge': {label:'Мост и Ethernet-порты LAN'},
  'guest-vlan': {label:'Гостевой VLAN с изоляцией', detail:'Для изоляции нужен Firewall.'},
  'guest-dhcp': {label:'DHCP гостевого VLAN', detail:'Требует гостевой VLAN.'},
  'ipv6-lan': {label:'Учебный IPv6-адрес LAN', detail:'fd42:7469:6b::1/64 на bridge-lan, без RA; входящий и транзитный IPv6 заблокированы. Клиенты и связность не проверяются.'},
  'ipv6-dhcp': {label:'DHCPv6 и Prefix Delegation', unavailable:'DHCPv6 и выдача префикса пока не проверены в лаборатории.'},
  'ipv6-route': {label:'Маршрутизация IPv6 и доступ в интернет', unavailable:'IPv6-маршрутизация и связность пока не реализованы в лаборатории.'},
  'log-system': {label:'События system в памяти CHR', detail:'Правило журналирования; события и сохранение после выключения не проверяются.'},
  'log-interface': {label:'События interface в памяти CHR', detail:'Правило журналирования; состояние физического порта не проверяется.'},
  'log-remote': {label:'Удалённый syslog', unavailable:'Внешний syslog в изолированной CHR пока не проверен.'},
  'simple-queue': {label:'Simple Queue для учебного ПК', detail:'Ограничение 10 Мбит/с в каждом направлении для 192.168.88.10; сам ПК и проверка скорости не запускаются.'},
  'queue-tree': {label:'Queue Tree', unavailable:'Queue Tree ещё не реализован в виртуальной лаборатории.'},
  'route': {label:'Статический маршрут к учебной сети', detail:'Следующий роутер и обратный маршрут не эмулируются.'},
  'identity': {label:'Системное имя MikroTik'},
  'ntp': {label:'NTP-клиент и часовой пояс', detail:'Параметры проверяются; синхронизация и доступность сервера не проверяются.'},
  'pppoe': {label:'PPPoE', unavailable:'PPPoE WAN ещё не проверен в пользовательской CHR.'},
  'dynamic-routing': {label:'Динамическая маршрутизация', unavailable:'Протоколы динамической маршрутизации ещё не реализованы в виртуальной лаборатории.'},
  'wifi': {label:'Wi-Fi точка доступа', unavailable:'CHR не эмулирует Wi-Fi-радио.'},
  'vpn': {label:'VPN-сервер', unavailable:'Применение пользовательского VPN в CHR ещё не реализовано.'},
  'cloud': {label:'IP Cloud / DDNS', unavailable:'В изолированной CHR нет доступа к необходимому внешнему сервису.'}
};
var defaults=['wan-static','dhcp-lan','firewall','nat','dns-cache'];
var catalogs = {
  intro: { choices:['wan-static','wan-dhcp','dhcp-lan','firewall','nat','dns-cache','pppoe','wifi'], defaults:defaults },
  'ros-ip': { choices:['wan-static','wan-dhcp','dhcp-lan','firewall','nat','dns-cache','dns-static','publication'], defaults:defaults },
  'ros-ipv6': {choices:['ipv6-lan','ipv6-dhcp','ipv6-route'],defaults:['ipv6-lan'],base:defaults},
  'ros-interfaces': {choices:['bridge','guest-vlan','guest-dhcp'],defaults:['bridge'],base:defaults},
  'ros-bridge': {choices:['bridge','firewall','guest-vlan','guest-dhcp'],defaults:['bridge','firewall'],base:['wan-static','dhcp-lan','nat','dns-cache']},
  'ros-log': {choices:['log-system','log-interface','log-remote'],defaults:['log-system'],base:defaults},
  'ros-queues': {choices:['simple-queue','queue-tree'],defaults:['simple-queue'],base:defaults},
  'ros-routing': {choices:['route','dynamic-routing'],defaults:['route'],base:defaults},
  'ros-system': {choices:['identity','ntp','log-system','log-interface','cloud'],defaults:['identity'],base:defaults},
  'ros-wifi': {choices:['wifi'],defaults:[]},
  'ros-wireguard': {choices:['vpn'],defaults:[]},
  'ros-ppp': {choices:['pppoe','vpn'],defaults:[]}
};
var aliases = {initial:'intro', networks:'ros-bridge', firewall:'ros-ip', routing:'ros-routing', vpn:'ros-wireguard'};
function catalog(section) {
  var item=catalogs[aliases[section] || section];
  if (!item) return {choices:[], defaults:[], reason:'Для этого раздела ещё нет проверенного сценария виртуальной CHR. Функции не будут добавлены в схему или отправлены в RouterOS.'};
  return {choices:item.choices.map(function(id) {var f=features[id];return {id:id,label:f.label,detail:f.detail||'',unavailable:f.unavailable||''};}), defaults:item.defaults.slice(), reason:''};
}
function validate(section, ids) {
  var cat=catalogs[aliases[section] || section], errors=[];
  if (!cat) return {errors:['Для этого раздела сценарий CHR ещё не реализован.']};
  if (!Array.isArray(ids) || ids.length>cat.choices.length || ids.some(function(id){return typeof id!=='string'||cat.choices.indexOf(id)<0;}) || new Set(ids).size!==ids.length) return {errors:['Недопустимый выбор функций.']};
  if (!ids.length) errors.push('Выберите хотя бы одну доступную функцию раздела.');
  ids.forEach(function(id){if(features[id].unavailable)errors.push(features[id].label+': '+features[id].unavailable);});
  var all=(cat.base||[]).concat(ids), has=function(id){return all.indexOf(id)>=0;};
  if (has('wan-static') && has('wan-dhcp')) errors.push('Статический WAN и DHCP WAN нельзя одновременно назначить одному интерфейсу. Выберите один тип.');
  if (!has('wan-static') && !has('wan-dhcp')) errors.push('Выберите один тип подключения WAN: статический или DHCP.');
  if (has('guest-vlan')&&!has('firewall')) errors.push('Гостевой VLAN требует Firewall для изоляции от основной LAN.');
  if (has('guest-dhcp')&&!has('guest-vlan')) errors.push('DHCP гостевой сети требует включённого гостевого VLAN.');
  if (has('dns-static')&&!has('dns-cache')) errors.push('Локальная DNS-запись требует включённого DNS-кэша роутера.');
  if (has('publication')&&!has('firewall')) errors.push('Публикация сервера требует Firewall и отдельной проверки защиты сервиса.');
  if (!has('nat')) errors.push('Текущая учебная модель с WAN требует NAT masquerade. Выключение NAT пока не поддерживается для этого сценария.');
  if (has('nat')&&!has('firewall')) errors.push('В учебном сценарии NAT требует Firewall: без него нельзя считать сеть защищённой.');
  return {errors:errors, selected:all};
}
function build(section,ids,types,engine) {
  var v=validate(section,ids);if(v.errors.length)return {errors:v.errors};
  var has=function(id){return v.selected.indexOf(id)>=0;};
  var isp=types.isp.cfg(), router=types.router.cfg(), client=types.pc.cfg();
  Object.assign(isp,{kind:has('wan-dhcp')?'dhcp':'static',priority:'primary',ip:'198.51.100.2/30',gw:'198.51.100.1',dns:'1.1.1.1'});
  Object.assign(router,{wanFailover:false,routerFailover:false,dhcp:has('dhcp-lan'),firewall:has('firewall'),nat:has('nat'),dnsCache:has('dns-cache'),dnsStatic:has('dns-static'),vlanGuest:has('guest-vlan'),guestDhcp:has('guest-dhcp'),staticRoute:has('route'),identityOn:has('identity'),ntpClient:has('ntp'),ntpServer:'192.0.2.123',timeZone:'Europe/Minsk'});
  router.ipv6Lab=has('ipv6-lan');
  Object.assign(router,{logSystem:has('log-system'),logInterface:has('log-interface')});
  if (has('simple-queue')) Object.assign(router,{simpleQueue:true,queueTarget:'192.168.88.10',queueRate:'10'});
  client.mode=has('simple-queue')?'static':(router.dhcp?'dhcp':'static');
  if (has('simple-queue')) Object.assign(client,{ip:'192.168.88.10/24',gw:'192.168.88.1'});
  var state={seq:5,devices:[{id:'d1',type:'isp',name:'Провайдер (учебный)',x:300,y:10,cfg:isp},{id:'d2',type:'router',name:'MikroTik',x:300,y:150,cfg:router},{id:'d3',type:'pc',name:'ПК основной LAN',x:150,y:330,cfg:client}],links:[{id:'l4',a:'d1',b:'d2'},{id:'l5',a:'d2',b:'d3',nicId:'nic1'}]};
  if(router.vlanGuest){var guest=types.pc.cfg();Object.assign(guest,{segment:'guest',mode:router.guestDhcp?'dhcp':'static',ip:'192.168.99.10/24',gw:'192.168.99.1'});var guestId='d'+(++state.seq);state.devices.push({id:guestId,type:'pc',name:'ПК гостевой VLAN',x:450,y:330,cfg:guest});state.links.push({id:'l'+(++state.seq),a:'d2',b:guestId,nicId:'nic1'});}
  if(has('publication')){var server=types.server.cfg();Object.assign(server,{mode:'static',ip:'192.168.88.20/24',gw:'192.168.88.1',external:true,extProto:'tcp',extPort:'8443',localPort:'443',extraPublications:[]});var serverId='d'+(++state.seq);state.devices.push({id:serverId,type:'server',name:'Учебный сервер',x:450,y:330,cfg:server});state.links.push({id:'l'+(++state.seq),a:'d2',b:serverId,nicId:'nic1'});}
  var check=engine.run(state), preflight=engine.chrPreflight(state,'d2');
  var errors=check.errors.concat(preflight.blockers);
  return errors.length?{errors:errors}:{errors:[],state:state};
}
var api={catalog:catalog,validate:validate,build:build};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.GuideLab=api;
})(typeof window!=='undefined'?window:globalThis);
