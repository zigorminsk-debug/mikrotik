'use strict';
const http = require('http');
// Queries only QEMU's locally forwarded management port. No arbitrary URLs.
function makeReader(port, user, password, diagnostic = () => {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || user !== 'admin' || typeof password !== 'string') throw new Error('Неверные параметры управления CHR');
  const headers = { authorization: 'Basic ' + Buffer.from(user + ':' + password).toString('base64') };
  return endpoint => new Promise((resolve, reject) => {
    if (!/^\/rest\/[a-z\-/]+$/.test(endpoint)) return reject(new Error('Недопустимый запрос CHR'));
    const started = Date.now();
    let timedOut = false;
    const report = detail => { try { diagnostic({endpoint, elapsedMs: Date.now() - started, ...detail}); } catch (_) {} };
    const request = http.get({hostname:'127.0.0.1', port, path:endpoint, headers, timeout:15000}, response => {
      report({status:response.statusCode});
      let body = ''; response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; if (body.length > 1000000) request.destroy(); });
      response.on('error', () => reject(new Error('Ошибка ответа CHR')));
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error('Не удалось получить состояние CHR'));
        try { resolve(JSON.parse(body)); } catch (_) { reject(new Error('Некорректный ответ CHR')); }
      });
    });
    request.on('timeout', () => { timedOut = true; request.destroy(); });
    request.on('error', error => { report({error: timedOut ? 'TIMEOUT' : (typeof error.code === 'string' && /^[A-Z_0-9]+$/.test(error.code) ? error.code : 'NETWORK_ERROR')}); reject(new Error('Не удалось подключиться к виртуальной CHR')); });
  });
}
function check(ok, description) { if (!ok) throw new Error('CHR не подтвердила настройку: ' + description); }
function list(rows) { if (!Array.isArray(rows)) throw new Error('Некорректный ответ CHR'); return rows; }
function one(rows, predicate) { return list(rows).filter(predicate).length === 1; }
function enabled(row) { return row.disabled === 'false' || row.disabled === false; }
async function verifyConfiguration(expected, get, diagnostic = () => {}) {
  if (!expected || typeof get !== 'function') throw new Error('Нет параметров проверки CHR');
  const resource = await get('/rest/system/resource');
  check(resource && /^7\.23\.8(?:\s|$)/.test(resource.version || '') && resource['architecture-name'] === 'x86_64', 'версия и архитектура');
  const bridges = await get('/rest/interface/bridge');
  check(one(bridges, x => x.name === 'bridge-lan' && String(x['vlan-filtering']) === String(expected.vlan)), 'мост и VLAN filtering');
  const ports = await get('/rest/interface/bridge/port');
  for (const port of expected.lanPorts) {
    check(one(ports, x => x.bridge === 'bridge-lan' && x.interface === port.name && enabled(x) && (!expected.vlan || (String(x.pvid) === (port.segment === 'guest' ? expected.guestId : '1') && x['frame-types'] === 'admit-only-untagged-and-priority-tagged' && String(x['ingress-filtering']) === 'true'))), 'порты моста');
  }
  const lists = await get('/rest/interface/list');
  check(one(lists, x => x.name === 'LAN') && one(lists, x => x.name === 'WAN'), 'списки интерфейсов');
  const members = await get('/rest/interface/list/member');
  check(one(members, x => x.list === 'LAN' && x.interface === 'bridge-lan') && one(members, x => x.list === 'WAN' && x.interface === expected.wanPort), 'состав списков интерфейсов');
  const addresses = await get('/rest/ip/address');
  check(one(addresses, x => x.address === expected.lanAddress && x.interface === 'bridge-lan') && one(addresses, x => x.address === expected.wanAddress && x.interface === expected.wanPort), 'адреса LAN и WAN');
  if (expected.vlan) check(one(addresses, x => x.address === expected.guestAddress && x.interface === 'vlan-guest'), 'адрес гостевого VLAN');
  const routes = await get('/rest/ip/route');
  check(list(routes).some(x => x['dst-address'] === '0.0.0.0/0' && x.gateway === expected.wanGateway && String(x.distance) === '1' && x['check-gateway'] === 'ping'), 'маршрут WAN');
  if (expected.staticRoute) {
    const found = list(routes).filter(x => x['dst-address'] === expected.staticRoute.destination);
    if (!one(found, x => x.gateway === expected.staticRoute.gateway && String(x.distance) === expected.staticRoute.distance && x.disabled !== true && x.disabled !== 'true')) {
      try { diagnostic({route: found.map(x => ({gateway:x.gateway, distance:x.distance, disabled:x.disabled, inactive:x.inactive}))}); } catch (_) {}
      check(false, 'статический маршрут LAN');
    }
  }
  if (expected.identity !== null) { const identity = await get('/rest/system/identity'); check(identity && identity.name === expected.identity, 'системное имя'); }
  if (expected.dnsStatic) { const entries = await get('/rest/ip/dns/static'); check(one(entries, x => x.name === expected.dnsStatic.name && x.address === expected.dnsStatic.address && x.type === 'A' && enabled(x)), 'локальная DNS-запись'); }
  const dns = await get('/rest/ip/dns');
  check(dns && dns.servers === expected.dns && String(dns['allow-remote-requests']) === String(expected.dnsCache), 'DNS');
  const dhcp = await get('/rest/ip/dhcp-server');
  check(expected.dhcp ? one(dhcp, x => x.name === 'dhcp-lan' && x.interface === 'bridge-lan' && x['address-pool'] === 'pool-lan' && enabled(x)) : !list(dhcp).some(x => x.name === 'dhcp-lan'), 'DHCP LAN');
  check(expected.guestDhcp ? one(dhcp, x => x.name === 'dhcp-guest' && x.interface === 'vlan-guest' && x['address-pool'] === 'pool-guest' && enabled(x)) : !list(dhcp).some(x => x.name === 'dhcp-guest'), 'DHCP гостей');
  const pools = await get('/rest/ip/pool');
  if (expected.dhcp) check(one(pools, x => x.name === 'pool-lan' && x.ranges === expected.lanPool), 'пул LAN');
  if (expected.guestDhcp) check(one(pools, x => x.name === 'pool-guest' && x.ranges === expected.guestPool), 'пул гостей');
  const networks = await get('/rest/ip/dhcp-server/network');
  if (expected.dhcp) check(one(networks, x => x.address === expected.lanNetwork && x.gateway === expected.lanGateway && x['dns-server'] === expected.lanClientDns), 'сеть DHCP LAN');
  if (expected.guestDhcp) check(one(networks, x => x.address === expected.guestNetwork && x.gateway === expected.guestGateway && x['dns-server'] === expected.guestDns), 'сеть DHCP гостей');
  if (expected.vlan) {
    const vlans = await get('/rest/interface/vlan');
    check(one(vlans, x => x.name === 'vlan-guest' && x.interface === 'bridge-lan' && String(x['vlan-id']) === expected.guestId), 'гостевой VLAN');
    const table = await get('/rest/interface/bridge/vlan');
    check(list(table).some(x => x.bridge === 'bridge-lan' && String(x['vlan-ids']) === expected.guestId && (x.tagged || '').split(',').includes('bridge-lan') && expected.lanPorts.filter(p => p.segment === 'guest').every(p => (x.untagged || '').split(',').includes(p.name))), 'таблица VLAN');
  }
  const filter = list(await get('/rest/ip/firewall/filter'));
  check(filter.length === expected.filterRules.length + 1 && filter[0].chain === 'input' && filter[0].action === 'accept' && filter[0]['in-interface'] === 'ether6', 'правила управления');
  expected.filterRules.forEach((rule, n) => check(Object.keys(rule).every(k => String(filter[n+1][k]) === rule[k]), 'правила firewall'));
  const nat = list(await get('/rest/ip/firewall/nat'));
  check(nat.length === expected.natRules.length && expected.natRules.every((rule, n) => Object.keys(rule).every(k => String(nat[n][k]) === rule[k])), 'правила NAT');
}
module.exports = { makeReader, verifyConfiguration };
