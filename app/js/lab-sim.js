/* Упрощённая модель одной сети: это не эмулятор RouterOS и не проверка сети. */
(function (global) {
'use strict';
function ipToInt(ip) {
  if (typeof ip !== 'string' || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
  var p = ip.split('.').map(Number);
  if (p.some(function (x) { return x > 255; }) || ip.split('.').some(function (x) { return x.length > 1 && x[0] === '0'; })) return null;
  return (((p[0] * 0x1000000) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0);
}
function intToIp(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'); }
function validIp(s) { return ipToInt(s) !== null; }
function parseCidr(s) {
  var m = typeof s === 'string' && /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(s);
  if (!m || ipToInt(m[1]) === null || +m[2] > 32) return null;
  var ip = ipToInt(m[1]), prefix = +m[2], mask = prefix ? (0xffffffff << (32 - prefix)) >>> 0 : 0;
  var first = (ip & mask) >>> 0, last = (first | (~mask >>> 0)) >>> 0;
  return { ip: m[1], ipInt: ip, first: intToIp(first), last: intToIp(last), firstInt: first, lastInt: last, prefix: prefix,
    contains: function (x) { var n = typeof x === 'number' ? x : ipToInt(x); return n !== null && n >= first && n <= last; },
    overlaps: function (o) { return first <= o.lastInt && o.firstInt <= last; } };
}
function poolOf(net) { var start = net.firstInt + 100, end = net.firstInt + 199; return { start: intToIp(start), end: intToIp(end), startInt: start, endInt: end }; }
function q(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$') + '"'; }
function adjacency(state) {
  var adj = Object.create(null);
  (state.devices || []).forEach(function (d) { adj[d.id] = []; });
  (state.links || []).forEach(function (l) { if (adj[l.a] && adj[l.b]) { adj[l.a].push(l.b); adj[l.b].push(l.a); } });
  return adj;
}
function bfsPath(adj, from, to) {
  if (!adj[from] || !adj[to]) return null;
  var prev = Object.create(null), seen = Object.create(null), queue = [from]; seen[from] = true;
  while (queue.length) {
    var x = queue.shift();
    if (x === to) { var path = [x]; while (prev[x] !== undefined) { x = prev[x]; path.unshift(x); } return path; }
    adj[x].forEach(function (n) { if (!seen[n]) { seen[n] = true; prev[n] = x; queue.push(n); } });
  }
  return null;
}
var ENDPOINT = { pc: 1, server: 1, printer: 1 };
function priority(d, index) { return d.cfg && d.cfg.priority ? d.cfg.priority : (index === 0 ? 'primary' : 'backup'); }
function wanFailover(cfg) { return cfg.wanFailover !== false; } // Старые проекты сохраняют прежнее поведение.
function validPort(s) { return /^\d{1,5}$/.test(String(s || '')) && +s >= 1 && +s <= 65535; }
function publications(state) {
  return (state.devices || []).filter(function(d) { return (d.type === 'pc' || d.type === 'server') && d.cfg && d.cfg.external; }).map(function(d) {
    return { id:d.id, name:d.name, ip:(d.cfg.ip || '').split('/')[0], proto:d.cfg.extProto, external:d.cfg.extPort, local:d.cfg.localPort };
  });
}
function analyze(state) {
  var ds = state.devices || [], ls = state.links || [], errors = [], warnings = [], ids = Object.create(null), pairs = Object.create(null);
  var routers = ds.filter(function (d) { return d.type === 'router'; });
  var isps = ds.filter(function (d) { return d.type === 'isp'; });
  var endpoints = ds.filter(function (d) { return ENDPOINT[d.type]; });
  ds.forEach(function (d) { if (ids[d.id]) errors.push('Повторный идентификатор устройства'); ids[d.id] = d; });
  if (routers.length !== 1) errors.push('На схеме нужен ровно один MikroTik.');
  if (isps.length < 1 || isps.length > 2) errors.push('Добавьте одного или двух провайдеров.');
  if (isps.length === 1 && priority(isps[0], 0) !== 'primary') errors.push('Единственный провайдер должен быть основным.');
  if (isps.some(function (d, n) { return ['primary', 'backup'].indexOf(priority(d, n)) < 0; })) errors.push('Некорректная роль провайдера.');
  if (isps.length === 2 && priority(isps[0], 0) === priority(isps[1], 1)) errors.push('Выберите одного основного и одного резервного провайдера.');
  if (isps.filter(function (d) { return d.cfg && d.cfg.kind === 'lte'; }).length > 1) errors.push('Поддерживается только один LTE-модем lte1.');
  if (isps.length === 2 && routers[0] && wanFailover(routers[0].cfg)) warnings.push('Переключение проверяется условно: distance=1/2. PPPoE/DHCP/LTE определяют разрыв сессии или интерфейса, но не обязательно потерю интернета за шлюзом. Реальную доступность и возврат проверьте на роутере; для контроля внешнего узла нужна дополнительная настройка.');
  if (!endpoints.length) errors.push('Добавьте хотя бы один ПК, сервер или принтер для проверки трафика.');
  ls.forEach(function (l) {
    var a = ids[l.a], b = ids[l.b], key = [l.a, l.b].sort().join('|');
    if (!a || !b || a === b || pairs[key]) { errors.push('Некорректная или повторная линия связи.'); return; }
    pairs[key] = true;
    if ((a.type === 'isp' || b.type === 'isp') && !((a.type === 'router' || b.type === 'router') && (a.type === 'isp' || b.type === 'isp')))
      errors.push('Провайдера подключайте непосредственно к MikroTik.');
    if (ENDPOINT[a.type] && ENDPOINT[b.type]) errors.push('Конечные устройства нельзя соединять напрямую: используйте коммутатор.');
  });
  var adj = adjacency(state), rt = routers[0], net, pool, used = Object.create(null);
  if (rt && rt.cfg) {
    net = parseCidr(rt.cfg.lan);
    if (!net || net.prefix !== 24 || net.ipInt !== net.firstInt) { errors.push('LAN: пока поддерживается только адрес сети /24, например 192.168.88.0/24.'); net = null; }
    else {
      pool = poolOf(net);
      var gw = ipToInt(rt.cfg.gw);
      if (gw === null || !net.contains(gw) || gw === net.firstInt || gw === net.lastInt) errors.push('LAN: задайте допустимый IP шлюза в подсети.');
      else if (rt.cfg.dhcp && gw >= pool.startInt && gw <= pool.endInt) errors.push('IP шлюза не должен входить в пул DHCP ' + pool.start + '–' + pool.end + '.');
      else used[rt.cfg.gw] = 'MikroTik';
    }
    if (rt.cfg.vpn) {
      var vc = rt.cfg, vn = parseCidr(vc.vpnPool), vt = vc.vpnType || 'wireguard';
      if (['wireguard','ikev2','l2tp-ipsec'].indexOf(vt) < 0) errors.push('VPN: неизвестный тип.');
      if (!vn || vn.prefix > 28 || vn.prefix < 8 || vn.ipInt !== vn.firstInt) errors.push('VPN: укажите адрес подсети с маской от /8 до /28, например 10.10.10.0/24.');
      else if (net && vn.overlaps(net)) errors.push('VPN: подсети VPN и LAN пересекаются.');
      if (vt === 'wireguard' && !validPort(vc.vpnPort)) errors.push('WireGuard: порт должен быть от 1 до 65535.');
      if (vt === 'wireguard' && vc.vpnPeer && !/^[A-Za-z0-9+/]{43}=$/.test(vc.vpnPeer)) errors.push('WireGuard: неверный публичный ключ клиента.');
      if (vt === 'wireguard' && !vc.vpnPeer) warnings.push('WireGuard: добавьте публичный ключ клиента в настройках или настройте peer вручную. Без него подключение не заработает.');
      if (vt === 'ikev2' && (!vc.vpnServerCert || !vc.vpnClientCert)) errors.push('IKEv2: укажите имена импортированных сертификатов сервера и клиента.');
      if (vt === 'l2tp-ipsec' && (!vc.vpnUser || !vc.vpnPass || vc.vpnPass.length < 8 || !vc.vpnPsk || vc.vpnPsk.length < 8)) errors.push('L2TP/IPsec: укажите пользователя, пароль и общий ключ (каждый секрет не короче 8 символов).');
      if (/[\x00-\x1f\x7f]/.test((vc.vpnUser||'')+(vc.vpnPass||'')+(vc.vpnPsk||'')+(vc.vpnServerCert||'')+(vc.vpnClientCert||''))) errors.push('VPN: управляющие символы в настройках недопустимы.');
      warnings.push('VPN: проект настроек не проверяет установление туннеля. Нужны доступный публичный адрес, настроенный клиент и проверка на реальном оборудовании; при смене провайдера адрес сервера может измениться.');
    }
    if (!rt.cfg.nat) errors.push('Для учебного сценария доступа в интернет включите NAT.');
    if (!rt.cfg.firewall) warnings.push('Firewall выключен: защитные правила не будут созданы.');
  }
  if (rt) {
    ds.forEach(function (d) {
      if (d.id !== rt.id && !bfsPath(adj, rt.id, d.id)) errors.push('«' + d.name + '» не соединён с MikroTik.');
      if (ENDPOINT[d.type] && (adj[d.id] || []).length !== 1) errors.push('«' + d.name + '»: нужна ровно одна линия связи.');
      if (d.type === 'isp' && ((adj[d.id] || []).length !== 1 || (adj[d.id] || [])[0] !== rt.id)) errors.push('«' + d.name + '»: нужна одна прямая линия к MikroTik.');
    });
    if (ls.length !== ds.length - 1) errors.push('Схема должна быть связным деревом без петель и параллельных путей.');
    if ((adj[rt.id] || []).length > 5) errors.push('Для этой модели доступны порты ether1–ether5; добавьте коммутатор.');
  }
  endpoints.forEach(function (d) {
    var c = d.cfg || {};
    if (c.mode === 'dhcp') { if (rt && !rt.cfg.dhcp) errors.push('«' + d.name + '»: включите DHCP-сервер MikroTik.'); return; }
    if (c.mode !== 'static') { errors.push('«' + d.name + '»: выберите DHCP или статический адрес.'); return; }
    var address = parseCidr(c.ip);
    if (!address || !net || address.prefix !== net.prefix || !net.contains(address.ipInt) || address.ipInt === net.firstInt || address.ipInt === net.lastInt)
      errors.push('«' + d.name + '»: нужен допустимый адрес LAN с маской /24.');
    else {
      if (used[address.ip]) errors.push('«' + d.name + '»: адрес ' + address.ip + ' уже занят (' + used[address.ip] + ').');
      used[address.ip] = d.name;
      if (rt.cfg.dhcp && pool && address.ipInt >= pool.startInt && address.ipInt <= pool.endInt) errors.push('«' + d.name + '»: статический адрес находится в пуле DHCP ' + pool.start + '–' + pool.end + '.');
    }
    if (!rt || c.gw !== rt.cfg.gw) errors.push('«' + d.name + '»: укажите IP MikroTik как шлюз.');
    if (c.dns && !validIp(c.dns)) errors.push('«' + d.name + '»: неверный DNS.');
  });
  var extPorts = Object.create(null);
  publications(state).forEach(function(p) {
    var dev = ids[p.id], key = p.proto + '/' + String(+p.external);
    if (dev.cfg.mode !== 'static') errors.push('«' + dev.name + '»: для доступа извне задайте статический LAN-адрес вне DHCP-пула.');
    if (['tcp','udp'].indexOf(p.proto) < 0 || !validPort(p.external) || !validPort(p.local)) errors.push('«' + dev.name + '»: укажите TCP/UDP и порты от 1 до 65535.');
    if (extPorts[key]) errors.push('Внешний порт ' + key + ' уже используется устройством «' + extPorts[key] + '».');
    extPorts[key] = dev.name;
    if (rt && rt.cfg.vpn && p.proto === 'udp' && (((rt.cfg.vpnType || 'wireguard') === 'wireguard' && +p.external === +rt.cfg.vpnPort) || ((rt.cfg.vpnType || 'wireguard') !== 'wireguard' && [500,4500,1701].indexOf(+p.external) >= 0))) errors.push('Внешний порт ' + key + ' занят VPN.');
  });
  if (publications(state).length && isps.length === 2) warnings.push('Доступ извне на втором WAN может потребовать отдельной маршрутизации ответов; смена публичного IP при отказе не проверяется моделью.');
  if (publications(state).length) warnings.push('Публикация открывает выбранные сервисы в интернет. Защитите их, ограничьте доступ и проверьте внешний белый IP, CGNAT и правила вышестоящего роутера.');
  if (pool && endpoints.filter(function (d) { return d.cfg && d.cfg.mode === 'dhcp'; }).length > 100) errors.push('Недостаточно адресов DHCP-пула.');
  isps.forEach(function (d) {
    var c = d.cfg || {};
    if (['pppoe', 'dhcp', 'static', 'lte'].indexOf(c.kind) < 0) errors.push('Выберите тип провайдера.');
    if (c.kind === 'pppoe' && (!c.user || !c.pass || /[\x00-\x1f\x7f]/.test(c.user + c.pass))) errors.push('PPPoE: нужны логин и пароль без управляющих символов.');
    if (c.kind === 'lte' && (!c.apn || !/^[a-zA-Z0-9._-]+$/.test(c.apn))) errors.push('LTE: укажите корректный APN.');
    if (c.kind === 'static' && isps.length === 2) warnings.push('Проверка статического WAN использует ping шлюза; если провайдер не отвечает на ping, маршрут может ошибочно считаться недоступным.');
    if (c.kind === 'static') {
      var w = parseCidr(c.ip), g = ipToInt(c.gw);
      if (!w || w.prefix > 30 || g === null || !w.contains(g) || g === w.ipInt || g === w.firstInt || g === w.lastInt || w.ipInt === w.firstInt || w.ipInt === w.lastInt)
        errors.push('WAN: укажите адрес и отличный от него шлюз в одной подсети (до /30).');
      else if (net && net.overlaps(w)) errors.push('Подсети LAN и WAN пересекаются.');
      if (w && rt && rt.cfg.vpn && parseCidr(rt.cfg.vpnPool) && w.overlaps(parseCidr(rt.cfg.vpnPool))) errors.push('Подсети VPN и WAN пересекаются.');
      if (c.dns && !validIp(c.dns)) errors.push('WAN: неверный DNS.');
    }
    if (c.kind === 'lte') warnings.push('LTE зависит от модели модема, версии RouterOS и имени lte1; проверьте его на устройстве.');
  });
  if (isps.length === 2 && isps[0].cfg.kind === 'static' && isps[1].cfg.kind === 'static') {
    var w0 = parseCidr(isps[0].cfg.ip), w1 = parseCidr(isps[1].cfg.ip);
    if (w0 && w1 && w0.overlaps(w1)) errors.push('Подсети двух WAN не должны пересекаться.');
  }
  return { errors: errors, warnings: warnings };
}
function buildModel(state) {
  var ds = state.devices, rt = ds.filter(function (d) { return d.type === 'router'; })[0];
  var providerDevices = ds.filter(function (d) { return d.type === 'isp'; });
  var net = parseCidr(rt.cfg.lan), pool = poolOf(net), adj = adjacency(state), ports = [];
  state.links.forEach(function (l) {
    if (l.a !== rt.id && l.b !== rt.id) return;
    var id = l.a === rt.id ? l.b : l.a, dev = ds.filter(function (d) { return d.id === id; })[0];
    if (dev.type !== 'isp' || dev.cfg.kind !== 'lte') ports.push({ phys: 'ether' + (ports.length + 1), dev: dev });
  });
  var isps = providerDevices.map(function (isp, index) {
    var wan = ports.filter(function (p) { return p.dev.id === isp.id; })[0];
    var iface = isp.cfg.kind === 'pppoe' ? 'pppoe-out' + (index + 1) : isp.cfg.kind === 'lte' ? 'lte1' : wan.phys;
    return { id: isp.id, name: isp.name, kind: isp.cfg.kind, cfg: isp.cfg, iface: iface,
      phys: wan ? wan.phys : 'USB', priority: priority(isp, index) };
  }).sort(function (a, b) { return a.priority === b.priority ? 0 : a.priority === 'primary' ? -1 : 1; });
  var dns = isps[0].kind === 'static' && isps[0].cfg.dns ? isps[0].cfg.dns + ',8.8.8.8' : '1.1.1.1,8.8.8.8';
  var assignments = {}; assignments[rt.id] = { ip: rt.cfg.gw + '/24', gw: '—', dns: dns, src: 'статический' };
  var lease = pool.startInt;
  ds.forEach(function (d) {
    if (!ENDPOINT[d.type]) return;
    var c = d.cfg;
    assignments[d.id] = c.mode === 'dhcp' ? { ip: intToIp(lease++) + '/24', gw: rt.cfg.gw, dns: rt.cfg.gw, src: 'пример DHCP-аренды' } : { ip: c.ip, gw: c.gw, dns: c.dns || rt.cfg.gw, src: 'статический' };
  });
  isps.forEach(function (i) { assignments[i.id] = { ip: i.kind === 'static' ? i.cfg.ip : 'динамический', gw: i.kind === 'static' ? i.cfg.gw : 'от провайдера', dns: i.kind === 'static' ? (i.cfg.dns || 'не задан') : 'от провайдера', src: i.kind }; });
  return { router: { id: rt.id, name: rt.name, cfg: rt.cfg, net: net, pool: pool, gw: rt.cfg.gw, dns: dns, lanPorts: ports.filter(function (p) { return p.dev.type !== 'isp'; }) },
    isps: isps, primaryIsp: isps[0], backupIsp: wanFailover(rt.cfg) ? (isps[1] || null) : null, publications: publications(state), assignments: assignments, adj: adj };
}
/* Активный путь — только для визуальной модели, без проверки реальных сетей. */
function activeRoutes(state) {
  var ds = state.devices || [], all = adjacency(state), map = Object.create(null);
  ds.forEach(function(d) { map[d.id] = d; });
  var routers = ds.filter(function(d) { return d.type === 'router'; }).sort(function(a,b) { return (a.cfg.routerRole === 'backup' ? 1 : 0) - (b.cfg.routerRole === 'backup' ? 1 : 0); });
  var main = routers[0], backup = routers[1], possible = [], active = null, isp = null;
  if (!main) return [];
  if (main.on !== false) possible.push(main);
  if (backup && backup.on !== false && main.cfg.routerFailover !== false && (main.on === false || wanFailover(main.cfg))) possible.push(backup);
  possible.some(function(candidate) {
    var providers = (all[candidate.id] || []).map(function(id) { return map[id]; }).filter(function(d) { return d && d.type === 'isp'; }).sort(function(a,b) { return (a.cfg.priority === 'backup' ? 1 : 0) - (b.cfg.priority === 'backup' ? 1 : 0); });
    if (providers.length > 1 && !wanFailover(candidate.cfg)) providers = providers.slice(0,1);
    var found = providers.filter(function(d) { return d.on !== false; })[0];
    if (!found) return false; active = candidate; isp = found; return true;
  });
  if (!active || !isp) return [];
  return ds.filter(function(d) { return ENDPOINT[d.type] && d.on !== false; }).map(function(d) {
    var adj = Object.create(null);
    ds.forEach(function(x) { if (x.on !== false && (x.type === 'switch' || x.id === d.id || x.id === active.id)) adj[x.id] = []; });
    Object.keys(adj).forEach(function(id) { adj[id] = (all[id] || []).filter(function(n) { return !!adj[n]; }); });
    var path = bfsPath(adj, d.id, active.id);
    return path ? { endpoint:d.id, router:active.id, isp:isp.id, path:path.concat([isp.id]) } : null;
  }).filter(Boolean);
}
function buildTimeline(state, model) {
  var steps = [], routes = activeRoutes(state), ds = state.devices;
  function packets(path, proto, kind) { for (var j = 0; j < path.length - 1; j++) steps.push({ t: 'pkt', from: path[j], to: path[j + 1], proto: proto, kind: kind }); }
  if (!routes.length) steps.push({t:'log',level:'warn',text:'Нет активного пути: проверьте питание устройств и настройки резервирования. Это учебная модель.'});
  routes.forEach(function(route) {
    var d = ds.filter(function(x) { return x.id === route.endpoint; })[0];
    var path = route.path.slice(0, -1);
    if (d.cfg.mode === 'dhcp') {
      ['DHCP Discover', 'DHCP Offer', 'DHCP Request', 'DHCP ACK'].forEach(function(text, n) { packets(n % 2 ? path.slice().reverse() : path, text, 'dhcp'); });
      steps.push({ t:'log', level:'info', text:d.name + ': пример DHCP-адреса ' + model.assignments[d.id].ip });
    }
    steps.push({t:'log',level:'info',text:d.name + ': условный путь туда и обратно через ' + route.router + ' и ' + route.isp });
    packets(route.path, 'ICMP запрос', 'nat'); packets(route.path.slice().reverse(), 'ICMP ответ', 'reply');
  });
  if (model.backupIsp) steps.push({t:'log',level:'warn',text:'Резерв включён: выключите основной канал на карте, чтобы условно переключить путь; реальная доступность не проверяется.'});
  steps.push({t:'log',level:'ok',text:'Проверка учебной модели завершена; реальные пакеты не отправлялись.'});
  return steps;
}

function genCommands(state, model) {
  var r = model.router, groups = [];
  function add(id, title, arr) { groups.push({ id: id, title: title, code: arr.join('\n') }); }
  var g = ['# Для RouterOS 7 на чистой конфигурации. Сверьте физические порты.', '/interface bridge add name=bridge-lan', '/interface list add name=LAN', '/interface list add name=WAN', '/interface list member add list=LAN interface=bridge-lan'];
  r.lanPorts.forEach(function (p) { g.push('/interface bridge port add bridge=bridge-lan interface=' + p.phys); });
  add('iface', '1. Мост и порты LAN', g);
  add('addr', '2. Адрес LAN и DNS', ['/ip address add address=' + r.gw + '/24 interface=bridge-lan', '/ip dns set servers=' + r.dns + ' allow-remote-requests=yes']);
  g = [];
  model.isps.forEach(function (i) {
    var c = i.cfg, dist = i.priority === 'primary' ? 1 : 2, routeOn = i.priority === 'primary' || wanFailover(r.cfg);
    g.push('# ' + (dist === 1 ? 'Основной' : 'Резервный') + ' канал: ' + i.phys);
    if (i.kind === 'pppoe') g.push('/interface pppoe-client add name=' + i.iface + ' interface=' + i.phys + ' user=' + q(c.user) + ' password=' + q(c.pass) + ' add-default-route=' + (routeOn ? 'yes' : 'no') + ' default-route-distance=' + dist + ' disabled=no');
    if (i.kind === 'dhcp') g.push('/ip dhcp-client add interface=' + i.phys + ' add-default-route=' + (routeOn ? 'yes' : 'no') + ' default-route-distance=' + dist + ' use-peer-dns=no disabled=no');
    if (i.kind === 'static') g.push('/ip address add address=' + c.ip + ' interface=' + i.phys, '/ip route add dst-address=0.0.0.0/0 gateway=' + c.gw + ' distance=' + dist + ' check-gateway=ping' + (routeOn ? '' : ' disabled=yes'));
    if (i.kind === 'lte') g.push('/interface lte apn add name=lab-apn add-default-route=' + (routeOn ? 'yes' : 'no') + ' default-route-distance=' + dist + ' apn=' + q(c.apn), '/interface lte set [find name="lte1"] apn-profiles=lab-apn', '# Проверьте, что модем создал маршрут по умолчанию.');
    g.push('/interface list member add list=WAN interface=' + i.iface);
  });
  add('wan', '3. Подключение провайдера', g);
  if (r.cfg.dhcp) add('dhcp', '4. DHCP LAN', ['/ip pool add name=pool-lan ranges=' + r.pool.start + '-' + r.pool.end, '/ip dhcp-server add name=dhcp-lan interface=bridge-lan address-pool=pool-lan disabled=no', '/ip dhcp-server network add address=' + r.net.first + '/24 gateway=' + r.gw + ' dns-server=' + r.gw]);
  var vpn = r.cfg.vpn ? vpnConfig(r.cfg, r) : null;
  if (vpn) add('vpn', 'VPN — ' + r.cfg.vpnType, vpn.commands);
  if (r.cfg.firewall) {
    var filter = ['/ip firewall filter add chain=input action=accept connection-state=established,related,untracked', '/ip firewall filter add chain=input action=drop connection-state=invalid', '/ip firewall filter add chain=input action=accept protocol=icmp', '/ip firewall filter add chain=input action=accept in-interface-list=LAN', '/ip firewall filter add chain=input action=accept protocol=udp src-port=67 dst-port=68 in-interface-list=WAN'];
    if (vpn) filter = filter.concat(vpn.input);
    filter.push('/ip firewall filter add chain=input action=drop', '/ip firewall filter add chain=forward action=accept connection-state=established,related,untracked', '/ip firewall filter add chain=forward action=drop connection-state=invalid', '/ip firewall filter add chain=forward action=accept in-interface-list=LAN out-interface-list=WAN');
    if (vpn) filter = filter.concat(vpn.forward);
    model.publications.forEach(function(p) { filter.push('/ip firewall filter add chain=forward in-interface-list=WAN connection-nat-state=dstnat protocol=' + p.proto + ' dst-address=' + p.ip + ' dst-port=' + p.local + ' action=accept'); });
    filter.push('/ip firewall filter add chain=forward action=drop');
    add('filter', '5. Firewall', filter);
  }
  var nat = ['/ip firewall nat add chain=srcnat out-interface-list=WAN action=masquerade'];
  model.publications.forEach(function(p) { nat.push('/ip firewall nat add chain=dstnat in-interface-list=WAN protocol=' + p.proto + ' dst-port=' + p.external + ' action=dst-nat to-addresses=' + p.ip + ' to-ports=' + p.local); });
  add('nat', '6. NAT и доступ извне', nat);
  add('verify', '7. Проверка', ['/interface print', '/ip address print', '/ip route print', '/ip dhcp-server lease print', '/ping 1.1.1.1 count=5', '# Проверить DHCP и доступ с реального ПК.']);
  return groups;
}
/* Пример для одного удалённого клиента. Сертификаты/ключи создаются вне приложения. */
function vpnConfig(c, r) {
  var net = parseCidr(c.vpnPool), first = intToIp(net.firstInt + 1), client = intToIp(net.firstInt + 2), last = intToIp(net.lastInt - 1);
  var cmd = [], input = [], forward = [], match, type = c.vpnType || 'wireguard';
  if (type === 'wireguard') {
    cmd.push('/interface wireguard add name=wg-lab listen-port=' + c.vpnPort, '/ip address add address=' + first + '/' + net.prefix + ' interface=wg-lab');
    if (c.vpnPeer) cmd.push('/interface wireguard peers add interface=wg-lab public-key=' + q(c.vpnPeer) + ' allowed-address=' + client + '/32');
    else cmd.push('# Добавьте peer с публичным ключом клиента и allowed-address=' + client + '/32.');
    cmd.push('# Клиенту: адрес ' + client + '/32; AllowedIPs ' + r.net.first + '/24, ' + c.vpnPool + '; Endpoint — публичный IP:' + c.vpnPort + '.');
    cmd.push('# Узнайте публичный ключ сервера: /interface wireguard print detail. Секретный ключ клиента не передавайте.');
    input.push('/ip firewall filter add chain=input in-interface-list=WAN protocol=udp dst-port=' + c.vpnPort + ' action=accept');
    match = 'in-interface=wg-lab';
  } else if (type === 'l2tp-ipsec') {
    cmd.push('/interface list add name=VPN', '/ip pool add name=pool-vpn ranges=' + client + '-' + last,
      '/ppp profile add name=profile-vpn local-address=' + first + ' remote-address=pool-vpn dns-server=' + r.gw + ' interface-list=VPN',
      '/ppp secret add name=' + q(c.vpnUser) + ' password=' + q(c.vpnPass) + ' service=l2tp profile=profile-vpn',
      '/interface l2tp-server server set enabled=yes use-ipsec=required ipsec-secret=' + q(c.vpnPsk) + ' default-profile=profile-vpn authentication=mschap2');
    input.push('/ip firewall filter add chain=input in-interface-list=WAN protocol=udp dst-port=500,4500 action=accept', '/ip firewall filter add chain=input in-interface-list=WAN protocol=ipsec-esp action=accept', '/ip firewall filter add chain=input protocol=udp dst-port=1701 ipsec-policy=in,ipsec action=accept');
    match = 'in-interface-list=VPN';
  } else {
    cmd.push('# Предварительно импортируйте сертификаты с ключом сервера и доверенным сертификатом клиента. Сверьте имена и цепочку доверия.',
      '/ip pool add name=pool-vpn ranges=' + client + '-' + last,
      '/ip ipsec mode-config add name=ike-lab responder=yes address-pool=pool-vpn address-prefix-length=32 static-dns=' + r.gw + ' split-include=' + r.net.first + '/24',
      '/ip ipsec profile add name=ike-lab',
      '/ip ipsec proposal add name=ike-lab pfs-group=none',
      '/ip ipsec policy group add name=ike-lab',
      '/ip ipsec policy add group=ike-lab proposal=ike-lab src-address=0.0.0.0/0 dst-address=0.0.0.0/0 template=yes',
      '/ip ipsec peer add name=ike-lab profile=ike-lab exchange-mode=ike2 passive=yes',
      '/ip ipsec identity add peer=ike-lab auth-method=digital-signature certificate=' + q(c.vpnServerCert) + ' remote-certificate=' + q(c.vpnClientCert) + ' match-by=certificate generate-policy=port-strict mode-config=ike-lab policy-template-group=ike-lab',
      '# Настройте сертификат клиента и Remote ID, совпадающий с именем сервера. Проверьте политики и алгоритмы на обоих концах.',
      '# Поддержка split-include и DNS зависит от клиента; на некоторых устройствах маршруты и DNS настраиваются вручную.');
    input.push('/ip firewall filter add chain=input in-interface-list=WAN protocol=udp dst-port=500,4500 action=accept', '/ip firewall filter add chain=input in-interface-list=WAN protocol=ipsec-esp action=accept');
    match = 'ipsec-policy=in,ipsec src-address=' + c.vpnPool;
  }
  input.push('/ip firewall filter add chain=input ' + match + ' protocol=udp dst-port=53 action=accept', '/ip firewall filter add chain=input ' + match + ' protocol=tcp dst-port=53 action=accept');
  forward.push('/ip firewall filter add chain=forward ' + match + ' out-interface-list=LAN action=accept');
  return { commands:cmd, input:input, forward:forward };
}
/* Параметры WinBox строятся из той же модели, что и команды RouterOS.
   Снимки из документации MikroTik приведены как примеры, не с устройства пользователя. */
function winboxSteps(state, model) {
  var r = model.router, steps = [];
  function add(title, image, instructions) { steps.push({ title: title, image: image, instructions: instructions }); }
  add('Подготовка и безопасное подключение', 'official/winbox-login.png', [
    'Подключите ПК к локальному порту роутера. В WinBox откройте Neighbors, выберите устройство по MAC-адресу, введите логин и пароль и нажмите Connect.',
    'Сохраните резервную копию в Files → Backup; сохраните также текстовый экспорт через New Terminal: /export file=before-lab. Копии скачайте с роутера.',
    'Эта инструкция рассчитана на RouterOS 7 с чистой конфигурацией: на работающем роутере сначала сопоставьте существующие мосты, DHCP, списки интерфейсов и правила. Не удаляйте и не сбрасывайте настройки вслепую. Держите локальный доступ для восстановления.'
  ]);
  add('Мост и локальные порты', 'official/bridge-lan.png', [
    'Откройте Bridge → вкладка Bridge → +. В поле Name укажите bridge-lan, нажмите OK.',
    'На вкладке Ports через + добавьте в Bridge = bridge-lan каждый из портов LAN: ' + r.lanPorts.map(function (p) { return p.phys + ' → ' + p.dev.name; }).join(', ') + '. Не добавляйте WAN-порты в мост.',
    'В Interfaces → Interface List создайте списки LAN и WAN. В Members добавьте в LAN интерфейс bridge-lan. WAN-интерфейсы добавим после их настройки.'
  ]);
  add('Адрес LAN и DNS', 'official/ip-address.png', [
    'Откройте IP → Addresses → +: Address = ' + r.gw + '/24, Interface = bridge-lan. Нажмите OK.',
    'Откройте IP → DNS: Servers = ' + r.dns + ', включите Allow Remote Requests и нажмите OK. Доступ к DNS с WAN будет закрыт правилами input, если включён Firewall.'
  ]);
  model.isps.forEach(function (i) {
    var c = i.cfg, dist = i.priority === 'primary' ? 1 : 2, routeOn = i.priority === 'primary' || wanFailover(r.cfg), list = [];
    if (i.kind === 'pppoe') {
      list = [
        'Откройте Interfaces → + → PPPoE Client: Name = ' + i.iface + ', Interface = ' + i.phys + '.',
        'В Dial Out введите User = ' + c.user + ' и пароль из настроек провайдера. ' + (routeOn ? 'Включите' : 'Выключите') + ' Add Default Route, задайте Default Route Distance = ' + dist + '; Use Peer DNS оставьте выключенным. Нажмите OK.',
        'Убедитесь, что интерфейс включён и сессия подключилась. Данные в примере изображения могут отличаться от вашей схемы.'
      ];
    } else if (i.kind === 'dhcp') {
      list = [
        'Откройте IP → DHCP Client → +: Interface = ' + i.phys + ', Add Default Route = ' + (routeOn ? 'yes' : 'no') + ', Default Route Distance = ' + dist + ', Use Peer DNS = no. Нажмите OK.',
        'Проверьте Status = bound и полученный адрес. IP и шлюз определяет провайдер; показанный на схеме адрес не является реальной арендой.'
      ];
    } else if (i.kind === 'static') {
      list = [
        'Откройте IP → Addresses → +: Address = ' + c.ip + ', Interface = ' + i.phys + '. Нажмите OK.',
        'Откройте IP → Routes → +: Dst. Address = 0.0.0.0/0, Gateway = ' + c.gw + ', Distance = ' + dist + ', Check Gateway = ping. ' + (routeOn ? '' : 'Отключите маршрут. ') + 'Нажмите OK.',
        'Убедитесь, что шлюз провайдера отвечает на ping: иначе этот маршрут может считаться недоступным.'
      ];
    } else {
      list = [
        'Подключите поддерживаемый LTE-модем и SIM. В Interfaces проверьте имя lte1; настройка зависит от версии RouterOS и модема.',
        'В LTE → APNs создайте профиль lab-apn: APN = ' + c.apn + ', Add Default Route = ' + (routeOn ? 'yes' : 'no') + ', Default Route Distance = ' + dist + '. На интерфейсе lte1 выберите этот профиль.',
        'Проверьте состояние модема, полученный адрес и маршрут; при необходимости настройте PIN SIM и аутентификацию по данным оператора.'
      ];
    }
    if (!routeOn) list.push('Автопереключение выключено: отключите Add Default Route (для статического маршрута выключите маршрут).');
    list.push('Откройте Interfaces → Interface List → Members → +: List = WAN, Interface = ' + i.iface + '. Нажмите OK.');
    add('Провайдер «' + i.name + '» — ' + (i.priority === 'primary' ? 'основной' : 'резервный'),
      { pppoe: 'official/pppoe-general.png', dhcp: null, static: 'official/ip-address.png', lte: null }[i.kind], list);
  });
  if (r.cfg.dhcp) add('DHCP для локальной сети', 'official/dhcp-server.png', [
    'Откройте IP → Pool → +: Name = pool-lan, Addresses = ' + r.pool.start + '-' + r.pool.end + '. Нажмите OK.',
    'Откройте IP → DHCP Server → DHCP → +: Name = dhcp-lan, Interface = bridge-lan, Address Pool = pool-lan; убедитесь, что сервер включён.',
    'На вкладке Networks → + задайте Address = ' + r.net.first + '/24, Gateway = ' + r.gw + ', DNS Servers = ' + r.gw + '. Нажмите OK. Проверьте выдачу в Leases.'
  ]);
  if (r.cfg.firewall) add('Firewall: правила в точном порядке', 'official/firewall-rule.png', [
    'Откройте IP → Firewall → Filter Rules. Каждое правило добавляется кнопкой +; Chain и условия задаются на вкладках General/Advanced, Action — на вкладке Action. На чистом роутере разместите сверху вниз в следующем порядке:',
    '1. Chain = input, Connection State = established, related, untracked; Action = accept.',
    '2. Chain = input, Connection State = invalid; Action = drop.',
    '3. Chain = input, Protocol = icmp; Action = accept.',
    '4. Chain = input, In. Interface List = LAN; Action = accept.',
    '5. Chain = input, Protocol = udp, Src. Port = 67, Dst. Port = 68, In. Interface List = WAN; Action = accept (ответы DHCP-клиенту WAN).',
    '6. До drop добавьте правила input для выбранного VPN из проекта команд ниже, если VPN включён.',
    '7. Chain = input; Action = drop (остальной доступ к роутеру).',
    '7. Chain = forward, Connection State = established, related, untracked; Action = accept.',
    '8. Chain = forward, Connection State = invalid; Action = drop.',
    '9. Chain = forward, In. Interface List = LAN, Out. Interface List = WAN; Action = accept.',
    '10. До завершающего drop добавьте разрешения VPN и опубликованных ресурсов из проекта команд ниже, если они включены.',
    '11. Chain = forward; Action = drop. Сверьте порядок и существующие правила: добавление рядом с заводскими правилами без анализа может заблокировать доступ.'
  ]);
  if (r.cfg.vpn) add('VPN: ' + r.cfg.vpnType, null, [
    'Настройте выбранный VPN по проекту команд ниже. Для IKEv2 заранее импортируйте и проверьте сертификаты; для WireGuard обменяйтесь публичными ключами; для L2TP/IPsec задайте безопасные пароль и общий ключ.',
    'Разрешения VPN в firewall должны стоять до завершающих drop. Требуется доступный внешний IP и проверка с реального клиента.'
  ]);
  if (model.publications.length) add('Доступ извне к ПК и серверам', null, model.publications.map(function(p) { return p.name + ': IP → Firewall → NAT, chain=dstnat, WAN, ' + p.proto + ' внешний порт ' + p.external + ', action=dst-nat на ' + p.ip + ':' + p.local + '. Разрешите это соединение в forward до drop.'; }));
  add('NAT для выхода в интернет', null, [
    'Откройте IP → Firewall → NAT → +. Во вкладке General: Chain = srcnat, Out. Interface List = WAN.',
    'Во вкладке Action выберите masquerade и нажмите OK. Правило применяется к обоим каналам, добавленным в список WAN.'
  ]);
  add('Настройка устройств и проверка', null, [
    'На каждом ПК, сервере и принтере задайте DHCP или статический IP, шлюз и DNS по таблице адресации выше. Адреса DHCP в таблице — только примеры, фактические аренды смотрите в Leases.',
    'В WinBox проверьте IP → Addresses, IP → Routes и IP → DHCP Server → Leases; в New Terminal выполните /ping 1.1.1.1 count=5. Затем проверьте доступ из локальной сети и DNS.',
    model.backupIsp ? 'Проверьте оба канала в реальности: отключите основной, проверьте новые соединения через резерв, затем восстановите основной. Distance сам по себе не обнаруживает все отказы за шлюзом; для контроля внешнего узла нужна дополнительная настройка.' : 'Проверка лаборатории не отправляет реальные пакеты: убедитесь в работоспособности на оборудовании.'
  ]);
  return steps;
}

function addrRows(state, model) {
  return state.devices.map(function (d) {
    var a = model.assignments[d.id];
    return [d.name, { router: 'MikroTik', isp: 'провайдер / WAN', switch: 'коммутатор L2', pc: 'ПК', server: 'сервер', printer: 'принтер' }[d.type], a ? a.ip : '—', a ? a.gw : '—', a ? a.dns : '—', a ? a.src : 'без адреса'];
  });
}
/* Для двух устройств показываем маршрут и план VRRP, но не выдаём один
   роутерный скрипт как готовую отказоустойчивую конфигурацию двух устройств. */
function runDual(state) {
  var devices = state.devices || [], links = state.links || [], routers = devices.filter(function(d){ return d.type === 'router'; });
  routers.sort(function(a,b) { return (a.cfg.routerRole === 'backup' ? 1 : 0) - (b.cfg.routerRole === 'backup' ? 1 : 0); });
  var isps = devices.filter(function(d){ return d.type === 'isp'; }), adj = adjacency(state), errors = [], warnings = [];
  if (routers[0].cfg.routerRole === 'backup' || routers[1].cfg.routerRole !== 'backup') errors.push('Назначьте основной и резервный MikroTik.');
  if (isps.length !== 2) errors.push('Для схемы двух MikroTik добавьте двух провайдеров: по одному на каждый роутер.');
  var common = (adj[routers[0].id] || []).filter(function(id) { return (adj[routers[1].id] || []).indexOf(id) !== -1 && devices.some(function(d){ return d.id === id && d.type === 'switch'; }); });
  if (common.length !== 1) errors.push('Оба MikroTik должны быть подключены к одному общему коммутатору LAN.');
  if (routers[0].cfg.lan !== routers[1].cfg.lan || routers[0].cfg.gw !== routers[1].cfg.gw) errors.push('На двух MikroTik задайте общую LAN-подсеть и виртуальный IP шлюза.');
  if (links.length !== devices.length - 1) errors.push('Схема должна быть связным деревом без петель и параллельных путей.');
  var runs = [];
  routers.forEach(function(router, idx) {
    var owned = isps.filter(function(isp) { return (adj[router.id] || []).indexOf(isp.id) >= 0; });
    if (owned.length !== 1) { errors.push('«' + router.name + '»: подключите одного провайдера напрямую.'); return; }
    var otherRouter = routers[1 - idx], otherIsp = isps.filter(function(i) { return i.id !== owned[0].id; });
    var removed = [otherRouter.id].concat(otherIsp.map(function(i) { return i.id; }));
    var projected = { devices:devices.filter(function(d) { return removed.indexOf(d.id) < 0; }).map(function(d) { if (d.id !== owned[0].id) return d; return Object.assign({}, d, {cfg:Object.assign({}, d.cfg, {priority:'primary'})}); }), links:links.filter(function(l){return removed.indexOf(l.a)<0 && removed.indexOf(l.b)<0;}) };
    var res = runSingle(projected); runs.push(res);
    res.errors.forEach(function(e) { errors.push('«' + router.name + '»: ' + e); });
    res.warnings.forEach(function(w) { if (warnings.indexOf(w) === -1) warnings.push(w); });
  });
  warnings.push('Два MikroTik: переключение показано только условно; при отказе WAN VRRP сам по себе не отслеживает интернет и требует отдельного мониторинга. Настройка VRRP, отдельные адреса обоих роутеров, DHCP, NAT, VPN и сохранение сессий требуют ручного проектирования и проверки; автоматически готовые команды для двух роутеров не создаются.');
  if (errors.length || runs.length !== 2) return {errors:errors,warnings:warnings,model:null,timeline:[],groups:[],winbox:[],addrRows:[]};
  var model = runs[0].model;
  Object.keys(runs[1].model.assignments).forEach(function(id) { if (!model.assignments[id]) model.assignments[id] = runs[1].model.assignments[id]; });
  model.assignments[routers[0].id] = {ip:routers[0].cfg.gw + ' (виртуальный шлюз; нужен отдельный адрес)',gw:'—',dns:'—',src:'план VRRP'};
  model.assignments[routers[1].id] = {ip:routers[0].cfg.gw + ' (виртуальный шлюз; нужен отдельный адрес)',gw:'—',dns:'—',src:'план VRRP'};
  return { errors:[], warnings:warnings, dual:true, model:model, timeline:buildTimeline(state,model),
    groups:[{id:'vrrp-plan',title:'План двух MikroTik (не готовая конфигурация)',code:'# Два MikroTik: настройте VRRP на общем LAN-мосту с виртуальным IP ' + routers[0].cfg.gw + '/32.\n# Каждому роутеру нужен собственный уникальный адрес LAN, отдельный WAN и согласованные DHCP, NAT и firewall.\n# DHCP-аренды и VPN-сессии автоматически не синхронизируются; существующие подключения могут оборваться.\n# Подробности: https://help.mikrotik.com/docs/spaces/ROS/pages/81362945/VRRP\n# Команды намеренно не генерируются: согласуйте схему с оборудованием и проверьте переход вручную.'}],
    winbox:[{title:'Два MikroTik и общий коммутатор',image:null,instructions:['В модели активен основной MikroTik. При выключении, если резервирование включено, условный путь переключается на второй MikroTik.','Для реальной сети настройте виртуальный шлюз VRRP и отдельные адреса на обоих роутерах, согласуйте DHCP, VPN, NAT и firewall. Модель не проверяет VRRP и не заменяет настройку на оборудовании.']}], addrRows:addrRows(state,model) };
}
function runSingle(state) {
  var check = analyze(state), model = null;
  if (!check.errors.length) model = buildModel(state);
  return { errors:check.errors, warnings:check.warnings, model:model, timeline:model ? buildTimeline(state,model) : [], groups:model ? genCommands(state,model) : [], winbox:model ? winboxSteps(state,model) : [], addrRows:model ? addrRows(state,model) : [] };
}
var LabEngine = { ipToInt: ipToInt, intToIp: intToIp, validIp: validIp, parseCidr: parseCidr, poolOf: poolOf, adjacency: adjacency, bfsPath: bfsPath,
  analyze: analyze, buildModel: buildModel, buildTimeline: buildTimeline, activeRoutes: activeRoutes, genCommands: genCommands, addrRows: addrRows, winboxSteps: winboxSteps,
  run: function (state) {
    state = state || {};
    return (state.devices || []).filter(function(d) { return d.type === 'router'; }).length === 2 ? runDual(state) : runSingle(state);
  } };
global.LabEngine = LabEngine;
if (typeof module !== 'undefined' && module.exports) module.exports = LabEngine;
})(typeof window !== 'undefined' ? window : globalThis);
