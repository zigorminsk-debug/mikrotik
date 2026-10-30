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
  var out = [];
  (state.devices || []).forEach(function(d) {
    if ((d.type !== 'pc' && d.type !== 'server') || !d.cfg || !d.cfg.external) return;
    var c = d.cfg, rows = [{proto:c.extProto, external:c.extPort, local:c.localPort}];
    if (Array.isArray(c.extraPublications)) rows = rows.concat(c.extraPublications);
    rows.forEach(function(row) { row = row || {}; out.push({id:d.id, name:d.name, ip:(c.ip || '').split('/')[0], proto:row.proto, external:row.external, local:row.local}); });
  });
  return out;
}
function guestDevice(d) { return !!(d.cfg && d.cfg.segment === 'guest'); }
function utf8Length(s) { try { return encodeURIComponent(s).replace(/%[0-9A-F]{2}/gi, 'x').length; } catch (_) { return Infinity; } }
function validWifiSsid(s) { return typeof s === 'string' && utf8Length(s) > 0 && utf8Length(s) <= 32 && !/[\x00-\x1f\x7f]/.test(s); }
function validWifiPass(s) { return typeof s === 'string' && /^[\x20-\x7e]{8,63}$/.test(s); }
function branchSegment(state, adj, routerId, neighborId) {
  var found = Object.create(null);
  (state.devices || []).filter(function(d) { return ENDPOINT[d.type]; }).forEach(function(d) {
    var path = bfsPath(adj, routerId, d.id);
    if (path && path[1] === neighborId) found[guestDevice(d) ? 'guest' : 'main'] = true;
  });
  return found.guest && found.main ? 'mixed' : found.guest ? 'guest' : 'main';
}
function validHostname(s) {
  if (typeof s !== 'string' || s.length < 1 || s.length > 253 || /^\d+(?:\.\d+){3}$/.test(s)) return false;
  return s.split('.').every(function(part) { return part.length > 0 && part.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(part); });
}
function usableProbe(s) {
  var n = ipToInt(s); if (n === null) return false;
  var a = n >>> 24, b = (n >>> 16) & 255;
  return a !== 0 && a !== 10 && a !== 127 && a < 224 && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168);
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
  if (isps.length === 2 && routers[0] && wanFailover(routers[0].cfg) && !routers[0].cfg.wanMonitor) warnings.push('Переключение проверяется условно: distance=1/2. PPPoE/DHCP/LTE определяют разрыв сессии или интерфейса, но не обязательно потерю интернета за шлюзом. Реальную доступность и возврат проверьте на роутере; для контроля внешнего узла нужна дополнительная настройка.');
  if (!endpoints.length && !routers.some(function(d) { return d.cfg && d.cfg.wifiAp; })) errors.push('Добавьте хотя бы один ПК, сервер или принтер для проверки трафика либо включите точку Wi-Fi.');
  if (!endpoints.length && routers.some(function(d) { return d.cfg && d.cfg.wifiAp; })) warnings.push('Беспроводные клиенты на карте не моделируются: для анимации добавьте проводной ПК, сервер или принтер.');
  ls.forEach(function (l) {
    var a = ids[l.a], b = ids[l.b], key = [l.a, l.b].sort().join('|');
    if (!a || !b || a === b || pairs[key]) { errors.push('Некорректная или повторная линия связи.'); return; }
    pairs[key] = true;
    if ((a.type === 'isp' || b.type === 'isp') && !((a.type === 'router' || b.type === 'router') && (a.type === 'isp' || b.type === 'isp')))
      errors.push('Провайдера подключайте непосредственно к MikroTik.');
    if (ENDPOINT[a.type] && ENDPOINT[b.type]) errors.push('Конечные устройства нельзя соединять напрямую: используйте коммутатор.');
  });
  var adj = adjacency(state), rt = routers[0], net, pool, guestNet, guestPool, used = Object.create(null);
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
    if (rt.cfg.customDns && (!validIp(rt.cfg.dnsPrimary) || (rt.cfg.dnsSecondary && !validIp(rt.cfg.dnsSecondary)))) errors.push('DNS: укажите корректные IPv4-адреса серверов.');
    if (rt.cfg.dnsStatic) {
      if (rt.cfg.dnsCache === false) errors.push('Локальная DNS-запись требует включённого DNS-кэша роутера для клиентов.');
      if (!validHostname(rt.cfg.dnsStaticName) || !validIp(rt.cfg.dnsStaticIp)) errors.push('Локальная DNS-запись: укажите корректное имя и IPv4-адрес.');
    }
    if (rt.cfg.ntpClient) {
      if (!validHostname(rt.cfg.ntpServer) && !validIp(rt.cfg.ntpServer)) errors.push('NTP: укажите корректное имя сервера или IPv4.');
      if (!/^[A-Za-z_+-]+(?:\/[A-Za-z_+\-]+){1,2}$/.test(rt.cfg.timeZone || '')) errors.push('NTP: укажите часовой пояс RouterOS, например Europe/Minsk или Etc/UTC.');
      warnings.push('NTP: модель не проверяет синхронизацию; проверьте разрешение имени, доступ UDP/123 и корректность часового пояса на устройстве.');
    }
    if (rt.cfg.secureManagement) warnings.push('Ограничение управления отключает MAC WinBox, MAC Telnet и WebFig и ограничивает WinBox/SSH основной LAN. Проверьте IP-доступ и подготовьте консоль; IPv6 и существующие правила нужно оценить отдельно.');
    if (rt.cfg.cloudDdns) warnings.push('IP Cloud связывается с сервисом MikroTik и публикует DDNS-имя. За CGNAT или внешним NAT имя не обеспечивает входящий доступ; модель доступность не проверяет.');
    if (rt.cfg.identityOn && (!rt.cfg.systemIdentity || rt.cfg.systemIdentity.length > 64 || /[\x00-\x1f\x7f]/.test(rt.cfg.systemIdentity))) errors.push('Имя MikroTik: от 1 до 64 символов без управляющих символов.');
    if (rt.cfg.staticRoute) {
      var dest = parseCidr(rt.cfg.routeDst), next = ipToInt(rt.cfg.routeGw), dist = Number(rt.cfg.routeDistance);
      if (!dest || dest.prefix === 0 || dest.ipInt !== dest.firstInt) errors.push('Статический маршрут: укажите адрес сети с маской, не маршрут по умолчанию.');
      if (!net || next === null || !net.contains(next) || next === net.firstInt || next === net.lastInt || rt.cfg.routeGw === rt.cfg.gw) errors.push('Статический маршрут: шлюз должен быть другим допустимым IPv4 в основной LAN.');
      if (!/^\d{1,3}$/.test(String(rt.cfg.routeDistance || '')) || dist < 1 || dist > 254) errors.push('Статический маршрут: distance должен быть от 1 до 254.');
      if (dest && net && dest.overlaps(net)) errors.push('Статический маршрут пересекается с основной LAN.');
      if (dest && rt.cfg.vlanGuest && parseCidr(rt.cfg.guestNet) && dest.overlaps(parseCidr(rt.cfg.guestNet))) errors.push('Статический маршрут пересекается с гостевой сетью.');
      if (dest && rt.cfg.vpn && parseCidr(rt.cfg.vpnPool) && dest.overlaps(parseCidr(rt.cfg.vpnPool))) errors.push('Статический маршрут пересекается с VPN.');
      if (rt.cfg.wanMonitor && dest && dest.contains(rt.cfg.monitorHost)) errors.push('Статический маршрут пересекается с адресом мониторинга WAN.');
      warnings.push('Статический маршрут: модель не проверяет доступность следующего шлюза и обратный маршрут; проверьте firewall и обе стороны на оборудовании.');
    }
    if (rt.cfg.vlanGuest) {
      guestNet = parseCidr(rt.cfg.guestNet);
      if (!guestNet || guestNet.prefix !== 24 || guestNet.ipInt !== guestNet.firstInt) { errors.push('Гостевая сеть: укажите адрес подсети /24, например 192.168.99.0/24.'); guestNet = null; }
      else {
        guestPool = poolOf(guestNet);
        var gg = ipToInt(rt.cfg.guestGw);
        if (gg === null || !guestNet.contains(gg) || gg === guestNet.firstInt || gg === guestNet.lastInt) errors.push('Гостевой шлюз: нужен допустимый IP в гостевой подсети.');
        else if (rt.cfg.guestDhcp && gg >= guestPool.startInt && gg <= guestPool.endInt) errors.push('Гостевой шлюз не должен входить в гостевой DHCP-пул.');
        else used[rt.cfg.guestGw] = 'гостевой шлюз';
        if (net && net.overlaps(guestNet)) errors.push('LAN и гостевая подсеть пересекаются.');
        var vpnNet = rt.cfg.vpn && parseCidr(rt.cfg.vpnPool);
        if (vpnNet && vpnNet.overlaps(guestNet)) errors.push('VPN и гостевая подсеть пересекаются.');
      }
      if (!/^\d{1,4}$/.test(String(rt.cfg.guestVlan || '')) || +rt.cfg.guestVlan < 2 || +rt.cfg.guestVlan > 4094) errors.push('Гостевой VLAN ID: целое число от 2 до 4094 (VLAN 1 используется для основной LAN).');
      if (!rt.cfg.firewall) errors.push('Для изоляции гостевого VLAN включите Firewall.');
      warnings.push('Гостевые порты — access VLAN; обычный коммутатор не разделяет сегменты на одном порту. Фильтрация VLAN может отключить доступ к роутеру: настройте безопасное восстановление и проверьте порты. Изоляция клиентов в реальной сети не проверяется.');
    }
    if (rt.cfg.wifiAp) {
      if (!/^[A-Za-z0-9_-]{1,30}$/.test(rt.cfg.wifiIf || '') || rt.cfg.wifiIf === 'wifi-guest') errors.push('Wi-Fi: укажите имя существующего радио-интерфейса (например wifi1).');
      if (!validWifiSsid(rt.cfg.wifiSsid)) errors.push('Wi-Fi: SSID должен занимать от 1 до 32 байт UTF-8 без управляющих символов.');
      if (!validWifiPass(rt.cfg.wifiPass)) errors.push('Wi-Fi: пароль WPA2 должен содержать 8–63 печатных ASCII-символа.');
      if (!rt.cfg.wifiCountry || /[\x00-\x1f\x7f]/.test(rt.cfg.wifiCountry)) errors.push('Wi-Fi: укажите страну как в списке RouterOS.');
      if (rt.cfg.wifiGuest) {
        if (!rt.cfg.vlanGuest) errors.push('Гостевой Wi-Fi требует включённого гостевого VLAN.');
        if (!validWifiSsid(rt.cfg.wifiGuestSsid) || rt.cfg.wifiGuestSsid === rt.cfg.wifiSsid) errors.push('Гостевой Wi-Fi: нужен отдельный SSID (1–32 байта).');
        if (!validWifiPass(rt.cfg.wifiGuestPass)) errors.push('Гостевой Wi-Fi: пароль WPA2 должен содержать 8–63 печатных ASCII-символа.');
        if (rt.cfg.wifiGuestIsolation) warnings.push('Изоляция клиентов гостевого SSID относится к устройствам на этой точке доступа; она не изолирует автоматически проводных гостей или клиентов других AP. Проверьте реальное оборудование.');
      }
      warnings.push('Wi-Fi: проект рассчитан на RouterOS 7.13+ и пакет wifi, поддерживающий режим AP и виртуальный SSID. Проверьте модель, список радио, лицензирование и страну; пакет wireless/wifiwave2 требует другой настройки.');
    } else if (rt.cfg.wifiGuest) errors.push('Гостевой Wi-Fi требует включённой точки доступа Wi-Fi.');
    if (rt.cfg.wifiGuestIsolation && (!rt.cfg.wifiAp || !rt.cfg.wifiGuest)) errors.push('Изоляция Wi-Fi-клиентов требует включённого гостевого Wi-Fi.');
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
    (adj[rt.id] || []).forEach(function(id) { if (ids[id] && ids[id].type !== 'isp' && branchSegment(state, adj, rt.id, id) === 'mixed') errors.push('Один порт MikroTik и неуправляемый коммутатор не могут одновременно быть основной и гостевой сетью. Используйте отдельные access-порты.'); });
    if (rt.cfg.vlanGuest && !rt.cfg.wifiAp && !(adj[rt.id] || []).some(function(id) { return ids[id] && ids[id].type !== 'isp' && branchSegment(state, adj, rt.id, id) === 'main'; })) warnings.push('На схеме нет порта основной LAN для управления после включения VLAN. Подготовьте консоль или отдельный порт управления.');
  }
  endpoints.forEach(function (d) {
    var c = d.cfg || {}, guest = guestDevice(d), target = guest ? guestNet : net, targetPool = guest ? guestPool : pool;
    var dhcpOn = rt && (guest ? rt.cfg.guestDhcp : rt.cfg.dhcp), targetGw = rt && (guest ? rt.cfg.guestGw : rt.cfg.gw);
    if (guest && (!rt || !rt.cfg.vlanGuest)) errors.push('«' + d.name + '»: включите гостевой VLAN на MikroTik.');
    if (c.mode === 'dhcp') { if (rt && !dhcpOn) errors.push('«' + d.name + '»: включите DHCP-сервер нужного сегмента MikroTik.'); return; }
    if (c.mode !== 'static') { errors.push('«' + d.name + '»: выберите DHCP или статический адрес.'); return; }
    var address = parseCidr(c.ip);
    if (!address || !target || address.prefix !== target.prefix || !target.contains(address.ipInt) || address.ipInt === target.firstInt || address.ipInt === target.lastInt)
      errors.push('«' + d.name + '»: нужен допустимый адрес LAN с маской /24 в выбранном сегменте.');
    else {
      if (used[address.ip]) errors.push('«' + d.name + '»: адрес ' + address.ip + ' уже занят (' + used[address.ip] + ').');
      used[address.ip] = d.name;
      if (dhcpOn && targetPool && address.ipInt >= targetPool.startInt && address.ipInt <= targetPool.endInt) errors.push('«' + d.name + '»: статический адрес находится в пуле DHCP ' + targetPool.start + '–' + targetPool.end + '.');
    }
    if (!rt || c.gw !== targetGw) errors.push('«' + d.name + '»: укажите IP MikroTik как шлюз выбранного сегмента.');
    if (c.dns && !validIp(c.dns)) errors.push('«' + d.name + '»: неверный DNS.');
  });
  if (rt && rt.cfg.vlanGuest && !rt.cfg.wifiGuest && !endpoints.some(guestDevice)) warnings.push('В гостевом VLAN пока нет клиентских устройств и гостевого Wi-Fi.');
  ds.forEach(function(d) {
    if ((d.type === 'pc' || d.type === 'server') && d.cfg && d.cfg.extraPublications !== undefined &&
        (!Array.isArray(d.cfg.extraPublications) || d.cfg.extraPublications.length > 15 || d.cfg.extraPublications.some(function(r){ return !r || typeof r !== 'object' || Array.isArray(r); })))
      errors.push('«' + d.name + '»: допускается не более 16 корректных правил публикации.');
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
  if (pool && endpoints.filter(function (d) { return d.cfg && d.cfg.mode === 'dhcp' && !guestDevice(d); }).length > 100 || guestPool && endpoints.filter(function (d) { return d.cfg && d.cfg.mode === 'dhcp' && guestDevice(d); }).length > 100) errors.push('Недостаточно адресов DHCP-пула.');
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
      if (w && guestNet && w.overlaps(guestNet)) errors.push('Подсети гостевого VLAN и WAN пересекаются.');
      if (w && rt && rt.cfg.vpn && parseCidr(rt.cfg.vpnPool) && w.overlaps(parseCidr(rt.cfg.vpnPool))) errors.push('Подсети VPN и WAN пересекаются.');
      if (c.dns && !validIp(c.dns)) errors.push('WAN: неверный DNS.');
    }
    if (c.kind === 'lte') warnings.push('LTE зависит от модели модема, версии RouterOS и имени lte1; проверьте его на устройстве.');
  });
  if (rt && rt.cfg.wanMonitor) {
    var primary = isps.filter(function(d, i) { return priority(d, i) === 'primary'; })[0];
    var probe = rt.cfg.monitorHost;
    if (isps.length !== 2 || !wanFailover(rt.cfg)) errors.push('Контроль интернета требует двух провайдеров и включённого резервного канала.');
    if (!primary || primary.cfg.kind !== 'static') errors.push('Контроль внешнего узла пока поддерживает только статический WAN основного провайдера.');
    if (!usableProbe(probe)) errors.push('Контроль WAN: укажите внешний unicast IPv4 для ping.');
    if ((net && net.contains(probe)) || (guestNet && guestNet.contains(probe)) || (rt.cfg.vpn && parseCidr(rt.cfg.vpnPool) && parseCidr(rt.cfg.vpnPool).contains(probe)) || isps.some(function(d){ var w = d.cfg.kind === 'static' && parseCidr(d.cfg.ip); return w && w.contains(probe); })) errors.push('Контроль WAN: адрес проверки не должен находиться в LAN, VPN или подсети WAN.');
    var directDns = rt.cfg.customDns ? rt.cfg.dnsPrimary : (primary && primary.cfg.kind === 'static' && primary.cfg.dns ? primary.cfg.dns : '1.1.1.1');
    if (rt.cfg.dnsCache === false && probe === directDns) errors.push('Контроль WAN: выберите контрольный IPv4, отличный от DNS, выдаваемого клиентам напрямую: маршрут к этому узлу закреплён за основным WAN.');
    warnings.push('Маршрут к контрольному IPv4 закреплён за основным WAN даже при переключении. Не используйте этот адрес как единственный DNS или критичный сервис на резерве.');
    warnings.push('Основной статический WAN: рекурсивный маршрут проверяет один внешний IPv4 по ICMP. Узел может блокировать ping или быть недоступным сам; резерв и полная доступность интернета не проверяются. Существующие соединения могут оборваться.');
  }
  if (rt && rt.cfg.staticRoute && parseCidr(rt.cfg.routeDst) && isps.some(function(d){var w=d.cfg.kind === 'static' && parseCidr(d.cfg.ip); return w && w.overlaps(parseCidr(rt.cfg.routeDst));})) errors.push('Статический маршрут пересекается с подсетью WAN.');
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
  var dns = rt.cfg.customDns ? [rt.cfg.dnsPrimary, rt.cfg.dnsSecondary].filter(Boolean).join(',') : isps[0].kind === 'static' && isps[0].cfg.dns ? isps[0].cfg.dns + ',8.8.8.8' : '1.1.1.1,8.8.8.8';
  var upstreamDns = dns.split(',')[0], cacheOn = rt.cfg.dnsCache !== false;
  var assignments = {}; assignments[rt.id] = { ip: rt.cfg.gw + '/24', gw: '—', dns: dns, src: 'статический' };
  var lease = pool.startInt, guestLease = rt.cfg.vlanGuest ? poolOf(parseCidr(rt.cfg.guestNet)).startInt : 0;
  ds.forEach(function (d) {
    if (!ENDPOINT[d.type]) return;
    var c = d.cfg;
    var guest = guestDevice(d), gw = guest ? rt.cfg.guestGw : rt.cfg.gw, clientDns = cacheOn ? gw : upstreamDns;
    assignments[d.id] = c.mode === 'dhcp' ? { ip: intToIp(guest ? guestLease++ : lease++) + '/24', gw: gw, dns: clientDns, src: guest ? 'пример DHCP (гостевой VLAN)' : 'пример DHCP-аренды' } : { ip: c.ip, gw: c.gw, dns: c.dns || clientDns, src: guest ? 'статический (гостевой VLAN)' : 'статический' };
  });
  isps.forEach(function (i) { assignments[i.id] = { ip: i.kind === 'static' ? i.cfg.ip : 'динамический', gw: i.kind === 'static' ? i.cfg.gw : 'от провайдера', dns: i.kind === 'static' ? (i.cfg.dns || 'не задан') : 'от провайдера', src: i.kind }; });
  var lanPorts = ports.filter(function (p) { return p.dev.type !== 'isp'; });
  lanPorts.forEach(function(p) { p.segment = branchSegment(state, adj, rt.id, p.dev.id); });
  return { router: { id: rt.id, name: rt.name, cfg: rt.cfg, net: net, pool: pool, gw: rt.cfg.gw, dns: dns, clientDns: cacheOn ? rt.cfg.gw : upstreamDns, guestDns: cacheOn ? rt.cfg.guestGw : upstreamDns, lanPorts: lanPorts },
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
    var found = providers.filter(function(d, index) { return d.on !== false && !(index === 0 && candidate.cfg.wanMonitor && candidate.probeOn === false); })[0];
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
/* Two disconnected L2 networks, each with one router. Independent NICs have
   already been expanded, so a multihomed host never joins these components. */
function independentNetworks(state) {
  var devices = state.devices || [], adj = adjacency(state), seen = Object.create(null), parts = [];
  if (devices.filter(function(d) { return d.type === 'router'; }).length !== 2 || (state.links || []).some(function(l) {return !adj[l.a] || !adj[l.b];})) return null;
  devices.forEach(function(d) {
    if (seen[d.id]) return;
    var queue = [d.id], ids = Object.create(null); seen[d.id] = true;
    while (queue.length) { var id = queue.shift(); ids[id] = true; (adj[id] || []).forEach(function(n) { if (!seen[n]) { seen[n] = true; queue.push(n); } }); }
    parts.push({ devices:devices.filter(function(x) { return ids[x.id]; }), links:(state.links || []).filter(function(l) { return ids[l.a] && ids[l.b]; }) });
  });
  if (parts.length !== 2 || parts.some(function(p) { return p.devices.filter(function(d){return d.type === 'router';}).length !== 1; })) return null;
  return parts.map(function(p) {
    var providers = p.devices.filter(function(d) {return d.type === 'isp';});
    return { devices:p.devices.map(function(d) { return providers.length === 1 && d.type === 'isp' ? Object.assign({}, d, {cfg:Object.assign({}, d.cfg, {priority:'primary'})}) : d; }), links:p.links };
  });
}
function routesForState(state) {
  var parts = independentNetworks(state);
  return parts ? parts.reduce(function(all,p) { return all.concat(activeRoutes(p)); }, []) : activeRoutes(state);
}
function runIndependent(parts) {
  var errors = [], warnings = ['Две независимые сети: каждый адаптер использует свой маршрутизатор и провайдера. Это не автоматическое резервирование; при отказе канала остальные сети не перенаправляют его трафик.', 'Виртуальные машины, виртуальные коммутаторы и привязка сетевых карт гипервизора не моделируются. Назначьте каждой ВМ нужный отдельный адаптер и проверьте её DHCP, шлюз, DNS и фактический выход в интернет.'], runs = [];
  parts.forEach(function(p) {
    var router = p.devices.filter(function(d) {return d.type === 'router';})[0], r = runSingle(p);
    r.errors.forEach(function(e){errors.push('«' + router.name + '»: ' + e);});
    r.warnings.forEach(function(w){warnings.push('«' + router.name + '»: ' + w);});
    runs.push({router:router, result:r});
  });
  var a = parseCidr(runs[0].router.cfg.lan), b = parseCidr(runs[1].router.cfg.lan);
  if (a && b && a.overlaps(b)) warnings.push('LAN-подсети независимых сетей совпадают или пересекаются. Разные подсети упрощают настройку гипервизора, хоста и маршрутизации; при общих адресах возможны неоднозначные маршруты.');
  if (errors.length) return {errors:errors,warnings:warnings,model:null,timeline:[],groups:[],winbox:[],addrRows:[]};
  var model = {assignments:{}, networks:runs.map(function(x){return x.result.model;})};
  var timeline = [], groups = [], steps = [], rows = [];
  runs.forEach(function(x) {
    Object.assign(model.assignments, x.result.model.assignments);
    timeline.push({t:'log',level:'info',text:'Независимая сеть: ' + x.router.name});
    timeline = timeline.concat(x.result.timeline);
    x.result.groups.forEach(function(g) {groups.push({id:x.router.id + ':' + g.id,title:x.router.name + ' — ' + g.title,code:'# Только для ' + x.router.name.replace(/[\r\n]/g, ' ') + '\n' + g.code});});
    x.result.winbox.forEach(function(w) {steps.push(Object.assign({},w,{title:x.router.name + ' — ' + w.title}));});
    rows = rows.concat(x.result.addrRows);
  });
  return {errors:[],warnings:warnings,independent:true,model:model,timeline:timeline,groups:groups,winbox:steps,addrRows:rows};
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
  r.lanPorts.forEach(function (p) { g.push('/interface bridge port add bridge=bridge-lan interface=' + p.phys + (r.cfg.vlanGuest ? ' pvid=' + (p.segment === 'guest' ? r.cfg.guestVlan : '1') + ' frame-types=admit-only-untagged-and-priority-tagged ingress-filtering=yes' + (p.segment === 'guest' ? ' disabled=yes' : '') : '')); });
  add('iface', '1. Мост и порты LAN', g);
  add('addr', '2. Адрес LAN и DNS', ['/ip address add address=' + r.gw + '/24 interface=bridge-lan', '/ip dns set servers=' + r.dns + ' allow-remote-requests=' + (r.cfg.dnsCache === false ? 'no' : 'yes')]);
  g = [];
  model.isps.forEach(function (i) {
    var c = i.cfg, dist = i.priority === 'primary' ? 1 : 2, routeOn = i.priority === 'primary' || wanFailover(r.cfg);
    g.push('# ' + (dist === 1 ? 'Основной' : 'Резервный') + ' канал: ' + i.phys);
    if (i.kind === 'pppoe') g.push('/interface pppoe-client add name=' + i.iface + ' interface=' + i.phys + ' user=' + q(c.user) + ' password=' + q(c.pass) + ' add-default-route=' + (routeOn ? 'yes' : 'no') + ' default-route-distance=' + dist + ' disabled=no');
    if (i.kind === 'dhcp') g.push('/ip dhcp-client add interface=' + i.phys + ' add-default-route=' + (routeOn ? 'yes' : 'no') + ' default-route-distance=' + dist + ' use-peer-dns=no disabled=no');
    if (i.kind === 'static') {
      g.push('/ip address add address=' + c.ip + ' interface=' + i.phys);
      if (i.priority === 'primary' && r.cfg.wanMonitor) g.push('/ip route add dst-address=' + r.cfg.monitorHost + '/32 gateway=' + c.gw + ' scope=10 comment="Проверка основного WAN"', '/ip route add dst-address=0.0.0.0/0 gateway=' + r.cfg.monitorHost + ' distance=1 target-scope=11 check-gateway=ping comment="Рекурсивный основной WAN"');
      else g.push('/ip route add dst-address=0.0.0.0/0 gateway=' + c.gw + ' distance=' + dist + ' check-gateway=ping' + (routeOn ? '' : ' disabled=yes'));
    }
    if (i.kind === 'lte') g.push('/interface lte apn add name=lab-apn add-default-route=' + (routeOn ? 'yes' : 'no') + ' default-route-distance=' + dist + ' apn=' + q(c.apn), '/interface lte set [find name="lte1"] apn-profiles=lab-apn', '# Проверьте, что модем создал маршрут по умолчанию.');
    g.push('/interface list member add list=WAN interface=' + i.iface);
  });
  add('wan', '3. Подключение провайдера', g);
  if (r.cfg.dhcp) add('dhcp', '4. DHCP LAN', ['/ip pool add name=pool-lan ranges=' + r.pool.start + '-' + r.pool.end, '/ip dhcp-server add name=dhcp-lan interface=bridge-lan address-pool=pool-lan disabled=no', '/ip dhcp-server network add address=' + r.net.first + '/24 gateway=' + r.gw + ' dns-server=' + r.clientDns]);
  if (r.cfg.wifiAp) {
    var wifi = ['# RouterOS 7.13+, пакет wifi. Проверить имя радио и режим AP; временно выключаем радио.',
      '/interface wifi set [find name=' + q(r.cfg.wifiIf) + '] disabled=yes configuration.mode=ap configuration.country=' + q(r.cfg.wifiCountry) + ' configuration.ssid=' + q(r.cfg.wifiSsid) + ' security.authentication-types=wpa2-psk security.passphrase=' + q(r.cfg.wifiPass),
      '/interface bridge port add bridge=bridge-lan interface=' + q(r.cfg.wifiIf) + (r.cfg.vlanGuest ? ' pvid=1 frame-types=admit-only-untagged-and-priority-tagged ingress-filtering=yes' : '')];
    if (r.cfg.wifiGuest) wifi.push('/interface wifi add name=wifi-guest master-interface=' + q(r.cfg.wifiIf) + ' disabled=yes configuration.mode=ap configuration.ssid=' + q(r.cfg.wifiGuestSsid) + ' security.authentication-types=wpa2-psk security.passphrase=' + q(r.cfg.wifiGuestPass) + (r.cfg.wifiGuestIsolation ? ' datapath.client-isolation=yes' : ''),
      '/interface bridge port add bridge=bridge-lan interface=wifi-guest pvid=' + r.cfg.guestVlan + ' frame-types=admit-only-untagged-and-priority-tagged ingress-filtering=yes');
    add('wifi', 'Wi-Fi: параметры и порты (пока выключены)', wifi);
  }
  if (r.cfg.vlanGuest) {
    var gn = parseCidr(r.cfg.guestNet), gp = poolOf(gn);
    var guests = r.lanPorts.filter(function(p) { return p.segment === 'guest'; }).map(function(p) { return p.phys; });
    if (r.cfg.wifiGuest) guests.push('wifi-guest');
    var vlan = ['/interface vlan add name=vlan-guest interface=bridge-lan vlan-id=' + r.cfg.guestVlan,
      '/ip address add address=' + r.cfg.guestGw + '/24 interface=vlan-guest',
      '/interface bridge vlan add bridge=bridge-lan tagged=bridge-lan' + (guests.length ? ' untagged=' + guests.join(',') : '') + ' vlan-ids=' + r.cfg.guestVlan];
    if (r.cfg.guestDhcp) vlan.push('/ip pool add name=pool-guest ranges=' + gp.start + '-' + gp.end, '/ip dhcp-server add name=dhcp-guest interface=vlan-guest address-pool=pool-guest disabled=no', '/ip dhcp-server network add address=' + gn.first + '/24 gateway=' + r.cfg.guestGw + ' dns-server=' + r.guestDns);
    add('guest-vlan', 'Гостевой VLAN и DHCP', vlan);
  }
  if (r.cfg.staticRoute) add('route', 'Статический маршрут к сети за LAN-шлюзом', ['/ip route add dst-address=' + r.cfg.routeDst + ' gateway=' + r.cfg.routeGw + ' distance=' + r.cfg.routeDistance]);
  var services = [];
  if (r.cfg.identityOn) services.push('/system identity set name=' + q(r.cfg.systemIdentity));
  if (r.cfg.dnsStatic) services.push('/ip dns static add name=' + q(r.cfg.dnsStaticName) + ' address=' + r.cfg.dnsStaticIp + ' type=A');
  if (r.cfg.ntpClient) services.push('/system clock set time-zone-autodetect=no time-zone-name=' + q(r.cfg.timeZone), '/system ntp client set enabled=yes', '/system ntp client servers add address=' + q(r.cfg.ntpServer));
  if (r.cfg.cloudDdns) services.push('/ip cloud set ddns-enabled=yes', '# Проверьте /ip cloud print и доступность публичного адреса; CGNAT не обходится.');
  if (services.length) add('services', 'DNS, время и сервисы', services);
  var vpn = r.cfg.vpn ? vpnConfig(r.cfg, r) : null;
  if (vpn) add('vpn', 'VPN — ' + r.cfg.vpnType, vpn.commands);
  if (r.cfg.firewall) {
    var filter = ['/ip firewall filter add chain=input action=accept connection-state=established,related,untracked', '/ip firewall filter add chain=input action=drop connection-state=invalid', '/ip firewall filter add chain=input action=accept protocol=icmp', '/ip firewall filter add chain=input action=accept in-interface-list=LAN', '/ip firewall filter add chain=input action=accept protocol=udp src-port=67 dst-port=68 in-interface-list=WAN'];
    if (r.cfg.vlanGuest) {
      var guestUdp = []; if (r.cfg.dnsCache !== false) guestUdp.push('53'); if (r.cfg.guestDhcp) guestUdp.push('67');
      if (guestUdp.length) filter.push('/ip firewall filter add chain=input in-interface=vlan-guest protocol=udp dst-port=' + guestUdp.join(',') + ' action=accept');
      if (r.cfg.dnsCache !== false) filter.push('/ip firewall filter add chain=input in-interface=vlan-guest protocol=tcp dst-port=53 action=accept');
    }
    if (vpn) filter = filter.concat(vpn.input);
    filter.push('/ip firewall filter add chain=input action=drop', '/ip firewall filter add chain=forward action=accept connection-state=established,related,untracked', '/ip firewall filter add chain=forward action=drop connection-state=invalid', '/ip firewall filter add chain=forward action=accept in-interface-list=LAN out-interface-list=WAN');
    if (r.cfg.vlanGuest) filter.push('/ip firewall filter add chain=forward in-interface=vlan-guest out-interface-list=WAN action=accept');
    if (r.cfg.staticRoute) filter.push('/ip firewall filter add chain=forward in-interface=bridge-lan out-interface=bridge-lan dst-address=' + r.cfg.routeDst + ' action=accept');
    if (vpn) filter = filter.concat(vpn.forward);
    model.publications.forEach(function(p) { filter.push('/ip firewall filter add chain=forward in-interface-list=WAN connection-nat-state=dstnat protocol=' + p.proto + ' dst-address=' + p.ip + ' dst-port=' + p.local + ' action=accept'); });
    filter.push('/ip firewall filter add chain=forward action=drop');
    add('filter', '5. Firewall', filter);
  }
  var nat = ['/ip firewall nat add chain=srcnat out-interface-list=WAN action=masquerade'];
  model.publications.forEach(function(p) { nat.push('/ip firewall nat add chain=dstnat in-interface-list=WAN protocol=' + p.proto + ' dst-port=' + p.external + ' action=dst-nat to-addresses=' + p.ip + ' to-ports=' + p.local); });
  add('nat', '6. NAT и доступ извне', nat);
  if (r.cfg.vlanGuest || r.cfg.wifiAp) {
    var activate = ['# Внимание: VLAN filtering может отрезать управление. Используйте безопасный режим и консоль. Сначала проверьте таблицы и firewall.'];
    if (r.cfg.vlanGuest) {
      activate.push('/interface bridge set [find name=bridge-lan] vlan-filtering=yes');
      r.lanPorts.filter(function(p) { return p.segment === 'guest'; }).forEach(function(p) { activate.push('/interface bridge port set [find where bridge=bridge-lan and interface=' + p.phys + '] disabled=no'); });
    }
    if (r.cfg.wifiAp) activate.push('/interface wifi set [find name=' + q(r.cfg.wifiIf) + '] disabled=no');
    if (r.cfg.wifiGuest) activate.push('/interface wifi set [find name=wifi-guest] disabled=no');
    add('activate-lan', 'Включение VLAN и Wi-Fi после проверки', activate);
  }
  if (r.cfg.secureManagement) add('secure-management', 'Ограничение служб управления — только после проверки доступа', [
    '# ВНИМАНИЕ: после применения MAC-доступ и WebFig будут выключены. Подготовьте консоль и проверьте IP-доступ из LAN.',
    '/ip service set [find name=winbox] address=' + r.net.first + '/24',
    '/ip service set [find name=ssh] address=' + r.net.first + '/24',
    '/ip service disable [find where name=telnet or name=ftp or name=www or name=www-ssl or name=api or name=api-ssl]',
    '/tool mac-server set allowed-interface-list=none',
    '/tool mac-server mac-winbox set allowed-interface-list=none',
    '/tool mac-server ping set enabled=no',
    '/ip neighbor discovery-settings set discover-interface-list=LAN',
    '# Ограничения IP Services не заменяют firewall; отдельно проверьте IPv6 и другие способы управления.'
  ]);
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
      '/ppp profile add name=profile-vpn local-address=' + first + ' remote-address=pool-vpn dns-server=' + r.clientDns + ' interface-list=VPN',
      '/ppp secret add name=' + q(c.vpnUser) + ' password=' + q(c.vpnPass) + ' service=l2tp profile=profile-vpn',
      '/interface l2tp-server server set enabled=yes use-ipsec=required ipsec-secret=' + q(c.vpnPsk) + ' default-profile=profile-vpn authentication=mschap2');
    input.push('/ip firewall filter add chain=input in-interface-list=WAN protocol=udp dst-port=500,4500 action=accept', '/ip firewall filter add chain=input in-interface-list=WAN protocol=ipsec-esp action=accept', '/ip firewall filter add chain=input protocol=udp dst-port=1701 ipsec-policy=in,ipsec action=accept');
    match = 'in-interface-list=VPN';
  } else {
    cmd.push('# Предварительно импортируйте сертификаты с ключом сервера и доверенным сертификатом клиента. Сверьте имена и цепочку доверия.',
      '/ip pool add name=pool-vpn ranges=' + client + '-' + last,
      '/ip ipsec mode-config add name=ike-lab responder=yes address-pool=pool-vpn address-prefix-length=32 static-dns=' + r.clientDns + ' split-include=' + r.net.first + '/24',
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
  if (r.cfg.dnsCache !== false) input.push('/ip firewall filter add chain=input ' + match + ' protocol=udp dst-port=53 action=accept', '/ip firewall filter add chain=input ' + match + ' protocol=tcp dst-port=53 action=accept');
  forward.push('/ip firewall filter add chain=forward ' + match + ' out-interface-list=LAN action=accept');
  return { commands:cmd, input:input, forward:forward };
}
/* Параметры WinBox строятся из той же модели, что и команды RouterOS.
   Снимки из документации и других указанных источников — примеры, не с устройства пользователя. */
function winboxSteps(state, model) {
  var r = model.router, steps = [];
  function add(title, image, instructions, illustrations) { steps.push({ title: title, image: image, instructions: instructions, illustrations: illustrations || [] }); }
  add('Подготовка и безопасное подключение', 'official/winbox-login.png', [
    'Подключите ПК к локальному порту роутера. В WinBox откройте Neighbors, выберите устройство по MAC-адресу, введите логин и пароль и нажмите Connect.',
    'Сохраните резервную копию в Files → Backup; сохраните также текстовый экспорт через New Terminal: /export file=before-lab. Копии скачайте с роутера.',
    'Эта инструкция рассчитана на RouterOS 7 с чистой конфигурацией: на работающем роутере сначала сопоставьте существующие мосты, DHCP, списки интерфейсов и правила. Не удаляйте и не сбрасывайте настройки вслепую. Держите локальный доступ для восстановления.'
  ]);
  add('Мост и локальные порты', 'official/bridge-lan.png', [
    'Откройте Bridge → вкладка Bridge → +. В поле Name укажите bridge-lan, нажмите OK.',
    r.lanPorts.length ? 'На вкладке Ports через + добавьте в Bridge = bridge-lan каждый из портов LAN: ' + r.lanPorts.map(function (p) { return p.phys + ' → ' + p.dev.name + (r.cfg.vlanGuest ? ' (PVID ' + (p.segment === 'guest' ? r.cfg.guestVlan : '1') + ')' : ''); }).join(', ') + '. Не добавляйте WAN-порты в мост.' : 'На схеме нет проводных LAN-портов; WAN-порт не добавляйте в мост. Для Wi-Fi добавьте радио по отдельному шагу.',
    'В Interfaces → Interface List создайте списки LAN и WAN. В Members добавьте в LAN интерфейс bridge-lan. WAN-интерфейсы добавим после их настройки.'
  ]);
  add('Адрес LAN и DNS', 'official/ip-address.png', [
    'Откройте IP → Addresses → +: Address = ' + r.gw + '/24, Interface = bridge-lan. Нажмите OK.',
    'Откройте IP → DNS: Servers = ' + r.dns + ', ' + (r.cfg.dnsCache === false ? 'выключите' : 'включите') + ' Allow Remote Requests и нажмите OK. DHCP выдаёт DNS ' + r.clientDns + '. Доступ к DNS с WAN будет закрыт правилами input, если включён Firewall.'
  ]);
  model.isps.forEach(function (i) {
    var c = i.cfg, dist = i.priority === 'primary' ? 1 : 2, routeOn = i.priority === 'primary' || wanFailover(r.cfg), list = [], illustrations = [];
    if (i.kind === 'pppoe') {
      list = [
        'Откройте Interfaces → + → PPPoE Client: Name = ' + i.iface + ', Interface = ' + i.phys + '.',
        'В Dial Out введите User = ' + c.user + ' и пароль из настроек провайдера. ' + (routeOn ? 'Включите' : 'Выключите') + ' Add Default Route, задайте Default Route Distance = ' + dist + '; Use Peer DNS оставьте выключенным. Нажмите OK.',
        'Откройте интерфейс и вкладку Status: проверьте enabled, running и Status = connected. Само подключение необходимо проверить у провайдера.'
      ];
      var official = 'https://help.mikrotik.com/docs/spaces/ROS/pages/328151/First+Time+Configuration';
      illustrations = [
        { after: 0, image: 'official/pppoe-general.png', caption: 'Пример MikroTik, вкладка General: на снимке pppoe-out1 и ether1. Для этого шага укажите ' + i.iface + ' и ' + i.phys + '. Путь через меню PPP также подходит.', source: official, sourceName: 'MikroTik' },
        { after: 1, image: 'official/pppoe-dial.png', caption: 'Пример MikroTik, вкладка Dial Out: значения, включая Distance = 1, на снимке могут отличаться. Для этого шага задайте Distance = ' + dist + ' и Add Default Route = ' + (routeOn ? 'yes' : 'no') + '. Это миниатюра из документации.', source: official, sourceName: 'MikroTik' }
      ];
    } else if (i.kind === 'dhcp') {
      list = [
        'Подключите кабель провайдера к ' + i.phys + '. В WinBox откройте IP → DHCP Client. Проверьте, нет ли уже DHCP-клиента на этом интерфейсе: при наличии откройте и измените его, не создавайте дубликат.',
        'Нажмите + (в WinBox 4 — New). На вкладке DHCP выберите Interface = ' + i.phys + ', Add Default Route = ' + (routeOn ? 'yes' : 'no') + ', Use Peer DNS = no; в дополнительных настройках укажите Default Route Distance = ' + dist + '. Поле может находиться на вкладке Advanced или отображаться иначе в вашей версии. Нажмите OK.',
        'На снимках Use Peer DNS включён: в этом проекте снимите эту галочку и используйте DNS из шага «Адрес LAN и DNS». Имя интерфейса и состояние stopped на снимках — пример, не ваши данные.',
        'В списке DHCP Client проверьте Status = bound и полученный IP Address. В IP → Addresses на ' + i.phys + ' появится динамический адрес. Адрес и шлюз предоставляет провайдер; адрес на схеме не является реальной арендой.',
        'Если маршрут включён, в IP → Routes проверьте динамический маршрут 0.0.0.0/0 и расстояние ' + dist + '. При двух WAN резервный маршрут может не быть активным, пока работает основной.'
      ];
      var wiki = 'https://mikrotik.wiki/wiki/%D0%9D%D0%B0%D1%81%D1%82%D1%80%D0%BE%D0%B9%D0%BA%D0%B0_DHCP_%D0%BD%D0%B0_MikroTik';
      illustrations = [
        { after: 1, image: 'examples/dhcp-client-create-winbox3.png', caption: 'WinBox 3: меню IP → DHCP Client, создание клиента. На снимке Use Peer DNS включён — для этого проекта выключите.', source: wiki, sourceName: 'MikroTik Wiki (независимый сайт)' },
        { after: 1, image: 'examples/dhcp-client-create-winbox4.png', caption: 'WinBox 4: создание DHCP-клиента. Используйте интерфейс и значения из текста, не со снимка.', source: wiki, sourceName: 'MikroTik Wiki (независимый сайт)' },
        { after: 3, image: 'examples/dhcp-client-bound-winbox3.png', caption: 'WinBox 3: статус bound и динамический адрес в IP → Addresses. Адрес — пример.', source: wiki, sourceName: 'MikroTik Wiki (независимый сайт)' },
        { after: 3, image: 'examples/dhcp-client-bound-winbox4.png', caption: 'WinBox 4: статус bound и динамический адрес. Адрес и имя интерфейса — пример.', source: wiki, sourceName: 'MikroTik Wiki (независимый сайт)' }
      ];
    } else if (i.kind === 'static') {
      list = [
        'Откройте IP → Addresses → +: Address = ' + c.ip + ', Interface = ' + i.phys + '. Нажмите OK.',
        'Откройте IP → Routes → +: Dst. Address = 0.0.0.0/0, Gateway = ' + c.gw + ', Distance = ' + dist + ', Check Gateway = ping. ' + (routeOn ? '' : 'Отключите маршрут. ') + 'Нажмите OK.',
        'Убедитесь, что шлюз провайдера отвечает на ping: иначе этот маршрут может считаться недоступным.'
      ];
      if (i.priority === 'primary' && r.cfg.wanMonitor) list = ['Откройте IP → Addresses → +: Address = ' + c.ip + ', Interface = ' + i.phys + '.', 'Маршрут по умолчанию через шлюз напрямую не добавляйте: используйте рекурсивные маршруты из отдельного шага контроля WAN.'];
    } else {
      list = [
        'Подключите поддерживаемый LTE-модем и SIM. В Interfaces проверьте имя lte1; настройка зависит от версии RouterOS и модема.',
        'В LTE → APNs создайте профиль lab-apn: APN = ' + c.apn + ', Add Default Route = ' + (routeOn ? 'yes' : 'no') + ', Default Route Distance = ' + dist + '. На интерфейсе lte1 выберите этот профиль.',
        'Проверьте состояние модема, полученный адрес и маршрут; при необходимости настройте PIN SIM и аутентификацию по данным оператора.'
      ];
    }
    if (!routeOn) list.push('Автопереключение выключено: отключите Add Default Route (для статического маршрута выключите маршрут).');
    list.push('Откройте Interfaces → Interface List → Members → +: List = WAN, Interface = ' + i.iface + '. Нажмите OK. Если запись уже есть, вторую не создавайте.');
    if (i.kind === 'dhcp' || i.kind === 'pppoe') illustrations.push({ after: list.length - 1, image: 'official/interface-list-member.png', caption: 'Пример MikroTik: добавление в список интерфейсов. На снимке LAN и bridge1; для этого шага выберите WAN и ' + i.iface + '.', source: 'https://help.mikrotik.com/docs/spaces/ROS/pages/328151/First+Time+Configuration', sourceName: 'MikroTik' });
    add('Провайдер «' + i.name + '» — ' + (i.priority === 'primary' ? 'основной' : 'резервный'),
      { pppoe: null, dhcp: null, static: 'official/ip-address.png', lte: null }[i.kind], list, illustrations);
  });
  if (r.cfg.dhcp) add('DHCP для локальной сети', 'official/dhcp-server.png', [
    'Откройте IP → Pool → +: Name = pool-lan, Addresses = ' + r.pool.start + '-' + r.pool.end + '. Нажмите OK.',
    'Откройте IP → DHCP Server → DHCP → +: Name = dhcp-lan, Interface = bridge-lan, Address Pool = pool-lan; убедитесь, что сервер включён.',
    'На вкладке Networks → + задайте Address = ' + r.net.first + '/24, Gateway = ' + r.gw + ', DNS Servers = ' + r.clientDns + '. Нажмите OK. Проверьте выдачу в Leases.'
  ]);
  if (r.cfg.firewall) add('Firewall: правила в точном порядке', 'official/firewall-rule.png', [
    'Откройте IP → Firewall → Filter Rules. Каждое правило добавляется кнопкой +; Chain и условия задаются на вкладках General/Advanced, Action — на вкладке Action. На чистом роутере разместите сверху вниз в следующем порядке:',
    '1. Chain = input, Connection State = established, related, untracked; Action = accept.',
    '2. Chain = input, Connection State = invalid; Action = drop.',
    '3. Chain = input, Protocol = icmp; Action = accept.',
    '4. Chain = input, In. Interface List = LAN; Action = accept.',
    '5. Chain = input, Protocol = udp, Src. Port = 67, Dst. Port = 68, In. Interface List = WAN; Action = accept (ответы DHCP-клиенту WAN).',
    '6. До drop добавьте правила input для VPN и DNS/DHCP гостевого VLAN из проекта команд ниже, если они включены.',
    '7. Chain = input; Action = drop (остальной доступ к роутеру).',
    '7. Chain = forward, Connection State = established, related, untracked; Action = accept.',
    '8. Chain = forward, Connection State = invalid; Action = drop.',
    '9. Chain = forward, In. Interface List = LAN, Out. Interface List = WAN; Action = accept.',
    '10. До завершающего drop добавьте разрешения гостевого VLAN в WAN, VPN и опубликованных ресурсов из проекта команд ниже, если они включены.',
    '11. Chain = forward; Action = drop. Сверьте порядок и существующие правила: добавление рядом с заводскими правилами без анализа может заблокировать доступ.'
  ]);
  if (r.cfg.wanMonitor) add('Контроль основного WAN через внешний узел', null, ['В IP → Routes настройте маршрут ' + r.cfg.monitorHost + '/32 через статический шлюз основного провайдера со Scope = 10, затем основной маршрут по умолчанию через этот узел с Target Scope = 11 и Check Gateway = ping. Резерв остаётся с Distance = 2.', 'Это один ICMP-узел: он может перестать отвечать независимо от канала. Проверьте маршруты, отказы и возврат на реальном оборудовании; модель ping не отправляет.']);
  if (r.cfg.staticRoute) add('Маршрут к дополнительной сети', null, ['В IP → Routes добавьте Dst. Address = ' + r.cfg.routeDst + ', Gateway = ' + r.cfg.routeGw + ', Distance = ' + r.cfg.routeDistance + '. Шлюз находится в основной LAN.', 'В Firewall до завершающего drop добавьте разрешение LAN → указанная сеть из проекта команд. Проверьте обратный маршрут и реальную доступность шлюза.']);
  if (r.cfg.identityOn || r.cfg.dnsStatic || r.cfg.ntpClient || r.cfg.cloudDdns) add('Имя роутера, DNS, время и IP Cloud', null, ['Включённые параметры приведены в проекте команд: System → Identity, IP → DNS → Static, System → NTP Client и IP → Cloud.', 'Проверьте DNS, время, часовой пояс и DDNS на устройстве. DDNS не обходит CGNAT, а модель не обращается к серверам.']);
  if (r.cfg.vlanGuest) add('Гостевой VLAN и изоляция', null, [
    'В Bridge → Ports укажите PVID 1 для основной LAN и PVID ' + r.cfg.guestVlan + ' для гостевых access-портов; до включения фильтрации гостевые порты держите отключёнными. На одном неуправляемом коммутаторе нельзя смешивать сегменты.',
    'В Interfaces → VLAN создайте vlan-guest на bridge-lan, VLAN ID ' + r.cfg.guestVlan + '; в Bridge → VLANs добавьте bridge-lan как tagged и гостевые порты как untagged. Назначьте ' + r.cfg.guestGw + '/24 и настройте DHCP гостевого сегмента по проекту команд.',
    'В Firewall добавьте разрешения DNS/DHCP к роутеру и выхода гостей только в WAN до завершающих drop. Подготовьте консоль, затем включите VLAN Filtering и только после этого включите гостевые порты. Изоляция проводных гостей и отдельных точек доступа не настраивается.'
  ]);
  if (r.cfg.wifiAp) add('Wi-Fi RouterOS 7.13+ (пакет wifi)', null, [
    'Откройте WiFi и настройте существующий ' + r.cfg.wifiIf + ': Mode = ap, Country = выбранная страна, SSID = ' + r.cfg.wifiSsid + ', Security = WPA2-PSK, пароль из проекта. Проверьте поддержку радио и лицензии.',
    'Добавьте основное радио в bridge-lan. ' + (r.cfg.wifiGuest ? 'Создайте виртуальный интерфейс wifi-guest на ' + r.cfg.wifiIf + ' с отдельным SSID, добавьте его в bridge-lan как access-порт с PVID ' + r.cfg.guestVlan + '.' : 'Гостевой SSID отключён.') + ' До проверки VLAN и firewall держите Wi-Fi отключённым.',
    (r.cfg.wifiGuest && r.cfg.wifiGuestIsolation ? 'На интерфейсе wifi-guest включите Datapath → Client Isolation. Проверьте изоляцию двух клиентов на реальной точке; проводные и другие AP не охватываются.' : 'Изоляция клиентов Wi-Fi не включена.') + ' Включите радио после проверки. Радио и клиенты в модели не эмулируются.'
  ]);
  if (r.cfg.secureManagement) add('Ограничение служб управления', null, ['После проверки IP-доступа откройте IP → Services: ограничьте WinBox и SSH подсетью ' + r.net.first + '/24; отключите telnet, ftp, www, www-ssl, api и api-ssl.', 'В Tools → MAC Server отключите MAC Telnet, MAC WinBox и MAC Ping. В IP → Neighbors → Discovery Settings ограничьте обнаружение списком LAN.', 'Проверьте IP-доступ из разрешённой LAN и консоль восстановления: MAC-управление и WebFig перестанут работать. Ограничения не заменяют firewall и проверку IPv6.']);
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
  if (routers.some(function(r) { return r.cfg.wanMonitor || r.cfg.staticRoute || r.cfg.customDns || r.cfg.dnsStatic || r.cfg.ntpClient || r.cfg.cloudDdns || r.cfg.identityOn || r.cfg.secureManagement || r.cfg.wifiGuestIsolation || r.cfg.dnsCache === false; })) errors.push('Дополнительные маршруты и сервисы в двухроутерной модели пока не поддерживаются; используйте один MikroTik.');
  if (routers[0].cfg.vlanGuest || routers[1].cfg.vlanGuest || routers[0].cfg.wifiAp || routers[1].cfg.wifiAp) errors.push('VLAN и Wi-Fi в двухроутерной модели пока не поддерживаются; используйте один MikroTik.');
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
/* Разворачиваем независимые сетевые карты в отдельные конечные узлы графа.
   ПК не становится мостом и не соединяет свои сети между собой. */
function expandAdapters(state) {
  var devices = state.devices || [], links = state.links || [], expanded = [], mapped = Object.create(null), errors = [], warnings = [], lookup = Object.create(null), linkMap = Object.create(null);
  devices.forEach(function(d) { lookup[d.id] = d; });
  devices.forEach(function(d) {
    if (d.type !== 'pc' && d.type !== 'server') { expanded.push(d); return; }
    var extras = Array.isArray(d.cfg && d.cfg.nics) ? d.cfg.nics : [];
    var adapters = [{id:'nic1', cfg:d.cfg}].concat(extras.map(function(n) { return {id:n.id, cfg:n}; }));
    if (extras.length > 3 || extras.some(function(n) { return !n || !/^nic[2-4]$/.test(n.id); }) || new Set(adapters.map(function(n){return n.id;})).size !== adapters.length) errors.push('«' + d.name + '»: допускается от одной до четырёх уникальных сетевых карт.');
    var used = Object.create(null);
    links.forEach(function(l) {
      if (l.a !== d.id && l.b !== d.id) return;
      var id = l.nicId || 'nic1';
      if (!adapters.some(function(n) { return n.id === id; })) errors.push('«' + d.name + '»: линия назначена несуществующей сетевой карте.');
      if (used[id]) errors.push('«' + d.name + '»: к одной сетевой карте можно подключить только один кабель.');
      used[id] = true;
    });
    if (extras.length) warnings.push('«' + d.name + '»: сетевые карты показаны независимо, без моста. Выбор маршрута ОС, метрики и фактическую доступность между сетями модель не проверяет. Публикация относится только к первой карте.');
    if (d.cfg.external && !used.nic1 && Object.keys(used).length) errors.push('«' + d.name + '»: подключите первую сетевую карту, на которую настроена публикация.');
    adapters.forEach(function(n, index) {
      if (!used[n.id] && (index || Object.keys(used).length)) {
        warnings.push('«' + d.name + '»: сетевая карта ' + (index + 1) + ' не подключена и не участвует в расчётах.');
        return;
      }
      var virtualId = index ? d.id + '::' + n.id : d.id;
      if (index && lookup[virtualId]) errors.push('Конфликт идентификатора сетевой карты.');
      var cfg = index ? Object.assign({}, n.cfg, {external:false}) : d.cfg;
      var dev = Object.assign({}, d, {id:virtualId, name:d.name + (extras.length ? ' · сетевая карта ' + (index + 1) : ''), cfg:cfg});
      expanded.push(dev); mapped[virtualId] = d.id;
    });
  });
  var newLinks = links.map(function(l, index) {
    var a = lookup[l.a], b = lookup[l.b], ep = a && (a.type === 'pc' || a.type === 'server') ? a : b && (b.type === 'pc' || b.type === 'server') ? b : null;
    var id = ep && l.nicId && l.nicId !== 'nic1' ? ep.id + '::' + l.nicId : ep && ep.id;
    var copy = Object.assign({}, l, {a:ep && l.a === ep.id ? id : l.a, b:ep && l.b === ep.id ? id : l.b});
    linkMap[[copy.a,copy.b].sort().join('|')] = l.id || null;
    return copy;
  });
  return { state:{devices:expanded, links:newLinks}, mapped:mapped, linkMap:linkMap, errors:errors, warnings:warnings };
}
function mapRoute(route, view) {
  var path = route.path, edgeIds = [];
  for (var i=0; i<path.length-1; i++) edgeIds.push(view.linkMap[[path[i],path[i+1]].sort().join('|')] || null);
  return Object.assign({}, route, {endpoint:view.mapped[route.endpoint] || route.endpoint, path:path.map(function(id){return view.mapped[id] || id;}), linkIds:edgeIds});
}
function expandedRun(state) {
  var view = expandAdapters(state);
  if (view.errors.length) { var basic = analyze(view.state); return {errors:view.errors.concat(basic.errors),warnings:view.warnings.concat(basic.warnings),model:null,timeline:[],groups:[],winbox:[],addrRows:[]}; }
  var expanded = view.state;
  var parts = independentNetworks(expanded);
  var res = parts ? runIndependent(parts) : expanded.devices.filter(function(d) {return d.type === 'router';}).length === 2 ? runDual(expanded) : runSingle(expanded);
  res.warnings = res.warnings.concat(view.warnings);
  if (res.model) {
    res.timeline.forEach(function(ev) {
      if (ev.t !== 'pkt') return;
      ev.linkId = view.linkMap[[ev.from,ev.to].sort().join('|')] || null;
      ev.from = view.mapped[ev.from] || ev.from; ev.to = view.mapped[ev.to] || ev.to;
    });
    (state.devices || []).forEach(function(d) {
      if (!d.cfg || !Array.isArray(d.cfg.nics)) return;
      if (!expanded.devices.some(function(x) {return x.id === d.id;})) res.addrRows.push([d.name + ' · сетевая карта 1', d.type === 'pc' ? 'ПК' : 'сервер', '—', '—', '—', 'не подключена']);
      d.cfg.nics.forEach(function(n) {
        if (!(state.links || []).some(function(l){ return (l.a === d.id || l.b === d.id) && l.nicId === n.id; }))
          res.addrRows.push([d.name + ' · сетевая карта ' + n.id.slice(3), d.type === 'pc' ? 'ПК' : 'сервер', '—', '—', '—', 'не подключена']);
      });
    });
  }
  return res;
}
/* Предварительная оценка совместимости с будущей изолированной CHR.
   Это НЕ запуск и НЕ проект для импорта: ошибки никогда не превращаются в
   частично применённую конфигурацию. Секреты и команды не возвращаются. */
function chrPreflight(state, routerId) {
  state = state || {devices:[], links:[]};
  var devices = state.devices || [], routers = devices.filter(function(d){return d.type === 'router';});
  var blockers = [], notices = [];
  if (routers.length !== 1 || !routers[0] || routers[0].id !== routerId) {
    blockers.push('Предварительная проверка CHR сейчас рассчитана только на одну выбранную схему с одним MikroTik.');
  } else {
    var c = routers[0].cfg || {}, mgmt = parseCidr('172.31.254.0/24');
    if (c.wifiAp || c.wifiGuest || c.wifiGuestIsolation) blockers.push('CHR не эмулирует Wi-Fi-радио: выбранные Wi-Fi настройки нельзя применить как настоящее радио.');
    if (devices.some(function(d){return d.type === 'isp' && d.cfg && d.cfg.kind === 'lte';})) blockers.push('Для LTE нужен поддерживаемый реальный модем; в виртуальной CHR он не эмулируется.');
    if (c.vpn) blockers.push('Автоматическое применение VPN и проверка сертификатов для CHR ещё не реализованы.');
    if (c.secureManagement) blockers.push('Ограничение управления пока несовместимо со служебным каналом доступа к CHR.');
    if (c.cloudDdns || c.ntpClient || c.wanMonitor) blockers.push('IP Cloud, NTP и проверка WAN требуют доступа к внешним сервисам, который в изолированной VM не предусмотрен.');
    var conflicts = [c.lan, c.vlanGuest ? c.guestNet : null, c.staticRoute ? c.routeDst : null];
    devices.forEach(function(d){if (d.type === 'isp' && d.cfg && d.cfg.kind === 'static') conflicts.push(d.cfg.ip);});
    if (conflicts.some(function(text){var net = text && parseCidr(text); return net && net.overlaps(mgmt);})) blockers.push('Сеть пересекается с зарезервированной для управления CHR подсетью 172.31.254.0/24.');
    var run = expandedRun(state);
    if (run.errors.length) blockers.push('Схема содержит ошибки; исправьте их в результатах проверки лаборатории.');
    notices.push('Виртуальные порты, провайдеры и клиенты не становятся физической сетью; действительный интернет и работу служб необходимо проверять отдельно.');
  }
  return {available:false, blockers:blockers, notices:notices,
    reason:'Запуск CHR, установка зависимостей, применение настроек и их проверка ещё не реализованы.'};
}
var LabEngine = { ipToInt: ipToInt, intToIp: intToIp, validIp: validIp, parseCidr: parseCidr, poolOf: poolOf, adjacency: adjacency, bfsPath: bfsPath,
  isIndependent: function(state) { var v = expandAdapters(state); return !v.errors.length && !!independentNetworks(v.state); },
  routerForCard: function(state, id, nic) { var v = expandAdapters(state), parts = !v.errors.length && independentNetworks(v.state), key = nic && nic !== 'nic1' ? id + '::' + nic : id; if (!parts) return null; var p = parts.filter(function(x) {return x.devices.some(function(d){return d.id === key;});})[0]; return p ? p.devices.filter(function(d){return d.type === 'router';})[0] : null; },
  chrPreflight: chrPreflight,
  analyze: analyze, buildModel: buildModel, buildTimeline: buildTimeline, activeRoutes: function(state) { var v=expandAdapters(state); return v.errors.length ? [] : routesForState(v.state).map(function(r){return mapRoute(r,v);}); }, genCommands: genCommands, addrRows: addrRows, winboxSteps: winboxSteps,
  run: function (state) {
    state = state || {devices:[],links:[]};
    if (!state.devices) state.devices = []; if (!state.links) state.links = [];
    return expandedRun(state);
  } };
global.LabEngine = LabEngine;
if (typeof module !== 'undefined' && module.exports) module.exports = LabEngine;
})(typeof window !== 'undefined' ? window : globalThis);
