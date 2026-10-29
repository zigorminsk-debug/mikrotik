/* =====================================================================
   Стенд моделирования MikroTik — движок (без DOM, работает и в Node).
   Вход: данные формы. Выход: план адресации, проверки, группы команд
   RouterOS v7 и пошаговая инструкция реализации.
   ===================================================================== */
(function (global) {
'use strict';

/* ---------------- IP-утилиты ---------------- */
function ipToInt(ip) {
  var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip).trim());
  if (!m) return null;
  var n = 0;
  for (var i = 1; i <= 4; i++) {
    var o = Number(m[i]);
    if (o < 0 || o > 255) return null;
    n = (n * 256) + o;
  }
  return n >>> 0;
}
function intToIp(n) { return [(n>>>24)&255, (n>>>16)&255, (n>>>8)&255, n&255].join('.'); }

function parseCidr(s) {
  s = String(s || '').trim();
  var m = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*\/\s*(\d{1,2})$/.exec(s);
  if (!m) return null;
  var ip = ipToInt(m[1]), p = Number(m[2]);
  if (ip === null || p < 8 || p > 30) return null;
  var size = Math.pow(2, 32 - p);
  var mask = (0xFFFFFFFF << (32 - p)) >>> 0;
  var base = (ip & mask) >>> 0;
  return {
    ip: m[1], prefix: p, mask: mask, size: size, base: base,
    first: intToIp(base), last: intToIp((base + size - 1) >>> 0),
    gwCandidate: intToIp((base + 1) >>> 0),
    contains: function (ipStr) {
      var v = ipToInt(ipStr);
      return v !== null && v >= base && v <= (base + size - 1);
    },
    overlaps: function (o) {
      return !((base + size - 1) < o.base || (o.base + o.size - 1) < base);
    }
  };
}
function parseRange(start, end, net) {
  var a = ipToInt(start), b = ipToInt(end);
  if (a === null || b === null || a > b) return null;
  if (net && !(net.contains(start) && net.contains(end))) return null;
  return { start: start, end: end, a: a, b: b };
}

/* ---------------- Чтение данных ---------------- */
function readInputs(v) {
  var isps = (v.isps || []).map(function (r, i) {
    return {
      idx: i,
      name: (r.name || '').trim() || ('Провайдер ' + (i + 1)),
      type: r.type, user: (r.user || '').trim(), pass: r.pass || '',
      ip: (r.ip || '').trim(), gw: (r.gw || '').trim(), dns: (r.dns || '').trim(),
      apn: (r.apn || '').trim() || 'internet', lteif: r.lteif || 'lte1'
    };
  });
  var pubs = (v.pubs || []).map(function (r) {
    return {
      ip: (r.ip || '').trim(), proto: r.proto || 'tcp',
      port: String(r.port || '').trim(),
      dport: String(r.dport || '').trim() || String(r.port || '').trim(),
      isp: r.isp || '*0'
    };
  });
  return {
    lan: { cidr: (v.lanCidr||'').trim(), gw: (v.lanGw||'').trim(),
           poolStart: (v.lanPoolStart||'').trim(), poolEnd: (v.lanPoolEnd||'').trim(),
           dhcp: !!v.lanDhcp },
    guest: { on: !!v.guestOn, cidr: (v.guestCidr||'').trim(), gw: (v.guestGw||'').trim(),
             poolStart: (v.guestPoolStart||'').trim(), poolEnd: (v.guestPoolEnd||'').trim() },
    wifi: { ssidWork: (v.ssidWork||'').trim(), ssidGuest: (v.ssidGuest||'').trim(), pass: v.wifiPass || '' },
    isps: isps,
    failover: !!v.failover, foTime: Number(v.foTime || 10),
    primaryIdx: Number(v.primaryIdx), backupIdx: Number(v.backupIdx),
    vpn: {
      type: v.vpnType || 'none', pool: (v.vpnPool||'').trim(),
      user: (v.vpnUser||'').trim(), pass: v.vpnPass || '', port: (v.vpnPort||'').trim(),
      s2sRemoteGw: (v.s2sRemoteGw||'').trim(), s2sPsk: v.s2sPsk || '',
      s2sRemoteSubnet: (v.s2sRemoteSubnet||'').trim()
    },
    pubs: pubs
  };
}

/* ---------------- Проверка исходных данных ---------------- */
function validate(inp) {
  var errors = [], warns = [], infos = [];
  var E = function (m) { errors.push(m); }, W = function (m) { warns.push(m); }, I = function (m) { infos.push(m); };

  var lan = parseCidr(inp.lan.cidr);
  if (!lan) E('LAN: подсеть задана неверно. Пример формата: 192.168.88.0/24.');
  else if (lan.prefix > 26) W('LAN: подсеть очень мала (/' + lan.prefix + ') — DHCP-пулу может не хватить адресов.');

  var lanGwInt = ipToInt(inp.lan.gw);
  if (lanGwInt === null) E('LAN: IP шлюза указан неверно (ожидается вида 192.168.88.1).');
  else if (lan && !lan.contains(inp.lan.gw)) E('LAN: шлюз ' + inp.lan.gw + ' не входит в подсеть ' + inp.lan.cidr + '.');

  if (lan) {
    var pool = parseRange(inp.lan.poolStart, inp.lan.poolEnd, lan);
    if (!pool) E('LAN: диапазон DHCP-пула должен лежать внутри подсети LAN (в формате IP, начало ≤ конец).');
    else if (lanGwInt !== null && pool.a <= lanGwInt && lanGwInt <= pool.b)
      W('LAN: пул содержит адрес шлюза — лучше начинать пул с ' + lan.gwCandidate + '.');
  }

  var guest = null;
  if (inp.guest.on) {
    guest = parseCidr(inp.guest.cidr);
    if (!guest) E('Гостевая сеть: подсеть задана неверно. Пример: 192.168.99.0/24.');
    if (ipToInt(inp.guest.gw) === null) E('Гостевая сеть: IP шлюза указан неверно.');
    else if (guest && !guest.contains(inp.guest.gw)) E('Гостевая сеть: шлюз не входит в подсеть ' + inp.guest.cidr + '.');
    if (lan && guest && lan.overlaps(guest)) E('Подсети LAN и гостевой сети пересекаются — адресация будет конфликтовать.');
    if (guest) {
      var gpool = parseRange(inp.guest.poolStart, inp.guest.poolEnd, guest);
      if (!gpool) E('Гостевая сеть: диапазон пула задан неверно или лежит за пределами подсети.');
      else if (ipToInt(inp.guest.gw) !== null && gpool.a <= ipToInt(inp.guest.gw) && ipToInt(inp.guest.gw) <= gpool.b)
        W('Гостевая сеть: пул содержит адрес шлюза — расширьте начало пула.');
    }
    if (!inp.wifi.ssidGuest) W('Гостевая сеть: не указан SSID — будет использован «Guest».');
  }
  if (inp.wifi.pass && inp.wifi.pass.length < 8)
    W('Wi-Fi пароль короче 8 символов: WPA2/WPA3 требует минимум 8.');
  if (!inp.wifi.ssidWork) W('Wi-Fi: не указан SSID рабочей сети.');

  if (!inp.isps.length) E('Не добавлен ни один интернет-провайдер.');
  var seen = {};
  inp.isps.forEach(function (isp, i) {
    var tag = 'Провайдер ' + (i + 1) + ' («' + isp.name + '»)';
    if (seen[isp.name.toLowerCase()]) W(tag + ': название повторяется — назовите провайдеров по-разному.');
    seen[isp.name.toLowerCase()] = true;
    if (isp.type === 'pppoe') {
      if (!isp.user) E(tag + ': для PPPoE укажите логин.');
      if (!isp.pass) E(tag + ': для PPPoE укажите пароль.');
    } else if (isp.type === 'static') {
      var ipParts = isp.ip.split('/');
      var ipOnly = ipParts[0], pl = Number(ipParts[1]);
      if (ipToInt(ipOnly) === null || ipParts.length !== 2 || isNaN(pl) || pl < 1 || pl > 32)
        E(tag + ': для статического IP укажите адрес с маской (например 198.51.100.2/30).');
      if (ipToInt(isp.gw) === null) E(tag + ': укажите шлюз провайдера.');
      if (ipToInt(ipOnly) !== null && ipToInt(isp.gw) !== null && pl >= 1 && pl <= 32) {
        var mask = (0xFFFFFFFF << (32 - pl)) >>> 0;
        if (((ipToInt(ipOnly) & mask) >>> 0) !== ((ipToInt(isp.gw) & mask) >>> 0))
          E(tag + ': IP роутера и шлюз провайдера из разных подсетей — проверьте маску префикса.');
      }
    } else if (isp.type === 'lte') {
      if (!isp.apn) E(tag + ': для LTE-модема укажите APN.');
    }
  });

  if (inp.failover) {
    if (inp.isps.length < 2) E('Резервный канал: нужно минимум два провайдера — добавьте ещё одного.');
    else {
      if (inp.primaryIdx === inp.backupIdx) E('Резервный канал: основной и резервный провайдер совпадают — выберите разные.');
      if (inp.primaryIdx < 0 || inp.primaryIdx >= inp.isps.length) E('Резервный канал: корректно выберите основного провайдера.');
      if (inp.backupIdx < 0 || inp.backupIdx >= inp.isps.length) E('Резервный канал: корректно выберите резервного провайдера.');
    }
  } else if (inp.isps.length > 1) {
    I('Провайдеров несколько, но «резервный канал» выключен: наружу пойдёт основной канал, вторые интерфейсы задействуются только для публикаций.');
  }

  var vpnPool = null;
  if (inp.vpn.type !== 'none') {
    vpnPool = parseCidr(inp.vpn.pool);
    if (!vpnPool) E('VPN: пул адресов задан неверно (пример: 10.10.10.0/24).');
    else {
      if (vpnPool.prefix > 28) E('VPN: пул слишком мал — нужна маска не уже /28.');
      if (lan && vpnPool.overlaps(lan)) E('VPN: пул VPN пересекается с подсетью LAN.');
      if (guest && vpnPool.overlaps(guest)) E('VPN: пул VPN пересекается с гостевой сетью.');
    }
    if (!inp.vpn.user) E('VPN: укажите имя пользователя VPN.');
    if (!inp.vpn.pass || inp.vpn.pass.length < 8) E('VPN: пароль VPN должен содержать минимум 8 символов.');
    if (inp.vpn.type === 'wireguard') {
      var vp = Number(inp.vpn.port);
      if (!vp || vp < 1 || vp > 65535) E('WireGuard: укажите корректный порт (1–65535).');
    }
    if (inp.vpn.type === 'ipsec-s2s') {
      if (ipToInt(inp.vpn.s2sRemoteGw) === null) E('VPN site-to-site: укажите публичный IP второго офиса.');
      if (!inp.vpn.s2sPsk) E('VPN site-to-site: укажите общий ключ (PSK).');
      var remote = parseCidr(inp.vpn.s2sRemoteSubnet);
      if (!remote) E('VPN site-to-site: подсеть второго офиса задана неверно (пример 10.20.0.0/24).');
      else if (lan && remote && lan.overlaps(remote)) E('VPN site-to-site: подсеть второго офиса пересекается с вашей LAN.');
    }
  }

  var usedExt = {};
  inp.pubs.forEach(function (p, i) {
    var tag = 'Публикация ' + (i + 1);
    if (ipToInt(p.ip) === null) E(tag + ': внутренний IP задан неверно.');
    else if (lan && !lan.contains(p.ip)) W(tag + ': IP ' + p.ip + ' не входит в LAN ' + inp.lan.cidr + ' — убедитесь, что хост существует.');
    var port = Number(p.port), dport = Number(p.dport);
    if (!port || port < 1 || port > 65535) E(tag + ': наружу указан некорректный порт (1–65535).');
    if (!dport || dport < 1 || dport > 65535) E(tag + ': внутренний порт некорректен (1–65535).');
    var key = p.proto + '/' + port;
    if (usedExt[key]) E(tag + ': внешний порт ' + port + '/' + p.proto + ' уже занят другой публикацией (' + usedExt[key] + ').');
    else usedExt[key] = tag;
    if (p.isp !== '*0') {
      var pi = Number(p.isp);
      if (pi < 0 || pi >= inp.isps.length) E(tag + ': выбранный провайдер не найден.');
    }
    if (inp.vpn.type === 'wireguard' && Number(p.port) === Number(inp.vpn.port) && p.proto === 'udp')
      W(tag + ': внешний порт совпадает с портом WireGuard (' + inp.vpn.port + '/udp).');
    if (inp.vpn.type === 'pptp' && Number(p.port) === 1723 && p.proto === 'tcp')
      W(tag + ': внешний порт совпадает с PPTP (1723/tcp).');
  });

  if (!errors.length) infos.push('Структура исходных данных корректна: конфликтов адресации и портов не найдено.');
  return { errors: errors, warnings: warns, infos: infos };
}

/* ---------------- План ---------------- */
function buildPlan(inp) {
  var lan = parseCidr(inp.lan.cidr);
  var guest = inp.guest.on ? parseCidr(inp.guest.cidr) : null;
  var k = 0; // счётчик физических (не LTE) портов
  var isps = inp.isps.map(function (isp, i) {
    var o = Object.assign({}, isp);
    if (isp.type === 'lte') {
      o.iface = isp.lteif || 'lte1';
      o.phys = null;
      o.routeKind = 'lte';
    } else {
      o.phys = 'ether' + (1 + k);           // ether1, ether2, ... — порты провайдеров
      if (isp.type === 'pppoe') {
        o.iface = 'pppoe-out' + (i + 1);
        o.routeKind = 'iface';
      } else {
        o.iface = 'ether-wan' + (1 + k);    // после переименования
        o.routeKind = isp.type === 'dhcp' ? 'dhcp' : 'gw';
      }
      k++;
    }
    return o;
  });
  // LAN-порты = все ether2..ether5, кроме занятых провайдерами
  var usedPhys = isps.map(function (i) { return i.phys; }).filter(Boolean);
  var bridgePorts = ['ether2', 'ether3', 'ether4', 'ether5'].filter(function (e) {
    return usedPhys.indexOf(e) < 0;
  });
  var primary = isps[inp.primaryIdx] || isps[0] || null;
  var backup = isps[inp.backupIdx] || null;
  return {
    inp: inp, lan: lan, guest: guest,
    vpnPool: inp.vpn.type !== 'none' ? parseCidr(inp.vpn.pool) : null,
    isps: isps, bridgePorts: bridgePorts,
    primary: primary, backup: backup,
    failover: inp.failover && isps.length >= 2 && !!primary && !!backup && primary !== backup
  };
}

function q(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
function gwOf(isp) {
  if (isp.routeKind === 'iface') return isp.iface;
  if (isp.routeKind === 'gw') return isp.gw;
  return null; // dhcp/lte — шлюз динамический
}
function gwKnown(isp) { return gwOf(isp) !== null; }

/* ---------------- Генерация конфигурации ---------------- */
function genCommands(plan) {
  var inp = plan.inp, groups = [];

  /* 1. Интерфейсы и мост */
  var g1 = ['/* === 1. Имена интерфейсов, мост LAN, списки === */',
    '# Схема портов (поправьте под свою модель!):',
    '#   ether1, ether2, ... — под провайдеров; bridge-lan = оставшиеся LAN-порты.'];
  plan.isps.forEach(function (i) {
    if (i.routeKind === 'dhcp' || i.routeKind === 'gw') {
      g1.push('/interface ethernet set [ find default-name=' + i.phys + ' ] name=' + i.iface +
        ' comment="WAN: ' + i.name + '"');
    } else if (i.routeKind === 'iface') {
      g1.push('# ' + i.name + ': физический порт ' + i.phys + ' (PPPoE поверх него)');
    } else {
      g1.push('# ' + i.name + ': USB LTE-модем — интерфейс ' + i.iface);
    }
  });
  g1.push('', '# Мост LAN:', '/interface bridge add name=bridge-lan comment="Локальная сеть"');
  plan.bridgePorts.forEach(function (p) {
    g1.push('/interface bridge port add bridge=bridge-lan interface=' + p);
  });
  g1.push('', '# Списки интерфейсов — удобны для правил firewall:',
    '/interface list add name=LAN comment="Локальная сеть"',
    '/interface list add name=WAN comment="Интернет"',
    '/interface list member add list=LAN interface=bridge-lan');
  plan.isps.forEach(function (i) { g1.push('/interface list member add list=WAN interface=' + i.iface); });
  if (!plan.bridgePorts.length)
    g1.push('# ⚠ Все ether-порты заняты провайдерами — под LAN используйте оставшийся порт/свитч.');
  groups.push({ id: 'iface', title: 'Интерфейсы, мост и списки', code: g1.join('\n') });

  /* 2. Адресация и пулы */
  var g2 = ['/* === 2. Адресация LAN, пулы и DNS === */',
    '/ip address add address=' + inp.lan.gw + '/' + plan.lan.prefix + ' interface=bridge-lan comment="LAN"',
    '/ip pool add name=pool-lan ranges=' + inp.lan.poolStart + '-' + inp.lan.poolEnd];
  if (plan.guest) {
    g2.push('/ip address add address=' + inp.guest.gw + '/' + plan.guest.prefix + ' interface=bridge-guest comment="Гости"',
      '/ip pool add name=pool-guest ranges=' + inp.guest.poolStart + '-' + inp.guest.poolEnd);
  }
  plan.isps.forEach(function (i) {
    if (i.routeKind === 'gw')
      g2.push('/ip address add address=' + i.ip + ' interface=' + i.iface + ' comment="WAN: ' + i.name + '"');
  });
  g2.push('', '# DNS-резолвер роутера (каширует запросы клиентов):',
    '/ip dns set servers=77.88.8.8,8.8.8.8 allow-remote-requests=yes cache-size=4096KiB');
  groups.push({ id: 'addr', title: 'Адресация, пулы и DNS', code: g2.join('\n') });

  /* 3. Провайдеры */
  var g3 = ['/* === 3. Подключение к интернет-провайдерам === */'];
  plan.isps.forEach(function (i) {
    g3.push('# --- ' + i.name + ' (' + i.type.toUpperCase() + ') ---');
    if (i.routeKind === 'iface') {
      g3.push('/interface pppoe-client add name=' + i.iface + ' interface=' + i.phys +
        ' user=' + q(i.user) + ' password=' + q(i.pass) +
        ' add-default-route=no use-peer-dns=no disabled=no allow=pap,chap,mschapv2 comment="WAN: ' + i.name + '"');
    } else if (i.routeKind === 'dhcp') {
      g3.push('/ip dhcp-client add interface=' + i.iface +
        ' add-default-route=no use-peer-dns=yes disabled=no comment="WAN: ' + i.name + '"');
    } else if (i.routeKind === 'gw') {
      g3.push('# ' + i.name + ': IP-адрес назначен в разделе 2, шлюз укажем в маршрутах (раздел 8).');
    } else {
      g3.push('/interface lte apn add name=apn-' + i.idx + ' apn=' + q(i.apn) + ' add-default-route=no',
        '/interface lte set [ find name=' + q(i.iface) + ' ] apn-profiles=apn-' + i.idx,
        '# Проверьте синтаксис APN для вашей версии RouterOS: apn-profiles устарел в 7.26.',
        '# Модем получит IP автоматически; проверьте: /interface lte print status');
    }
  });
  groups.push({ id: 'wan', title: 'Подключение провайдеров (PPPoE / DHCP / IP / LTE)', code: g3.join('\n') });

  /* 4. Гостевой мост */
  if (plan.guest) {
    var g4b = ['/* === 4. Гостевой сегмент === */',
      '/interface bridge add name=bridge-guest comment="Гостевая сеть"',
      '# При необходимости добавьте физический порт под проводных гостей:',
      '# /interface bridge port add bridge=bridge-guest interface=etherX',
      '# Wi-Fi гостевая сеть будет привязана к bridge-guest (раздел 5).',
      '# Гости изолированы от LAN: правила изоляции — в разделе firewall.'];
    groups.push({ id: 'guestbr', title: 'Гостевой сегмент (bridge)', code: g4b.join('\n') });
  }

  /* 5. Wi-Fi */
  if (inp.wifi.ssidWork) {
    var g5 = ['/* === 5. Wi-Fi: рабочая и гостевая сети === */',
      '# Рекомендуется включить правильную страну (иначе законность/радио):',
      '/interface wifi config set country=BY',
      '', '# Профили безопасности:',
      '/interface wifi security profiles add name=sec-work mode=wpa2 wpa2-pre-shared-key=' + q(inp.wifi.pass)];
    if (plan.guest)
      g5.push('/interface wifi security profiles add name=sec-guest mode=wpa2 wpa2-pre-shared-key=' + q(inp.wifi.pass));
    g5.push('', '# Рабочая сеть на мосту LAN:',
      '/interface wifi configuration add name=cfg-work ssid=' + q(inp.wifi.ssidWork) +
      ' security=sec-work mode-ap bridge=bridge-lan disabled=no');
    if (plan.guest)
      g5.push('', '# Гостевая сеть — на отдельном мосту (изоляция на уровне L2):',
        '/interface wifi configuration add name=cfg-guest ssid=' + q(inp.wifi.ssidGuest) +
        ' security=sec-guest mode-ap bridge=bridge-guest disabled=no');
    g5.push('', '# Если роутер БЕЗ wifiwave2 (классический /interface wireless):',
      '# 1) /interface wireless security-profiles add name=sec-work authentication-types=wpa2-psk pre-shared-key=' + q(inp.wifi.pass),
      '# 2) /interface wireless print — запомните имя радио (wlan1/wlan2)',
      '# 3) /interface wireless set wlan1 disabled=no ssid=' + q(inp.wifi.ssidWork) + ' security-profile=sec-work bridge=bridge-lan',
      '# 4) Второй SSID — через virtual-ap либо второй радиомодуль с bridge=bridge-guest');
    groups.push({ id: 'wifi', title: 'Wi-Fi: рабочая и гостевая сеть', code: g5.join('\n') });
  }

  /* 6. DHCP */
  if (inp.lan.dhcp) {
    var g6 = ['/* === 6. DHCP-серверы === */',
      '/ip dhcp-server add name=dhcp-lan interface=bridge-lan address-pool=pool-lan ' +
      'lease-time=10m disabled=no',
      '/ip dhcp-server network add address=' + plan.lan.first + '/' + plan.lan.prefix +
      ' gateway=' + inp.lan.gw + ' dns-server=77.88.8.8,8.8.8.8 comment="LAN"'];
    if (plan.guest) {
      g6.push('', '# Гостевой DHCP (ограниченная подсеть + лимит скорости):',
        '/ip dhcp-server add name=dhcp-guest interface=bridge-guest address-pool=pool-guest ' +
        'lease-time=10m disabled=no',
        '/ip dhcp-server network add address=' + plan.guest.first + '/' + plan.guest.prefix +
        ' gateway=' + inp.guest.gw + ' dns-server=77.88.8.8 comment="Гости"',
        '/queue simple add name=guest-limit max-limit=20M/20M target=' +
        plan.guest.first + '/' + plan.guest.prefix + ' comment="Полоса для гостей"');
    }
    groups.push({ id: 'dhcp', title: 'DHCP-серверы и очередь гостей', code: g6.join('\n') });
  }

  /* 7. Firewall: filter — строгий порядок! */
  var g7 = ['/* === 7. Firewall: правила защиты (filter) === */',
    '# Порядок правил КРИТИЧЕН — вставляйте строго сверху вниз.',
    '# input (трафик К роутеру):', '',
    'IPF01', 'IPF02', 'IPF03', 'IPF04', 'IPF05', 'IPF06', 'IPF07', 'IPF08', 'IPF09',
    '', '# forward (транзит через роутер):', '',
    'IPF10', 'IPF11'];
  var inputRules = [
    '/ip firewall filter add chain=input connection-state=established,related action=accept comment="1. Существующие соединения"',
    '/ip firewall filter add chain=input connection-state=invalid action=drop comment="2. Невалидные — запрет"',
    '/ip firewall filter add chain=input in-interface-list=WAN protocol=udp src-port=67 dst-port=68 action=accept comment="3. Ответы DHCP-клиента"',
    '/ip firewall filter add chain=input in-interface-list=WAN action=drop comment="4. Интернет → роутер: запрет"'
  ];
  if (inp.lan.dhcp) inputRules.push('/ip firewall filter add chain=input in-interface-list=LAN protocol=udp src-port=67 dst-port=68 action=drop comment="5. Чужой DHCP-сервер в LAN: запрет"');
  inputRules.push('/ip firewall filter add chain=input in-interface-list=LAN action=accept comment="6. LAN → роутер: разрешен (WinBox/DNS)"');
  if (plan.guest) {
    inputRules.push(
      '/ip firewall filter add chain=input in-interface=bridge-guest protocol=udp dst-port=53,67,68 action=accept comment="7. Гостям: DNS и DHCP"',
      '/ip firewall filter add chain=input in-interface=bridge-guest protocol=tcp dst-port=53 action=accept comment="8. Гостям: DNS (tcp)"');
  }
  inputRules.push('/ip firewall filter add chain=input action=drop comment="9. Всё прочее к роутеру: запрет"');
  var forwardRules = [
    '/ip firewall filter add chain=forward connection-state=established,related action=accept comment="F1. Существующие"',
    '/ip firewall filter add chain=forward connection-state=invalid action=drop comment="F2. Невалидные"'
  ];
  if (plan.guest) forwardRules.push('/ip firewall filter add chain=forward in-interface=bridge-guest out-interface-list=LAN action=drop comment="F3. Гости → LAN: запрет (изоляция)"');
  // Разрешающие правила публикаций — ДО общего «интернет → LAN: запрет»
  inp.pubs.forEach(function (p, n) {
    var inIf = p.isp === '*0' ? 'in-interface-list=WAN'
      : ('in-interface=' + (plan.isps[Number(p.isp)] ? plan.isps[Number(p.isp)].iface : 'WAN'));
    forwardRules.push('/ip firewall filter add chain=forward ' + inIf + ' protocol=' + p.proto +
      ' dst-address=' + p.ip + ' dst-port=' + p.dport + ' connection-state=new action=accept ' +
      'comment="F-ПУБЛ ' + p.ip + ':' + p.dport + ' из интернета"');
  });
  forwardRules.push(
    '/ip firewall filter add chain=forward in-interface-list=LAN out-interface-list=WAN action=accept comment="F4. LAN → интернет"');
  if (plan.guest) forwardRules.push('/ip firewall filter add chain=forward in-interface=bridge-guest out-interface-list=WAN action=accept comment="F5. Гости → интернет"');
  forwardRules.push('/ip firewall filter add chain=forward in-interface-list=WAN action=drop comment="F6. Интернет → LAN: запрет"');
  var g7code = ['/* === 7. Firewall: правила защиты (filter) === */',
    '# Порядок правил КРИТИЧЕН — добавляйте в указанном порядке.',
    '', '# --- input: трафик К роутеру ---'].concat(inputRules)
    .concat(['', '# --- forward: транзит через роутер ---']).concat(forwardRules)
    .concat(['', '# После добавления проверьте: /ip firewall filter print']);
  groups.push({ id: 'filter', title: 'Firewall: правила защиты (filter)', code: g7code.join('\n') });

  /* 8. NAT */
  var g8 = ['/* === 8. NAT: выход в интернет и публикация ресурсов === */',
    '/ip firewall nat add chain=srcnat out-interface-list=WAN action=masquerade comment="Выход в интернет"'];
  if (inp.pubs.length) {
    g8.push('', '# --- Публикация внутренних ресурсов (dstnat) ---');
    inp.pubs.forEach(function (p) {
      var inIf = p.isp === '*0' ? 'in-interface-list=WAN'
        : ('in-interface=' + (plan.isps[Number(p.isp)] ? plan.isps[Number(p.isp)].iface : 'WAN'));
      g8.push('/ip firewall nat add chain=dstnat ' + inIf + ' protocol=' + p.proto +
        ' dst-port=' + p.port + ' action=dst-nat to-addresses=' + p.ip + ' to-ports=' + p.dport +
        ' comment="Публикация ' + p.ip + ':' + p.dport + ' как ' + p.port + '/' + p.proto + '"');
    });
    g8.push('', '# Разрешающие forward-правила для публикаций уже добавлены в разделе 7 (F-ПУБЛ).');
  }
  groups.push({ id: 'nat', title: 'NAT: masquerade и публикация (dstnat)', code: g8.join('\n') });

  /* 9. Маршруты и failover */
  var g9 = ['/* === 9. Маршруты и резервный канал (failover) === */'];
  if (!plan.failover) {
    var only = plan.primary;
    if (only) {
      if (only.routeKind === 'iface')
        g9.push('/ip route add dst-address=0.0.0.0/0 gateway=' + only.iface + ' distance=1 comment="Default → ' + only.name + '"');
      else if (only.routeKind === 'dhcp')
        g9.push('/ip dhcp-client set [ find interface=' + only.iface + ' ] add-default-route=yes default-route-distance=1 use-peer-dns=yes');
      else if (only.routeKind === 'gw')
        g9.push('/ip route add dst-address=0.0.0.0/0 gateway=' + only.gw + ' distance=1 check-gateway=ping comment="Default → ' + only.name + '"');
      else
        g9.push('/interface lte apn set [ find name=apn-' + only.idx + ' ] add-default-route=yes default-route-distance=1');
    }
    g9.push('# Резервный канал не запрошен: при отключении провайдера интернета не будет.');
  } else {
    var pri = plan.primary, bak = plan.backup, T = inp.foTime;
    g9.push('# Два маршрута по умолчанию: основной distance=1, резервный distance=2.',
      '# Для статического WAN check-gateway проверяет шлюз, но не интернет за ним.',
      '# DHCP/PPPoE/LTE зависят от состояния клиента; время и сохранность сессий не гарантируются.');
    [[pri, 1, 'ОСНОВНОЙ'], [bak, 2, 'РЕЗЕРВ']].forEach(function (pair) {
      var isp = pair[0], dist = pair[1], role = pair[2];
      if (isp.routeKind === 'iface')
        g9.push('/ip route add dst-address=0.0.0.0/0 gateway=' + isp.iface + ' distance=' + dist +
          ' comment="' + role + ': ' + isp.name + '"');
      else if (isp.routeKind === 'gw')
        g9.push('/ip route add dst-address=0.0.0.0/0 gateway=' + isp.gw + ' distance=' + dist +
          ' check-gateway=ping comment="' + role + ': ' + isp.name + '"');
      else if (isp.routeKind === 'dhcp')
        g9.push('/ip dhcp-client set [ find interface=' + isp.iface + ' ] add-default-route=yes default-route-distance=' + dist + ' use-peer-dns=yes',
          '# (' + role + ': шлюз DHCP ' + isp.name + ' известен динамически, расстояние задаётся здесь)');
      else
        g9.push('/interface lte apn set [ find name=apn-' + isp.idx + ' ] add-default-route=yes default-route-distance=' + dist,
          '# (' + role + ': LTE-шлюз динамический, расстояние задаётся здесь)');
    });

    g9.push('', '# Метки соединений и policy routing не генерируются. Существующие соединения могут оборваться при переключении.');
    g9.push('', '# Netwatch ниже только диагностирует выбранный адрес по активному пути, НЕ переключает маршруты:',
      '/tool netwatch add host=8.8.8.8 type=icmp interval=' + T + 's timeout=1s comment="Проверка интернета"',
      '# Оповещение при потечении канала (настройте /tool e-mail):',
      '#   up-script=:log info "Интернет OK"; down-script=:log warning "НЕТ ИНТЕРНЕТА — проверьте каналы"');
  }
  groups.push({ id: 'route', title: 'Маршрутизация и авто-переключение', code: g9.filter(Boolean).join('\n') });

  /* VPN */
  if (inp.vpn.type !== 'none') groups.push(genVpn(plan));

  /* Проверка */
  var last = 9;
  var gv = ['/* === ' + (inp.vpn.type !== 'none' ? 10 : 9) + '. Быстрая проверка === */',
    '/ip route print where dst-address=0.0.0.0/0  # маршруты и расстояния',
    '/interface print                             # состояние pppoe/lte/dhcp',
    '/ip firewall filter print stats             # счётчики правил',
    '/tool netwatch print                         # контроль шлюзов',
    'ping 8.8.8.8 src-address=' + inp.lan.gw + '  # выход в интернет',
    '/ip dhcp-server lease print                 # выданные клиентам адреса'];
  groups.push({ id: 'verify', title: 'Проверка работоспособности', code: gv.join('\n') });
  return groups;
}

/* ---------------- VPN ---------------- */
function vpnTitle(t) {
  return ({ wireguard:'WireGuard', ikev2:'IPsec IKEv2', 'l2tp-ipsec':'L2TP/IPsec',
    'ipsec-s2s':'IPsec site-to-site', pptp:'PPTP', l2tp:'L2TP', sstp:'SSTP', ovpn:'OVPN' })[t] || t;
}
function genVpn(plan) {
  var v = plan.inp.vpn, lan = plan.lan;
  var vpnNet = parseCidr(v.pool);
  var base = vpnNet ? vpnNet.base : 0x0a0a0a00;
  var gw = intToIp(base + 1), from = intToIp(base + 20), to = intToIp(base + vpnNet.size - 2);
  var poolRange = from + '-' + to;
  var L = ['/* === VPN: ' + vpnTitle(v.type) + ' === */'];
  var psk = v.s2sPsk || v.pass;

  if (v.type === 'wireguard') {
    L.push(
      '# Сервер WireGuard на роутере:',
      '/interface wireguard add listen-port=' + v.port + ' name=wg0 comment="VPN"',
      '/ip address add address=' + gw + '/' + vpnNet.prefix + ' interface=wg0',
      '', '# Клиент: сгенерируйте ключи в приложении WireGuard (Windows/iOS/Android), затем:',
      '/interface wireguard peers add public-key="<ПУБЛ_КЛЮЧ_КЛИЕНТА>" allowed-address=' + from + '/32 interface=wg0 comment="' + v.user + '"',
      '', '# Узнать публичный ключ сервера: /interface wireguard print detail (public-key)',
      '', '# ---- конфиг клиента client.conf ----',
      '[Interface]',
      'PrivateKey = <ПРИВ_КЛЮЧ_КЛИЕНТА>',
      'Address = ' + from + '/' + vpnNet.prefix,
      'DNS = 77.88.8.8',
      '[Peer]',
      'PublicKey = <ПУБЛ_КЛЮЧ_СЕРВЕРА>',
      'Endpoint = <ПУБЛИЧНЫЙ_IP_РОУТЕРА>:' + v.port,
      'AllowedIPs = ' + (lan ? lan.first + '/' + lan.prefix : '192.168.88.0/24') + ', ' + v.pool + '   # 0.0.0.0/0 — весь трафик через VPN',
      '', '# Firewall:',
      '/ip firewall filter add chain=input protocol=udp dst-port=' + v.port + ' in-interface-list=WAN action=accept comment="WireGuard"');
  } else {
    L.push('# ВНИМАНИЕ: готовая конфигурация этого VPN старым стендом пока не генерируется.',
      '# Прежние шаблоны были неполными или использовали неверные параметры и удалены.',
      '# Используйте учебник и проверенный проект для конкретной RouterOS и клиента.',
      '# WireGuard, IKEv2 и L2TP/IPsec также доступны как проекты в графической лаборатории; проверяйте на оборудовании.');
  }
  return { id: 'vpn', title: 'VPN: ' + vpnTitle(v.type), code: L.join('\n') };
}

/* ---------------- Инструкция реализации ---------------- */
function buildImplementation(plan, groups) {
  var has = function (id) { return groups.some(function (g) { return g.id === id; }); };
  var steps = [
    { t: 'Подготовка роутера',
      d: 'Подключите ПК к порту LAN, откройте WinBox (вкладка Neighbors). Смените пароль администратора, обновите RouterOS до актуальной версии 7.x, при необходимости сделайте сброс к заводским настройкам.',
      cmds: ['/user set [find name=admin] password="НОВЫЙ_ПАРОЛЬ"', '/system package update check-for-updates', '/system package update install'] },
    { t: 'Интерфейсы и мост', d: 'Выполните группу «Интерфейсы, мост и списки»: переименуйте WAN-порты, создайте bridge-lan, добавьте в него LAN-порты, заведите списки LAN/WAN.', g: 'iface' },
    { t: 'Адресация и DNS', d: 'Группа «Адресация, пулы и DNS»: IP роутера в LAN, DHCP-пул, адреса гостевого сегмента (если есть), DNS-резолвер.', g: 'addr' },
    { t: 'Подключение провайдеров', d: 'Группа «Подключение провайдеров»: PPPoE (логин/пароль), DHCP-клиент, статический IP или LTE-модем — как задано в вашей задаче.', g: 'wan' }
  ];
  if (has('guestbr')) steps.push({ t: 'Гостевой сегмент', d: 'Создайте bridge-guest — на нём будут работать только гостевые ресурсы.', g: 'guestbr' });
  if (has('wifi')) steps.push({ t: 'Wi-Fi сети', d: 'Настройте профили безопасности, рабочий SSID (bridge-lan) и гостевой SSID (bridge-guest). Не забудьте /interface wifi config set country=BY.', g: 'wifi' });
  if (has('dhcp')) steps.push({ t: 'DHCP-серверы', d: 'Запустите DHCP для LAN и гостей, добавьте очередь ограничения полосы для гостевой сети.', g: 'dhcp' });
  steps.push({ t: 'Firewall (защита)', d: 'Вставьте правила filter строго в указанном порядке: разрешены established/related, запрещён транзит из интернета,LAN→роутер разрешён, гости изолированы от LAN.', g: 'filter' });
  steps.push({ t: 'NAT и публикация', d: 'masquerade даёт выход в интернет; dstnat-правила открывают нужные внутренние ресурсы наружу (разрешающие forward-правила уже сгенерированы в разделе firewall).', g: 'nat' });
  steps.push({ t: 'Маршруты и резерв', d: plan.failover
      ? 'Основной маршрут distance=1, резерв distance=2. Проверка статического шлюза не обнаруживает все отказы интернета; динамические каналы зависят от клиента. Проверьте переключение на оборудовании, сессии могут оборваться.'
      : 'Маршрут по умолчанию через провайдера. Для статического шлюза включена проверка ping; динамические каналы зависят от клиента.', g: 'route' });
  if (has('vpn')) steps.push({ t: 'VPN', d: 'Разверните выбранный VPN-сервер, заведите пользователя/пира, установите конфигурацию на клиент.', g: 'vpn' });
  steps.push({ t: 'Проверка работоспособности', d: 'Выполните команды проверки: маршрут активен, клиенты получают адреса, интернет работает. Затем физически отключите основной канал на ~30 с — трафик должен уйти в резерв; верните кабель — переключение обратно. Публикации проверьте из внешней сети.', g: 'verify' });
  steps.push({ t: 'Сохранение конфигурации', d: 'Сохраните бэкап с паролем и включите расписание автосохранения — настройки не потеряются при сбое питания.',
    cmds: ['/system backup save name=backup-before password="ПАРОЛЬ_АРХИВА"', '/system configuration save', '/system scheduler add name=auto-save interval=1d on-event="/system backup save name=daily"'] });
  return steps;
}

/* ---------------- API ---------------- */
var StandEngine = {
  ipToInt: ipToInt, intToIp: intToIp, parseCidr: parseCidr, parseRange: parseRange,
  readInputs: readInputs, validate: validate, buildPlan: buildPlan,
  genCommands: genCommands, buildImplementation: buildImplementation, vpnTitle: vpnTitle,
  run: function (formData) {
    var inp = readInputs(formData);
    var checks = validate(inp);
    var plan = null, groups = [], impl = [];
    if (!checks.errors.length) {
      plan = buildPlan(inp);
      groups = genCommands(plan);
      impl = buildImplementation(plan, groups);
    }
    return { input: inp, plan: plan, checks: checks, groups: groups, impl: impl };
  }
};
global.StandEngine = StandEngine;
if (typeof module !== 'undefined' && module.exports) module.exports = StandEngine;
})(typeof window !== 'undefined' ? window : globalThis);
