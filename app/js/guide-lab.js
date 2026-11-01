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
  'bridge': {label:'Мост и Ethernet-порты LAN'},
  'guest-vlan': {label:'Гостевой VLAN с изоляцией', detail:'Для изоляции нужен Firewall.'},
  'guest-dhcp': {label:'DHCP гостевого VLAN', detail:'Требует гостевой VLAN.'},
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
  'ros-ip': { choices:['wan-static','wan-dhcp','dhcp-lan','firewall','nat','dns-cache','dns-static'], defaults:defaults },
  'ros-interfaces': {choices:['bridge'],defaults:['bridge'],base:defaults},
  'ros-bridge': {choices:['bridge','firewall','guest-vlan','guest-dhcp'],defaults:['bridge','firewall'],base:['wan-static','dhcp-lan','nat','dns-cache']},
  'ros-routing': {choices:['route','dynamic-routing'],defaults:['route'],base:defaults},
  'ros-system': {choices:['identity','ntp','cloud'],defaults:['identity'],base:defaults},
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
  client.mode=router.dhcp?'dhcp':'static';
  var state={seq:5,devices:[{id:'d1',type:'isp',name:'Провайдер (учебный)',x:300,y:10,cfg:isp},{id:'d2',type:'router',name:'MikroTik',x:300,y:150,cfg:router},{id:'d3',type:'pc',name:'ПК основной LAN',x:150,y:330,cfg:client}],links:[{id:'l4',a:'d1',b:'d2'},{id:'l5',a:'d2',b:'d3',nicId:'nic1'}]};
  if(router.vlanGuest){var guest=types.pc.cfg();Object.assign(guest,{segment:'guest',mode:router.guestDhcp?'dhcp':'static',ip:'192.168.99.10/24',gw:'192.168.99.1'});state.devices.push({id:'d6',type:'pc',name:'ПК гостевой VLAN',x:450,y:330,cfg:guest});state.links.push({id:'l7',a:'d2',b:'d6',nicId:'nic1'});state.seq=7;}
  var check=engine.run(state), preflight=engine.chrPreflight(state,'d2');
  var errors=check.errors.concat(preflight.blockers);
  return errors.length?{errors:errors}:{errors:[],state:state};
}
var api={catalog:catalog,validate:validate,build:build};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.GuideLab=api;
})(typeof window!=='undefined'?window:globalThis);
