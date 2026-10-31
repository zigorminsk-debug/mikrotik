#!/usr/bin/env node
/* Тесты виртуального роутера (app/js/mt-virt.js) через MT CLI -> API слова.
   Запуск: node tools/test-virt.js */
'use strict';
const path = require('path');
const VirtualRouter = require(path.join(__dirname, '..', 'app', 'js', 'mt-virt.js'));
const MtApi = require(path.join(__dirname, '..', 'app', 'js', 'mt-api.js'));

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.log('  ✗ FAIL: ' + msg); }
}

function cli(vr, line) {
  var words = MtApi.cliToWords(line);
  return vr.execute(words);
}

function attr(items, name) {
  for (var i = 0; i < items.length; i++) {
    if (items[i].name === name) return items[i].value;
  }
  return null;
}

console.log('== Система ==');
var vr = new VirtualRouter();
var r = cli(vr, '/system identity print');
ok(r.status === 'done' && r.items.length === 1 && attr(r.items[0].attrs, 'name') === 'MikroTik', 'identity print');
r = cli(vr, '/system identity set name=Office-Router');
ok(r.status === 'done' && attr(r.items[0].attrs, 'name') === 'Office-Router', 'identity set name');
r = cli(vr, '/system identity print');
ok(attr(r.items[0].attrs, 'name') === 'Office-Router', 'имя сохранено');

console.log('== Интерфейсы ==');
vr = new VirtualRouter();
r = cli(vr, '/interface print');
ok(r.status === 'done' && r.items.length === 5, 'пять стартовых интерфейсов');
ok(r.items.some(function (it) { return attr(it.attrs, 'name') === 'ether1'; }), 'ether1 есть');
r = cli(vr, '/interface ethernet set [ find default-name=ether1 ] name=wan1');
ok(r.status === 'done', 'ethernet set name=wan1');
r = cli(vr, '/interface print');
ok(r.items.some(function (it) { return attr(it.attrs, 'name') === 'wan1'; }), 'интерфейс переименован в wan1');
r = cli(vr, '/interface ethernet set [ find name=nonexistent ] name=x');
ok(r.status === 'trap', 'поиск несуществующего интерфейса → ошибка');

console.log('== Мост и списки интерфейсов ==');
vr = new VirtualRouter();
cli(vr, '/interface ethernet set [ find default-name=ether1 ] name=wan1');
r = cli(vr, '/interface bridge add name=bridge-lan');
ok(r.status === 'done', 'создан мост bridge-lan');
r = cli(vr, '/interface bridge port add bridge=bridge-lan interface=ether2');
ok(r.status === 'done', 'порт ether2 добавлен в мост');
r = cli(vr, '/interface list add name=WAN');
ok(r.status === 'done', 'список WAN создан');
r = cli(vr, '/interface list member add list=WAN interface=wan1');
ok(r.status === 'done', 'wan1 добавлен в список WAN');

console.log('== Адреса ==');
vr = new VirtualRouter();
r = cli(vr, '/ip address add address=192.168.88.1/24 interface=bridge-lan');
ok(r.status === 'done', 'адрес добавлен');
r = cli(vr, '/ip address print');
ok(r.items.length === 1, 'адрес в списке');
ok(attr(r.items[0].attrs, 'address') === '192.168.88.1/24', 'значение адреса');
ok(attr(r.items[0].attrs, 'interface') === 'bridge-lan', 'интерфейс адреса');
r = cli(vr, '/ip address add address=badformat');
ok(r.status === 'trap', 'неверный формат адреса → ошибка');
r = cli(vr, '/ip address remove [ find address=192.168.88.1/24 ]');
ok(r.status === 'done', 'адрес удалён');
r = cli(vr, '/ip address print');
ok(r.items.length === 0, 'список адресов пуст');
r = cli(vr, '/ip address remove [ find address=1.2.3.4 ]');
ok(r.status === 'trap', 'удаление несуществующего → ошибка');

console.log('== Маршруты ==');
vr = new VirtualRouter();
r = cli(vr, '/ip route add dst-address=0.0.0.0/0 gateway=ether1 distance=1 check-gateway=ping');
ok(r.status === 'done', 'маршрут по умолчанию добавлен');
ok(attr(r.items[0].attrs, 'active') === 'true', 'маршрут активен (интерфейс running)');
r = cli(vr, '/ip route print');
ok(r.items.length === 1, 'маршрут в списке');
r = cli(vr, '/ip route add dst-address=10.0.0.0/8 gateway=nonexistent distance=2');
ok(r.status === 'done', 'маршрут с внешним шлюзом добавлен');
ok(r.items.some(function (it) { return attr(it.attrs, 'gateway') === 'nonexistent'; }), 'маршрут есть в списке');
r = cli(vr, '/ip route remove [ find gateway=nonexistent ]');
ok(r.status === 'done', 'маршрут удалён');

console.log('== DHCP ==');
vr = new VirtualRouter();
r = cli(vr, '/ip pool add name=pool-lan ranges=192.168.88.10-192.168.88.250');
ok(r.status === 'done', 'пул создан');
r = cli(vr, '/ip dhcp-server add name=dhcp-lan interface=bridge-lan address-pool=pool-lan disabled=no');
ok(r.status === 'done', 'DHCP-сервер создан');
r = cli(vr, '/ip dhcp-server network add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=77.88.8.8');
ok(r.status === 'done', 'сеть DHCP добавлена');

console.log('== Firewall filter ==');
vr = new VirtualRouter();
r = cli(vr, '/ip firewall filter add chain=input in-interface-list=WAN action=drop');
ok(r.status === 'done', 'правило filter добавлено');
r = cli(vr, '/ip firewall filter print');
ok(r.items.length === 1, 'правило в списке');
ok(attr(r.items[0].attrs, 'action') === 'drop', 'действие drop');
r = cli(vr, '/ip firewall filter remove [ find action=drop ]');
ok(r.status === 'done', 'правило удалено');
r = cli(vr, '/ip firewall filter print');
ok(r.items.length === 0, 'список пуст');

console.log('== Firewall NAT ==');
vr = new VirtualRouter();
r = cli(vr, '/ip firewall nat add chain=srcnat out-interface-list=WAN action=masquerade');
ok(r.status === 'done', 'NAT masquerade добавлен');
r = cli(vr, '/ip firewall nat add chain=dstnat protocol=tcp dst-port=443 action=dst-nat to-addresses=192.168.88.10 to-ports=443');
ok(r.status === 'done', 'NAT dstnat добавлен');
r = cli(vr, '/ip firewall nat print');
ok(r.items.length === 2, 'два правила NAT');

console.log('== DNS ==');
vr = new VirtualRouter();
r = cli(vr, '/ip dns set servers=8.8.8.8 allow-remote-requests=yes');
ok(r.status === 'done', 'DNS установлен');
r = cli(vr, '/ip dns print');
ok(attr(r.items[0].attrs, 'servers') === '8.8.8.8', 'серверы DNS');

console.log('== PPPoE / WireGuard / PPP ==');
vr = new VirtualRouter();
r = cli(vr, '/interface pppoe-client add name=pppoe-out1 interface=ether1 user=u password=p add-default-route=no');
ok(r.status === 'done', 'PPPoE-клиент создан');
r = cli(vr, '/interface wireguard add name=wg0 listen-port=13231');
ok(r.status === 'done', 'WireGuard создан');
r = cli(vr, '/ppp secret add name=vpnuser password=VpnP@ss2026 service=l2tp');
ok(r.status === 'done', 'PPP-секрет создан');

console.log('== Адрес-листы ==');
vr = new VirtualRouter();
r = cli(vr, '/ip firewall address-list add list=allowed address=10.0.0.0/8');
ok(r.status === 'done', 'адрес-лист заполнен');
r = cli(vr, '/ip firewall address-list print');
ok(r.items.length === 1, 'адрес в листе');

console.log('== ping ==');
vr = new VirtualRouter();
r = cli(vr, '/ping address=8.8.8.8');
ok(r.status === 'done' && typeof r.text === 'string' && r.text.indexOf('8.8.8.8') >= 0, 'ping возвращает текст');

console.log('== export ==');
vr = new VirtualRouter();
r = cli(vr, '/export');
ok(r.status === 'done' && typeof r.text === 'string' && r.text.indexOf('/system identity') >= 0, 'экспорт конфигурации');

console.log('== сброс ==');
vr = new VirtualRouter();
cli(vr, '/system identity set name=Changed');
cli(vr, '/ip address add address=1.2.3.4/24 interface=ether1');
r = vr.reset();
ok(r.status === 'done' && r.items[0].attrs[0].value.indexOf('сброшен') >= 0, 'сброс выполнен');
r = cli(vr, '/system identity print');
ok(attr(r.items[0].attrs, 'name') === 'MikroTik', 'после сброса имя по умолчанию');
r = cli(vr, '/ip address print');
ok(r.items.length === 0, 'после сброса адресов нет');

console.log('== Система: часы, NTP, облако ==');
vr = new VirtualRouter();
r = cli(vr, '/system clock print');
ok(r.status === 'done' && attr(r.items[0].attrs, 'time-zone-name') === 'Europe/Minsk', 'clock print');
r = cli(vr, '/system clock set time-zone-name=UTC');
ok(r.status === 'done', 'clock set');
r = cli(vr, '/system clock print');
ok(attr(r.items[0].attrs, 'time-zone-name') === 'UTC', 'часовой пояс изменён');

r = cli(vr, '/system ntp/client print');
ok(r.status === 'done' && attr(r.items[0].attrs, 'enabled') === 'no', 'ntp print по умолчанию');
r = cli(vr, '/system ntp/client set enabled=yes primary-ntp=77.88.8.8 secondary-ntp=8.8.4.4');
ok(r.status === 'done', 'ntp set');
r = cli(vr, '/system ntp/client print');
ok(attr(r.items[0].attrs, 'enabled') === 'yes', 'ntp включён');

r = cli(vr, '/ip/cloud print');
ok(r.status === 'done' && attr(r.items[0].attrs, 'ddns-enabled') === 'no', 'cloud print по умолчанию');
r = cli(vr, '/ip/cloud set ddns-enabled=yes');
ok(r.status === 'done', 'cloud set');
r = cli(vr, '/ip/cloud print');
ok(attr(r.items[0].attrs, 'ddns-enabled') === 'yes', 'облачный доступ включён');

console.log('== Система: службы IP Services ==');
vr = new VirtualRouter();
r = cli(vr, '/ip/service print');
ok(r.status === 'done' && r.items.length >= 5, 'service print (' + r.items.length + ' служб)');
r = cli(vr, '/ip/service enable name=api');
ok(r.status === 'done', 'service enable api');
r = cli(vr, '/ip/service disable name=telnet');
ok(r.status === 'done', 'service disable telnet');
r = cli(vr, '/ip/service print');
var api = r.items.find(function (it) { return attr(it.attrs, 'name') === 'api'; });
var telnet = r.items.find(function (it) { return attr(it.attrs, 'name') === 'telnet'; });
ok(api && attr(api.attrs, 'disabled') === 'no', 'api включён');
ok(telnet && attr(telnet.attrs, 'disabled') === 'yes', 'telnet отключён');

console.log('== Система: пользователи ==');
vr = new VirtualRouter();
r = cli(vr, '/user print');
ok(r.status === 'done' && r.items.length === 0, 'user print пуст по умолчанию');
r = cli(vr, '/user add name=admin2 group=write password=пароль123');
ok(r.status === 'done', 'user add');
r = cli(vr, '/user print');
ok(r.items.length === 1, 'пользователь добавлен');
ok(attr(r.items[0].attrs, 'group') === 'write', 'группа пользователя');
r = cli(vr, '/user set [ find name=admin2 ] password=новыйпароль');
ok(r.status === 'done', 'user set password');
r = cli(vr, '/user remove [ find name=admin2 ]');
ok(r.status === 'done', 'user remove');
r = cli(vr, '/user print');
ok(r.items.length === 0, 'пользователь удалён');

console.log('== Система: бэкап ==');
vr = new VirtualRouter();
r = cli(vr, '/system backup save name=mybackup');
ok(r.status === 'done', 'backup save');
r = cli(vr, '/system backup print');
ok(r.status === 'done' && r.items.length === 1, 'backup print');
ok(attr(r.items[0].attrs, 'name') === 'mybackup.backup', 'имя бэкапа');

console.log('== Система: обновление ==');
vr = new VirtualRouter();
r = cli(vr, '/system package/update print');
ok(r.status === 'done', 'package/update print');
r = cli(vr, '/system package/update check-for-updates');
ok(r.status === 'done', 'check-for-updates');
r = cli(vr, '/system package/update install');
ok(r.status === 'done', 'install');

console.log('== DHCP-клиент ==');
vr = new VirtualRouter();
r = cli(vr, '/ip/dhcp-client print');
ok(r.status === 'done' && r.items.length === 0, 'dhcp-client пуст по умолчанию');
r = cli(vr, '/ip/dhcp-client add interface=ether1 add-default-route=yes');
ok(r.status === 'done', 'dhcp-client add');
r = cli(vr, '/ip/dhcp-client print');
ok(r.items.length === 1, 'dhcp-client в списке');
ok(attr(r.items[0].attrs, 'interface') === 'ether1', 'интерфейс dhcp-client');
r = cli(vr, '/ip/dhcp-client set [ find interface=ether1 ] disabled=yes');
ok(r.status === 'done', 'dhcp-client set disabled');
r = cli(vr, '/ip/dhcp-client print');
ok(attr(r.items[0].attrs, 'disabled') === 'yes', 'dhcp-client отключён');
r = cli(vr, '/ip/dhcp-client remove [ find interface=ether1 ]');
ok(r.status === 'done', 'dhcp-client remove');
r = cli(vr, '/ip/dhcp-client print');
ok(r.items.length === 0, 'dhcp-client удалён');

console.log('== Firewall service-port ==');
vr = new VirtualRouter();
r = cli(vr, '/ip/firewall/service-port print');
ok(r.status === 'done' && r.items.length === 0, 'service-port пуст по умолчанию');
r = cli(vr, '/ip/firewall/service-port add name=ftp port=21 protocol=tcp');
ok(r.status === 'done', 'service-port add');
r = cli(vr, '/ip/firewall/service-port print');
ok(r.items.length === 1, 'service-port в списке');
ok(attr(r.items[0].attrs, 'port') === '21', 'порт service-port');
r = cli(vr, '/ip/firewall/service-port remove [ find name=ftp ]');
ok(r.status === 'done', 'service-port remove');
r = cli(vr, '/ip/firewall/service-port print');
ok(r.items.length === 0, 'service-port удалён');

console.log('== Graphing ==');
vr = new VirtualRouter();
r = cli(vr, '/tool/graphing print');
ok(r.status === 'done' && r.items.length === 0, 'graphing пуст по умолчанию');
r = cli(vr, '/tool/graphing queue add name=wan-graph interface=ether1 store-every=5m');
ok(r.status === 'done', 'graphing queue add');
r = cli(vr, '/tool/graphing print');
ok(r.items.length === 1, 'graphing в списке');
ok(attr(r.items[0].attrs, 'interface') === 'ether1', 'интерфейс graphing');

console.log('== Планировщик (scheduler) ==');
vr = new VirtualRouter();
r = cli(vr, '/system/scheduler print');
ok(r.status === 'done' && r.items.length === 0, 'scheduler пуст по умолчанию');
r = cli(vr, '/system/scheduler add name=backup-task interval=1d disabled=no');
ok(r.status === 'done', 'scheduler add');
r = cli(vr, '/system/scheduler print');
ok(r.items.length === 1, 'scheduler в списке');
ok(attr(r.items[0].attrs, 'interval') === '1d', 'интервал scheduler');
r = cli(vr, '/system/scheduler set [ find name=backup-task ] disabled=yes');
ok(r.status === 'done', 'scheduler set disabled');
r = cli(vr, '/system/scheduler print');
ok(attr(r.items[0].attrs, 'disabled') === 'yes', 'scheduler отключён');
r = cli(vr, '/system/scheduler remove [ find name=backup-task ]');
ok(r.status === 'done', 'scheduler remove');
r = cli(vr, '/system/scheduler print');
ok(r.items.length === 0, 'scheduler удалён');

console.log('== MAC-сервер ==');
vr = new VirtualRouter();
r = cli(vr, '/tool/mac-server print');
ok(r.status === 'done' && attr(r.items[0].attrs, 'enabled') === 'yes', 'mac-server включён по умолчанию');
r = cli(vr, '/tool/mac-server set enabled=no');
ok(r.status === 'done', 'mac-server set');
r = cli(vr, '/tool/mac-server print');
ok(attr(r.items[0].attrs, 'enabled') === 'no', 'mac-server выключен');

console.log('============================');
console.log('Итого: ' + passed + ' ok, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
