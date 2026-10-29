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
  if (isps.length === 2) warnings.push('Переключение проверяется условно: distance=1/2. PPPoE/DHCP/LTE определяют разрыв сессии или интерфейса, но не обязательно потерю интернета за шлюзом. Реальную доступность и возврат проверьте на роутере; для контроля внешнего узла нужна дополнительная настройка.');
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
    if (rt.cfg.vpn) errors.push('VPN в графической модели пока не проверяется и не генерируется. Используйте раздел «Интерактивный стенд» и инструкцию VPN.');
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
    isps: isps, primaryIsp: isps[0], backupIsp: isps[1] || null, assignments: assignments, adj: adj };
}
function buildTimeline(state, model) {
  var steps = [], rt = model.router, isp = model.primaryIsp;
  function packets(path, proto, kind) { for (var j = 0; j < path.length - 1; j++) steps.push({ t: 'pkt', from: path[j], to: path[j + 1], proto: proto, kind: kind }); }
  state.devices.filter(function (d) { return ENDPOINT[d.type]; }).forEach(function (d) {
    var path = bfsPath(model.adj, d.id, rt.id), wan = bfsPath(model.adj, rt.id, isp.id), whole = path.concat(wan.slice(1));
    if (d.cfg.mode === 'dhcp') {
      ['DHCP Discover', 'DHCP Offer', 'DHCP Request', 'DHCP ACK'].forEach(function (s, n) { packets(n % 2 ? path.slice().reverse() : path, s, 'dhcp'); });
      steps.push({ t: 'log', level: 'info', text: d.name + ': пример DHCP-адреса ' + model.assignments[d.id].ip });
    }
    steps.push({ t: 'log', level: 'info', text: d.name + ': предполагаемый путь ICMP до провайдера и обратно (NAT)' });
    packets(whole, 'ICMP запрос', 'nat'); packets(whole.slice().reverse(), 'ICMP ответ', 'reply');
  });
  if (model.backupIsp) {
    var testDevice = state.devices.filter(function (d) { return ENDPOINT[d.type]; })[0];
    var alternate = bfsPath(model.adj, testDevice.id, rt.id).concat(bfsPath(model.adj, rt.id, model.backupIsp.id).slice(1));
    steps.push({ t: 'log', level: 'warn', text: 'Условный сценарий: основной маршрут недоступен; показываем путь через резерв. Реальное переключение не проверяется.' });
    packets(alternate, 'ICMP через резерв (условно)', 'nat');
    packets(alternate.slice().reverse(), 'ICMP ответ (условно)', 'reply');
  }
  steps.push({ t: 'log', level: 'ok', text: 'Проверка учебной модели завершена; реальный трафик не отправлялся.' });
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
    var c = i.cfg, dist = i.priority === 'primary' ? 1 : 2;
    g.push('# ' + (dist === 1 ? 'Основной' : 'Резервный') + ' канал: ' + i.phys);
    if (i.kind === 'pppoe') g.push('/interface pppoe-client add name=' + i.iface + ' interface=' + i.phys + ' user=' + q(c.user) + ' password=' + q(c.pass) + ' add-default-route=yes default-route-distance=' + dist + ' disabled=no');
    if (i.kind === 'dhcp') g.push('/ip dhcp-client add interface=' + i.phys + ' add-default-route=yes default-route-distance=' + dist + ' use-peer-dns=no disabled=no');
    if (i.kind === 'static') g.push('/ip address add address=' + c.ip + ' interface=' + i.phys, '/ip route add dst-address=0.0.0.0/0 gateway=' + c.gw + ' distance=' + dist + ' check-gateway=ping');
    if (i.kind === 'lte') g.push('/interface lte apn add name=lab-apn add-default-route=yes default-route-distance=' + dist + ' apn=' + q(c.apn), '/interface lte set [find name="lte1"] apn-profiles=lab-apn', '# Проверьте, что модем создал маршрут по умолчанию.');
    g.push('/interface list member add list=WAN interface=' + i.iface);
  });
  add('wan', '3. Подключение провайдера', g);
  if (r.cfg.dhcp) add('dhcp', '4. DHCP LAN', ['/ip pool add name=pool-lan ranges=' + r.pool.start + '-' + r.pool.end, '/ip dhcp-server add name=dhcp-lan interface=bridge-lan address-pool=pool-lan disabled=no', '/ip dhcp-server network add address=' + r.net.first + '/24 gateway=' + r.gw + ' dns-server=' + r.gw]);
  if (r.cfg.firewall) add('filter', '5. Firewall', ['/ip firewall filter add chain=input action=accept connection-state=established,related,untracked', '/ip firewall filter add chain=input action=drop connection-state=invalid', '/ip firewall filter add chain=input action=accept protocol=icmp', '/ip firewall filter add chain=input action=accept in-interface-list=LAN', '/ip firewall filter add chain=input action=accept protocol=udp src-port=67 dst-port=68 in-interface-list=WAN', '/ip firewall filter add chain=input action=drop', '/ip firewall filter add chain=forward action=accept connection-state=established,related,untracked', '/ip firewall filter add chain=forward action=drop connection-state=invalid', '/ip firewall filter add chain=forward action=accept in-interface-list=LAN out-interface-list=WAN', '/ip firewall filter add chain=forward action=drop']);
  add('nat', '6. NAT', ['/ip firewall nat add chain=srcnat out-interface-list=WAN action=masquerade']);
  add('verify', '7. Проверка', ['/interface print', '/ip address print', '/ip route print', '/ip dhcp-server lease print', '/ping 1.1.1.1 count=5', '# Проверить DHCP и доступ с реального ПК.']);
  return groups;
}
function addrRows(state, model) {
  return state.devices.map(function (d) {
    var a = model.assignments[d.id];
    return [d.name, { router: 'MikroTik', isp: 'провайдер / WAN', switch: 'коммутатор L2', pc: 'ПК', server: 'сервер', printer: 'принтер' }[d.type], a ? a.ip : '—', a ? a.gw : '—', a ? a.dns : '—', a ? a.src : 'без адреса'];
  });
}
var LabEngine = { ipToInt: ipToInt, intToIp: intToIp, validIp: validIp, parseCidr: parseCidr, poolOf: poolOf, adjacency: adjacency, bfsPath: bfsPath,
  analyze: analyze, buildModel: buildModel, buildTimeline: buildTimeline, genCommands: genCommands, addrRows: addrRows,
  run: function (state) {
    state = state || {}; var check = analyze(state), model = null;
    if (!check.errors.length) model = buildModel(state);
    return { errors: check.errors, warnings: check.warnings, model: model, timeline: model ? buildTimeline(state, model) : [], groups: model ? genCommands(state, model) : [], addrRows: model ? addrRows(state, model) : [] };
  } };
global.LabEngine = LabEngine;
if (typeof module !== 'undefined' && module.exports) module.exports = LabEngine;
})(typeof window !== 'undefined' ? window : globalThis);
