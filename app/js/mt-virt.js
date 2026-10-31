/* =====================================================================
   Виртуальный роутер RouterOS — браузерный симулятор (без DOM, работает
   в Node и в браузере).
   Ведёт модель конфигурации (интерфейсы, адреса, маршруты, firewall, NAT
   и т.п.) и отвечает на команды RouterOS в том же формате, что и настоящий
   API: { status, items: [{attrs:[{name,value}]}], message?, text? }.
   Предназначен для учебной лаборатории: применение конфигурации со стенда
   без подключения к реальному железу.
   ===================================================================== */
(function (global) {
  'use strict';

  /* ---------- утилиты ---------- */
  function escAttr(v) { return String(v == null ? '' : v); }

  /* ---------- состояние ---------- */
  function newState() {
    return {
      identity: { name: 'MikroTik' },
      dns: { servers: '77.88.8.8,8.8.8.8', allowRemoteRequests: false },
      clock: { timeZone: 'Europe/Minsk' },
      interfaces: [
        { name: 'ether1', 'default-name': 'ether1', type: 'ether', comment: '', disabled: false, running: true, master: '' },
        { name: 'ether2', 'default-name': 'ether2', type: 'ether', comment: '', disabled: false, running: true, master: '' },
        { name: 'ether3', 'default-name': 'ether3', type: 'ether', comment: '', disabled: false, running: true, master: '' },
        { name: 'ether4', 'default-name': 'ether4', type: 'ether', comment: '', disabled: false, running: true, master: '' },
        { name: 'ether5', 'default-name': 'ether5', type: 'ether', comment: '', disabled: false, running: true, master: '' }
      ],
      bridgePorts: [],   // { bridge, interface }
      lists: [],         // { list, interface }
      addresses: [],     // { address, interface, comment, network, disabled }
      pools: [],         // { name, ranges }
      routes: [],        // { dstAddress, gateway, distance, checkGateway, comment, active }
      filter: [],        // { chain, srcAddress, dstAddress, protocol, inInterface, outInterface, action, comment, disabled }
      nat: [],           // { chain, srcAddress, dstAddress, protocol, dstPort, inInterface, outInterface, action, toAddresses, toPorts, comment, disabled }
      pppoeClients: [],  // { name, interface, user, addDefaultRoute, disabled, running }
      dhcpClients: [],   // { interface, addDefaultRoute, disabled, bound, address, gateway }
      dhcpServers: [],   // { name, interface, addressPool, leaseTime, disabled }
      dhcpNetworks: [],  // { address, gateway, dnsServer }
      addressLists: [],  // { list, address }
      pppSecrets: [],    // { name, password, profile, service }
      wireguard: [],     // { name, listenPort, comment }
      ntp: { enabled: false, primary: '77.88.8.8', secondary: '8.8.4.4' },
      cloud: { enabled: false },
      services: { api: false, apiSsl: false, ssh: false, telnet: false, www: false, wwwSsl: false, ftp: false },
      users: [],         // { name, group, password }
      backups: [],       // { name, time }
      servicePorts: [],  // { name, port, protocol }
      graphing: [],      // { name, interface, storeEvery }
      scheduler: [],     // { name, startTime, interval, disabled }
      macServerEnabled: true,
      arp: [],           // { address, 'mac-address', interface, published }
      mangle: [],        // { chain, action, routingMark, connMark, comment }
      dhcpLeases: [],    // { mac-address, address, server, status, expires-after }
      logs: []           // { time, topics, message }
    };
  }

  function log(state, topics, message) {
    var now = new Date();
    var hh = String(now.getHours()).padStart(2, '0');
    var mm = String(now.getMinutes()).padStart(2, '0');
    var ss = String(now.getSeconds()).padStart(2, '0');
    state.logs.unshift({ time: hh + ':' + mm + ':' + ss, topics: topics, message: message });
    if (state.logs.length > 200) state.logs.pop();
  }

  /* ---------- разбор условий поиска [ find ... ] и where ... ---------- */
  // words — массив слов между '[' и ']' (или после 'where'); возвращает
  // массив условий {name, value} (значение без ведущего '=' уже stripped).
  function parseConditions(words) {
    var conds = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (w === 'find' || w === 'where') continue;
      if (w.charAt(0) === '=') {
        var eq = w.indexOf('=', 1);
        if (eq < 0) eq = w.length;
        conds.push({ name: w.slice(1, eq), value: w.slice(eq + 1) });
      }
    }
    return conds;
  }

  function matchItem(item, conds) {
    for (var i = 0; i < conds.length; i++) {
      var c = conds[i];
      var v = item[c.name];
      if (v === undefined || String(v) !== String(c.value)) return false;
    }
    return true;
  }

  function findIndices(items, conds) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      if (matchItem(items[i], conds)) out.push(i);
    }
    return out;
  }

  /* ---------- ответы ---------- */
  function replyDone(items, message, text) {
    var r = { status: 'done', items: items || [], message: message || '', text: text || '' };
    return r;
  }
  function replyTrap(message) {
    return { status: 'trap', items: [], message: message };
  }
  function itemOf(attrs) {
    var a = [];
    for (var k in attrs) {
      if (attrs.hasOwnProperty(k)) a.push({ name: k, value: escAttr(attrs[k]) });
    }
    return { attrs: a };
  }

  /* ---------- роутер ---------- */
  function VirtualRouter() {
    this.state = newState();
  }

  VirtualRouter.prototype.reset = function () {
    this.state = newState();
    return replyDone([itemOf({ message: 'виртуальный роутер сброшен к заводским настройкам' })]);
  };

  VirtualRouter.prototype.exportText = function () {
    var s = this.state, lines = [];
    lines.push('# jan/02/2026 12:00:00 by RouterOS 7.15 (virtual)');
    lines.push('# model = VirtualRouter (учебный симулятор)');
    lines.push('#');
    lines.push('/system identity set name=' + escAttr(s.identity.name));
    lines.push('/ip dns set servers=' + escAttr(s.dns.servers) + ' allow-remote-requests=' + (s.dns.allowRemoteRequests ? 'yes' : 'no'));
    s.interfaces.forEach(function (iface) {
      if (iface.disabled) lines.push('/interface ethernet disable ' + escAttr(iface.name));
      if (iface.comment) lines.push('/interface ethernet set [ find name=' + escAttr(iface.name) + ' ] comment=' + escAttr(iface.comment));
    });
    s.bridgePorts.forEach(function (bp) {
      lines.push('/interface bridge port add bridge=' + escAttr(bp.bridge) + ' interface=' + escAttr(bp.interface));
    });
    s.lists.forEach(function (lst) {
      lines.push('/interface list member add list=' + escAttr(lst.list) + ' interface=' + escAttr(lst.interface));
    });
    s.addresses.forEach(function (addr) {
      lines.push('/ip address add address=' + escAttr(addr.address) + ' interface=' + escAttr(addr.interface) + (addr.comment ? ' comment=' + escAttr(addr.comment) : ''));
    });
    s.pools.forEach(function (p) {
      lines.push('/ip pool add name=' + escAttr(p.name) + ' ranges=' + escAttr(p.ranges));
    });
    s.routes.forEach(function (r) {
      lines.push('/ip route add dst-address=' + escAttr(r.dstAddress) + ' gateway=' + escAttr(r.gateway) + ' distance=' + escAttr(r.distance) + (r.checkGateway ? ' check-gateway=' + escAttr(r.checkGateway) : '') + (r.comment ? ' comment=' + escAttr(r.comment) : ''));
    });
    s.filter.forEach(function (f) {
      lines.push('/ip firewall filter add chain=' + escAttr(f.chain) + ' action=' + escAttr(f.action) + (f.comment ? ' comment=' + escAttr(f.comment) : ''));
    });
    s.nat.forEach(function (n) {
      lines.push('/ip firewall nat add chain=' + escAttr(n.chain) + ' action=' + escAttr(n.action) + (n.comment ? ' comment=' + escAttr(n.comment) : ''));
    });
    lines.push('/ip firewall filter print');
    return { status: 'done', items: [], message: '', text: lines.join('\n') };
  };

  /* ---------- выполнение команды ---------- */
  VirtualRouter.prototype.execute = function (words) {
    if (!words || words.length === 0) return replyTrap('пустая команда');
    var path = words[0];
    var segments = path.slice(1).split('/');   // ['ip','address','add']
    var action = segments.pop();                // 'add' | 'print' | 'set' | 'remove'
    var prefix = segments.join('/');            // 'ip/address'

    // классификация слов: [ find ... ] → условия поиска, where … → фильтр print,
    // прочие =имя=значение → атрибуты команды
    var attrs = [];
    var conds = [];
    var bracketStart = words.indexOf('[');
    var bracketEnd = words.indexOf(']');
    var whereIdx = words.indexOf('where');
    for (var i = 1; i < words.length; i++) {
      var w = words[i];
      if (w === '[' || w === ']' || w === 'find') continue;
      if (i > bracketStart && i < bracketEnd) {
        // внутри скобок find: критерии совпадения (для set/remove)
        if (w.charAt(0) === '=') {
          var eq = w.indexOf('=', 1);
          if (eq > 0) conds.push({ name: w.slice(1, eq), value: w.slice(eq + 1) });
        }
        continue;
      }
      if (i === whereIdx + 1) {
        // условие после where (для print)
        if (w.charAt(0) === '=') {
          var eq2 = w.indexOf('=', 1);
          if (eq2 > 0) conds.push({ name: w.slice(1, eq2), value: w.slice(eq2 + 1) });
        }
        continue;
      }
      if (w.charAt(0) === '=') attrs.push(w);
    }

    var H = null, bestLen = -1;
    Object.keys(HANDLERS).forEach(function (key) {
        if (prefix.indexOf(key) === 0 && key.length > bestLen) { H = HANDLERS[key]; bestLen = key.length; }
    });
    if (!H) return replyTrap('неизвестная команда: ' + path);

    if (!H[action]) return replyTrap('действие не поддерживается симулятором: ' + path);

    try {
      return H[action].call(this, this.state, attrs, conds, words);
    } catch (e) {
      return replyTrap(e.message || String(e));
    }
  };

  /* ---------- обработчики команд ---------- */
  var HANDLERS = {};

  /* --- /system/identity --- */
  HANDLERS['system/identity'] = {
    print: function (s) {
      return replyDone([itemOf({ name: s.identity.name })]);
    },
    set: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (a.name) s.identity.name = a.name;
      log(s, 'system', 'имя системы изменено на ' + escAttr(a.name));
      return replyDone([itemOf({ name: s.identity.name })]);
    }
  };

  /* --- /interface --- */
  HANDLERS['interface'] = {
    print: function (s) {
      var items = s.interfaces.map(function (iface) {
        return itemOf({
          name: iface.name, type: iface.type,
          'actual-mtu': iface.disabled ? '0' : '1500',
          'l2mtu': '1500',
          'max-l2mtu': '1500',
          'max-frame-size': '1522',
          disabled: iface.disabled ? 'true' : 'false',
          running: iface.running ? 'true' : 'false',
          comment: iface.comment
        });
      });
      return replyDone(items);
    }
  };

  /* --- /interface/ethernet --- */
  HANDLERS['interface/ethernet'] = {
    set: function (s, attrs, conds, words) {
      var idx = findIndices(s.interfaces, conds);
      if (idx.length === 0) return replyTrap('не найден интерфейс по условиям');
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      idx.forEach(function (i) {
        if (a.name) s.interfaces[i].name = a.name;
        if (a.comment !== undefined) s.interfaces[i].comment = a.comment;
        if (a.disabled !== undefined) s.interfaces[i].disabled = a.disabled === 'yes' || a.disabled === 'true';
      });
      log(s, 'interface', 'интерфейс(-ы) обновлены: ' + idx.length);
      return replyDone([]);
    }
  };

  /* --- /interface/bridge --- */
  HANDLERS['interface/bridge'] = {
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.name) return replyTrap('не указано имя моста');
      s.interfaces.push({ name: a.name, type: 'bridge', comment: '', disabled: false, running: true, master: '' });
      log(s, 'interface', 'создан мост ' + escAttr(a.name));
      return replyDone([itemOf({ name: a.name })]);
    }
  };

  /* --- /interface/bridge/port --- */
  HANDLERS['interface/bridge/port'] = {
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.bridge || !a.interface) return replyTrap('укажите bridge и interface');
      s.bridgePorts.push({ bridge: a.bridge, interface: a.interface });
      log(s, 'interface', 'порт ' + escAttr(a.interface) + ' добавлен в мост ' + escAttr(a.bridge));
      return replyDone([]);
    }
  };

  /* --- /interface/list --- */
  HANDLERS['interface/list'] = {
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.name) return replyTrap('не указано имя списка');
      s.lists.push({ list: a.name, interface: '' });
      log(s, 'interface', 'создан список интерфейсов ' + escAttr(a.name));
      return replyDone([]);
    }
  };

  /* --- /interface/list/member --- */
  HANDLERS['interface/list/member'] = {
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.list || !a.interface) return replyTrap('укажите list и interface');
      s.lists.push({ list: a.list, interface: a.interface });
      log(s, 'interface', 'интерфейс ' + escAttr(a.interface) + ' добавлен в список ' + escAttr(a.list));
      return replyDone([]);
    }
  };

  /* --- /interface/pppoe-client --- */
  HANDLERS['interface/pppoe-client'] = {
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.name) return replyTrap('не указано имя клиента');
      s.pppoeClients.push({
        name: a.name, interface: a.interface || '', user: a.user || '',
        addDefaultRoute: a['add-default-route'] === 'yes', disabled: a.disabled === 'yes', running: false
      });
      log(s, 'ppp', 'PPPoE-клиент ' + escAttr(a.name) + ' создан (сессия не установлена)');
      return replyDone([itemOf({ name: a.name })]);
    }
  };

  /* --- /ip/address --- */
  HANDLERS['ip/address'] = {
    print: function (s) {
      var items = s.addresses.map(function (addr) {
        return itemOf({
          address: addr.address, network: addr.network || '',
          interface: addr.interface, disabled: addr.disabled ? 'true' : 'false',
          comment: addr.comment || ''
        });
      });
      return replyDone(items);
    },
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.address) return replyTrap('не указан адрес');
      var m = /^([\d.]+)\/(\d{1,2})$/.exec(a.address);
      if (!m) return replyTrap('неверный формат адреса с маской, например 192.168.88.1/24');
      var network = m[1] + '/' + m[2];
      s.addresses.push({ address: a.address, network: network, interface: a.interface || '', comment: a.comment || '', disabled: false });
      log(s, 'ip', 'добавлен адрес ' + escAttr(a.address) + ' на ' + escAttr(a.interface));
      return replyDone([itemOf({ address: a.address, interface: a.interface || '' })]);
    },
    remove: function (s, attrs, conds, words) {
      var idx = findIndices(s.addresses, conds);
      if (idx.length === 0) return replyTrap('записи не найдены');
      idx.reverse().forEach(function (i) { s.addresses.splice(i, 1); });
      log(s, 'ip', 'удалено адресов: ' + idx.length);
      return replyDone([]);
    }
  };

  /* --- /ip/pool --- */
  HANDLERS['ip/pool'] = {
    print: function (s) {
      var items = s.pools.map(function (p) {
        return itemOf({ name: p.name, ranges: p.ranges });
      });
      return replyDone(items);
    },
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.name || !a.ranges) return replyTrap('укажите name и ranges');
      s.pools.push({ name: a.name, ranges: a.ranges });
      log(s, 'ip', 'создан пул адресов ' + escAttr(a.name));
      return replyDone([itemOf({ name: a.name })]);
    }
  };

  /* --- /ip/dhcp-server --- */
  HANDLERS['ip/dhcp-server'] = {
    print: function (s) {
      var items = s.dhcpServers.map(function (d) {
        return itemOf({ name: d.name, interface: d.interface, 'address-pool': d.addressPool, 'lease-time': d.leaseTime, disabled: d.disabled ? 'true' : 'false' });
      });
      return replyDone(items);
    },
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.name) return replyTrap('не указано имя сервера');
      s.dhcpServers.push({ name: a.name, interface: a.interface || '', addressPool: a['address-pool'] || '', leaseTime: a['lease-time'] || '10m', disabled: a.disabled === 'yes' });
      log(s, 'dhcp', 'создан DHCP-сервер ' + escAttr(a.name));
      return replyDone([itemOf({ name: a.name })]);
    }
  };

  /* --- /ip/dhcp-server/network --- */
  HANDLERS['ip/dhcp-server/network'] = {
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.address) return replyTrap('не указана сеть');
      s.dhcpNetworks.push({ address: a.address, gateway: a.gateway || '', dnsServer: a['dns-server'] || '' });
      log(s, 'dhcp', 'добавлена сеть DHCP ' + escAttr(a.address));
      return replyDone([]);
    }
  };

  /* --- /ip/dns --- */
  HANDLERS['ip/dns'] = {
    print: function (s) {
      return replyDone([itemOf({ servers: s.dns.servers, 'allow-remote-requests': s.dns.allowRemoteRequests ? 'yes' : 'no' })]);
    },
    set: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (a.servers) s.dns.servers = a.servers;
      if (a['allow-remote-requests'] !== undefined) s.dns.allowRemoteRequests = a['allow-remote-requests'] === 'yes';
      log(s, 'dns', 'DNS обновлён');
      return replyDone([]);
    }
  };

  /* --- /ip/route --- */
  HANDLERS['ip/route'] = {
    print: function (s) {
      var items = s.routes.map(function (r) {
        return itemOf({
          'dst-address': r.dstAddress, gateway: r.gateway, distance: r.distance,
          'check-gateway': r.checkGateway || '', active: r.active ? 'true' : 'false', comment: r.comment || ''
        });
      });
      return replyDone(items);
    },
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a['dst-address'] || !a.gateway) return replyTrap('укажите dst-address и gateway');
      var active = isGatewayReachable(s, a.gateway);
      s.routes.push({
        dstAddress: a['dst-address'], gateway: a.gateway, distance: Number(a.distance) || 1,
        checkGateway: a['check-gateway'] || '', comment: a.comment || '', active: active
      });
      s.routes.sort(function (x, y) { return x.distance - y.distance; });
      log(s, 'route', 'добавлен маршрут ' + escAttr(a['dst-address']) + ' → ' + escAttr(a.gateway) + (active ? ' (active)' : ' (inactive)'));
      return replyDone([itemOf({ 'dst-address': a['dst-address'], gateway: a.gateway, active: active ? 'true' : 'false' })]);
    },
    remove: function (s, attrs, conds) {
      var idx = findIndices(s.routes, conds);
      if (idx.length === 0) return replyTrap('маршруты не найдены');
      idx.reverse().forEach(function (i) { s.routes.splice(i, 1); });
      return replyDone([]);
    }
  };

  function isGatewayReachable(s, gateway) {
    // шлюз считается達жим, если это имя интерфейса, который существует и running,
    // либо IP-адрес, который назначен на один из интерфейсов.
    var iface = s.interfaces.find(function (i) { return i.name === gateway; });
    if (iface) return iface.running && !iface.disabled;
    var addr = s.addresses.find(function (a) { return a.address.split('/')[0] === gateway; });
    if (addr) {
      var iface2 = s.interfaces.find(function (i) { return i.name === addr.interface; });
      return !!iface2 && iface2.running && !iface2.disabled;
    }
    return true; // внешний шлюз — считаем達жим
  }

  /* --- /ip/firewall/filter --- */
  HANDLERS['ip/firewall/filter'] = {
    print: function (s) {
      var items = s.filter.map(function (f) {
        return itemOf({
          chain: f.chain, action: f.action, 'in-interface': f.inInterface || '',
          'out-interface': f.outInterface || '', protocol: f.protocol || '',
          'src-address': f.srcAddress || '', 'dst-address': f.dstAddress || '',
          comment: f.comment || '', disabled: f.disabled ? 'true' : 'false'
        });
      });
      return replyDone(items);
    },
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.chain || !a.action) return replyTrap('укажите chain и action');
      s.filter.push({
        chain: a.chain, action: a.action,
        inInterface: a['in-interface'] || '', outInterface: a['out-interface'] || '',
        protocol: a.protocol || '', srcAddress: a['src-address'] || '', dstAddress: a['dst-address'] || '',
        comment: a.comment || '', disabled: a.disabled === 'yes'
      });
      log(s, 'firewall', 'добавлено правило filter: chain=' + escAttr(a.chain) + ' action=' + escAttr(a.action));
      return replyDone([]);
    },
    remove: function (s, attrs, conds) {
      var idx = findIndices(s.filter, conds);
      if (idx.length === 0) return replyTrap('правила не найдены');
      idx.reverse().forEach(function (i) { s.filter.splice(i, 1); });
      return replyDone([]);
    }
  };

  /* --- /ip/firewall/nat --- */
  HANDLERS['ip/firewall/nat'] = {
    print: function (s) {
      var items = s.nat.map(function (n) {
        return itemOf({
          chain: n.chain, action: n.action, 'in-interface': n.inInterface || '',
          'out-interface': n.outInterface || '', protocol: n.protocol || '', 'dst-port': n.dstPort || '',
          'to-addresses': n.toAddresses || '', 'to-ports': n.toPorts || '', comment: n.comment || ''
        });
      });
      return replyDone(items);
    },
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.chain || !a.action) return replyTrap('укажите chain и action');
      s.nat.push({
        chain: a.chain, action: a.action,
        inInterface: a['in-interface'] || '', outInterface: a['out-interface'] || '',
        protocol: a.protocol || '', dstPort: a['dst-port'] || '',
        toAddresses: a['to-addresses'] || '', toPorts: a['to-ports'] || '',
        comment: a.comment || '', disabled: a.disabled === 'yes'
      });
      log(s, 'firewall', 'добавлено правило nat: chain=' + escAttr(a.chain) + ' action=' + escAttr(a.action));
      return replyDone([]);
    },
    remove: function (s, attrs, conds) {
      var idx = findIndices(s.nat, conds);
      if (idx.length === 0) return replyTrap('правила не найдены');
      idx.reverse().forEach(function (i) { s.nat.splice(i, 1); });
      return replyDone([]);
    }
  };

  /* --- /ip/firewall/address-list --- */
  HANDLERS['ip/firewall/address-list'] = {
    print: function (s) {
      var items = s.addressLists.map(function (al) {
        return itemOf({ list: al.list, address: al.address });
      });
      return replyDone(items);
    },
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.list || !a.address) return replyTrap('укажите list и address');
      s.addressLists.push({ list: a.list, address: a.address });
      log(s, 'firewall', 'добавлен адрес в список ' + escAttr(a.list));
      return replyDone([]);
    }
  };

  /* --- /ping --- */
  HANDLERS['ping'] = {
    print: function (s, attrs, special, words) {
      var host = '';
      for (var i = 1; i < words.length; i++) {
        if (words[i] && words[i].charAt(0) !== '=' && words[i] !== 'print') { host = words[i]; break; }
      }
      if (!host) return replyTrap('укажите узел: /ping 8.8.8.8');
      var reachable = Math.random() > 0.1; // симуляция потерь 10 %
      var text = 'Пингуем ' + escAttr(host) + ' с 32 байт данных:\n' +
        'Ответ от ' + escAttr(host) + ': число байт=32 время=' + (10 + Math.floor(Math.random() * 40)) + 'мс TTL=64\n' +
        'Ответ от ' + escAttr(host) + ': число байт=32 время=' + (10 + Math.floor(Math.random() * 40)) + 'мс TTL=64\n' +
        'Ответ от ' + escAttr(host) + ': число байт=32 время=' + (10 + Math.floor(Math.random() * 40)) + 'мс TTL=64\n' +
        '\nСтатистика ' + escAttr(host) + ':\n' +
        '    Пакетов: отправлено = 3, получено = ' + (reachable ? 3 : 2) + ', потеряно = ' + (reachable ? 0 : 1) + '\n';
      log(s, 'system', 'ping ' + escAttr(host) + (reachable ? ' OK' : ' часть потерь'));
      return replyDone([], '', text);
    }
  };

  /* --- /tool/netwatch --- */
  HANDLERS['tool/netwatch'] = {
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.host) return replyTrap('укажите host');
      log(s, 'netwatch', 'слежение за ' + escAttr(a.host) + ' включено');
      return replyDone([itemOf({ host: a.host, status: 'up' })]);
    },
    print: function (s) {
      return replyDone([]);
    }
  };

  /* --- /ppp/secret --- */
  HANDLERS['ppp/secret'] = {
    print: function (s) {
      var items = s.pppSecrets.map(function (p) {
        return itemOf({ name: p.name, service: p.service, profile: p.profile });
      });
      return replyDone(items);
    },
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.name || !a.password) return replyTrap('укажите name и password');
      s.pppSecrets.push({ name: a.name, password: a.password, profile: a.profile || 'default', service: a.service || 'any' });
      log(s, 'ppp', 'создан пользователь PPP ' + escAttr(a.name));
      return replyDone([itemOf({ name: a.name })]);
    }
  };

  /* --- /interface/wireguard --- */
  HANDLERS['interface/wireguard'] = {
    print: function (s) {
      var items = s.wireguard.map(function (wg) {
        return itemOf({ name: wg.name, 'listen-port': wg.listenPort, comment: wg.comment || '' });
      });
      return replyDone(items);
    },
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.name) return replyTrap('укажите name');
      s.wireguard.push({ name: a.name, listenPort: a['listen-port'] || '13231', comment: a.comment || '' });
      log(s, 'vpn', 'создан WireGuard-интерфейс ' + escAttr(a.name));
      return replyDone([itemOf({ name: a.name })]);
    }
  };

  /* --- команды верхнего уровня: /ping, /export --- */
  HANDLERS[''] = {
    ping: function (s, attrs, conds, words) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      var host = a.address || '';
      if (!host) {
        for (var i = 1; i < words.length; i++) {
          if (words[i] && words[i].charAt(0) !== '=' && words[i] !== 'print') { host = words[i]; break; }
        }
      }
      if (!host) return replyTrap('укажите узел: /ping address=8.8.8.8');
      var reachable = Math.random() > 0.1;
      var text = 'Пингуем ' + escAttr(host) + ' с 32 байт данных:\n' +
        'Ответ от ' + escAttr(host) + ': число байт=32 время=' + (10 + Math.floor(Math.random() * 40)) + 'мс TTL=64\n' +
        'Ответ от ' + escAttr(host) + ': число байт=32 время=' + (10 + Math.floor(Math.random() * 40)) + 'мс TTL=64\n' +
        'Ответ от ' + escAttr(host) + ': число байт=32 время=' + (10 + Math.floor(Math.random() * 40)) + 'мс TTL=64\n' +
        '\nСтатистика ' + escAttr(host) + ':\n' +
        '    Пакетов: отправлено = 3, получено = ' + (reachable ? 3 : 2) + ', потеряно = ' + (reachable ? 0 : 1) + '\n';
      log(s, 'system', 'ping ' + escAttr(host) + (reachable ? ' OK' : ' часть потерь'));
      return replyDone([], '', text);
    },
    export: function () {
      return this.exportText();
    }
  };

  /* --- /system/clock --- */
  HANDLERS['system/clock'] = {
    print: function (s) {
      return replyDone([itemOf({ 'time-zone-name': s.clock.timeZone })]);
    },
    set: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (a['time-zone-name']) s.clock.timeZone = a['time-zone-name'];
      log(s, 'system', 'часовой пояс установлен: ' + escAttr(s.clock.timeZone));
      return replyDone([]);
    }
  };

  /* --- /system/ntp/client --- */
  HANDLERS['system/ntp/client'] = {
    print: function (s) {
      return replyDone([itemOf({
        enabled: s.ntp.enabled ? 'yes' : 'no',
        'primary-ntp': s.ntp.primary || '',
        'secondary-ntp': s.ntp.secondary || ''
      })]);
    },
    set: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (a.enabled !== undefined) s.ntp.enabled = a.enabled === 'yes';
      if (a['primary-ntp']) s.ntp.primary = a['primary-ntp'];
      if (a['secondary-ntp']) s.ntp.secondary = a['secondary-ntp'];
      log(s, 'system', 'NTP-клиент ' + (s.ntp.enabled ? 'включён' : 'выключен'));
      return replyDone([]);
    }
  };

  /* --- /ip/cloud --- */
  HANDLERS['ip/cloud'] = {
    print: function (s) {
      return replyDone([itemOf({ 'ddns-enabled': s.cloud.enabled ? 'yes' : 'no' })]);
    },
    set: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (a['ddns-enabled'] !== undefined) s.cloud.enabled = a['ddns-enabled'] === 'yes';
      log(s, 'system', 'облачный доступ ' + (s.cloud.enabled ? 'включён' : 'выключен'));
      return replyDone([]);
    }
  };

  /* --- /ip/service --- */
  HANDLERS['ip/service'] = {
    print: function (s) {
      var services = [
        { name: 'api', disabled: s.services.api || false },
        { name: 'api-ssl', disabled: s.services.apiSsl || false },
        { name: 'ssh', disabled: s.services.ssh || false },
        { name: 'telnet', disabled: s.services.telnet || false },
        { name: 'www', disabled: s.services.www || false },
        { name: 'www-ssl', disabled: s.services.wwwSsl || false },
        { name: 'ftp', disabled: s.services.ftp || false }
      ];
      var items = services.map(function (svc) {
        return itemOf({ name: svc.name, disabled: svc.disabled ? 'yes' : 'no' });
      });
      return replyDone(items);
    },
    enable: function (s, attrs, conds, words) {
      return setService(s, attrs, conds, words, false);
    },
    disable: function (s, attrs, conds, words) {
      return setService(s, attrs, conds, words, true);
    }
  };

  function setService(s, attrs, conds, words, disabled) {
    var a = {};
    attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
    var name = a.name;
    if (!name) {
      // try find conditions
      if (conds && conds.length) {
        for (var i = 0; i < conds.length; i++) {
          if (conds[i].name === 'name') { name = conds[i].value; break; }
        }
      }
    }
    if (!name) return replyTrap('укажите name сервиса');
    var key = name === 'api-ssl' ? 'apiSsl' : name;
    s.services[key] = disabled;
    log(s, 'system', 'сервис ' + escAttr(name) + ' ' + (disabled ? 'отключён' : 'включён'));
    return replyDone([itemOf({ name: name, disabled: disabled ? 'yes' : 'no' })]);
  }

  /* --- /user --- */
  HANDLERS['user'] = {
    print: function (s) {
      var items = s.users.map(function (u) {
        return itemOf({ name: u.name, group: u.group || 'read', password: u.password || '' });
      });
      return replyDone(items);
    },
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.name) return replyTrap('укажите name');
      s.users.push({ name: a.name, group: a.group || 'read', password: a.password || '' });
      log(s, 'system', 'создан пользователь ' + escAttr(a.name));
      return replyDone([itemOf({ name: a.name })]);
    },
    set: function (s, attrs, conds, words) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      var name = a.name;
      if (!name && conds && conds.length) {
        for (var i = 0; i < conds.length; i++) {
          if (conds[i].name === 'name') { name = conds[i].value; break; }
        }
      }
      if (!name) return replyTrap('укажите name пользователя');
      var idx = s.users.findIndex(function (u) { return u.name === name; });
      if (idx < 0) return replyTrap('пользователь не найден: ' + escAttr(name));
      if (a.password) s.users[idx].password = a.password;
      if (a.group) s.users[idx].group = a.group;
      log(s, 'system', 'обновлён пользователь ' + escAttr(name));
      return replyDone([itemOf({ name: s.users[idx].name, group: s.users[idx].group })]);
    },
    remove: function (s, attrs, conds, words) {
      var name = null;
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (a.name) name = a.name;
      if (!name && conds && conds.length) {
        for (var i = 0; i < conds.length; i++) {
          if (conds[i].name === 'name') { name = conds[i].value; break; }
        }
      }
      if (!name) return replyTrap('укажите name пользователя');
      var idx = s.users.findIndex(function (u) { return u.name === name; });
      if (idx < 0) return replyTrap('пользователь не найден: ' + escAttr(name));
      s.users.splice(idx, 1);
      log(s, 'system', 'удалён пользователь ' + escAttr(name));
      return replyDone([]);
    }
  };

  /* --- /system/backup --- */
  HANDLERS['system/backup'] = {
    save: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      var name = a.name || 'backup';
      s.backups = s.backups || [];
      s.backups.push({ name: name + '.backup', time: new Date().toISOString() });
      log(s, 'system', 'создан бэкап ' + escAttr(name + '.backup'));
      return replyDone([itemOf({ name: name + '.backup' })]);
    },
    print: function (s) {
      var items = (s.backups || []).map(function (b) {
        return itemOf({ name: b.name, 'created-time': b.time });
      });
      return replyDone(items);
    }
  };

  /* --- /system/package/update --- */
  HANDLERS['system/package/update'] = {
    print: function (s) {
      return replyDone([itemOf({ version: '7.15', 'installed-version': '7.15' })]);
    },
    'check-for-updates': function (s) {
      log(s, 'system', 'проверка обновлений RouterOS');
      return replyDone([itemOf({ status: 'новая версия не найдена' })]);
    },
    install: function (s) {
      log(s, 'system', 'установка обновлений RouterOS');
      return replyDone([itemOf({ status: 'обновления не найдены' })]);
    }
  };

  /* --- /ip/dhcp-client --- */
  HANDLERS['ip/dhcp-client'] = {
    print: function (s) {
      var items = s.dhcpClients.map(function (c) {
        return itemOf({
          interface: c.interface,
          'add-default-route': c.addDefaultRoute ? 'yes' : 'no',
          disabled: c.disabled ? 'yes' : 'no',
          bound: c.bound ? 'yes' : 'no',
          address: c.address || '',
          gateway: c.gateway || ''
        });
      });
      return replyDone(items);
    },
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.interface) return replyTrap('укажите interface');
      s.dhcpClients.push({
        interface: a.interface,
        addDefaultRoute: a['add-default-route'] === 'yes',
        disabled: a.disabled === 'yes',
        bound: false,
        address: '',
        gateway: ''
      });
      log(s, 'dhcp', 'DHCP-клиент на ' + escAttr(a.interface));
      return replyDone([itemOf({ interface: a.interface })]);
    },
    set: function (s, attrs, conds, words) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      var iface = a.interface;
      if (!iface && conds && conds.length) {
        for (var i = 0; i < conds.length; i++) { if (conds[i].name === 'interface') { iface = conds[i].value; break; } }
      }
      if (!iface) return replyTrap('укажите interface');
      var idx = s.dhcpClients.findIndex(function (c) { return c.interface === iface; });
      if (idx < 0) return replyTrap('DHCP-клиент не найден: ' + escAttr(iface));
      if (a['add-default-route'] !== undefined) s.dhcpClients[idx].addDefaultRoute = a['add-default-route'] === 'yes';
      if (a.disabled !== undefined) s.dhcpClients[idx].disabled = a.disabled === 'yes';
      return replyDone([itemOf({ interface: s.dhcpClients[idx].interface })]);
    },
    remove: function (s, attrs, conds, words) {
      var iface = null;
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (a.interface) iface = a.interface;
      if (!iface && conds && conds.length) {
        for (var i = 0; i < conds.length; i++) { if (conds[i].name === 'interface') { iface = conds[i].value; break; } }
      }
      if (!iface) return replyTrap('укажите interface');
      var idx = s.dhcpClients.findIndex(function (c) { return c.interface === iface; });
      if (idx < 0) return replyTrap('DHCP-клиент не найден: ' + escAttr(iface));
      s.dhcpClients.splice(idx, 1);
      return replyDone([]);
    }
  };

  /* --- /ip/firewall/service-port --- */
  HANDLERS['ip/firewall/service-port'] = {
    print: function (s) {
      var items = (s.servicePorts || []).map(function (sp) {
        return itemOf({ name: sp.name, port: sp.port || '', protocol: sp.protocol || '' });
      });
      return replyDone(items);
    },
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.name) return replyTrap('укажите name');
      s.servicePorts = s.servicePorts || [];
      s.servicePorts.push({ name: a.name, port: a.port || '', protocol: a.protocol || '' });
      log(s, 'firewall', 'service-port ' + escAttr(a.name));
      return replyDone([itemOf({ name: a.name })]);
    },
    remove: function (s, attrs, conds, words) {
      var name = null;
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (a.name) name = a.name;
      if (!name && conds && conds.length) {
        for (var i = 0; i < conds.length; i++) { if (conds[i].name === 'name') { name = conds[i].value; break; } }
      }
      if (!name) return replyTrap('укажите name');
      if (!s.servicePorts) return replyDone([]);
      var idx = s.servicePorts.findIndex(function (sp) { return sp.name === name; });
      if (idx < 0) return replyTrap('service-port не найден: ' + escAttr(name));
      s.servicePorts.splice(idx, 1);
      return replyDone([]);
    }
  };

  /* --- /tool/graphing --- */
  HANDLERS['tool/graphing'] = {
    print: function (s) {
      var items = (s.graphing || []).map(function (g) {
        return itemOf({ name: g.name, interface: g.interface || '', 'store-every': g.storeEvery || '5m' });
      });
      return replyDone(items);
    }
  };

  /* --- /tool/graphing/queue --- */
  HANDLERS['tool/graphing/queue'] = {
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.name) return replyTrap('укажите name');
      s.graphing = s.graphing || [];
      s.graphing.push({ name: a.name, interface: a.interface || '', storeEvery: a['store-every'] || '5m' });
      log(s, 'system', 'график ' + escAttr(a.name));
      return replyDone([itemOf({ name: a.name })]);
    }
  };

  /* --- /system/scheduler --- */
  HANDLERS['system/scheduler'] = {
    print: function (s) {
      var items = (s.scheduler || []).map(function (t) {
        return itemOf({ name: t.name, 'start-time': t.startTime || 'startup', interval: t.interval || '', disabled: t.disabled ? 'yes' : 'no' });
      });
      return replyDone(items);
    },
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.name) return replyTrap('укажите name');
      s.scheduler = s.scheduler || [];
      s.scheduler.push({ name: a.name, startTime: a['start-time'] || 'startup', interval: a.interval || '', disabled: a.disabled === 'yes' });
      log(s, 'system', 'планировщик ' + escAttr(a.name));
      return replyDone([itemOf({ name: a.name })]);
    },
    set: function (s, attrs, conds, words) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      var name = a.name;
      if (!name && conds && conds.length) {
        for (var i = 0; i < conds.length; i++) { if (conds[i].name === 'name') { name = conds[i].value; break; } }
      }
      if (!name) return replyTrap('укажите name');
      var idx = (s.scheduler || []).findIndex(function (t) { return t.name === name; });
      if (idx < 0) return replyTrap('задача не найдена: ' + escAttr(name));
      if (a.disabled !== undefined) s.scheduler[idx].disabled = a.disabled === 'yes';
      if (a.interval) s.scheduler[idx].interval = a.interval;
      return replyDone([itemOf({ name: s.scheduler[idx].name })]);
    },
    remove: function (s, attrs, conds, words) {
      var name = null;
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (a.name) name = a.name;
      if (!name && conds && conds.length) {
        for (var i = 0; i < conds.length; i++) { if (conds[i].name === 'name') { name = conds[i].value; break; } }
      }
      if (!name) return replyTrap('укажите name');
      if (!s.scheduler) return replyDone([]);
      var idx = s.scheduler.findIndex(function (t) { return t.name === name; });
      if (idx < 0) return replyTrap('задача не найдена: ' + escAttr(name));
      s.scheduler.splice(idx, 1);
      return replyDone([]);
    }
  };

  /* --- /tool/mac-server --- */
  HANDLERS['tool/mac-server'] = {
    print: function (s) {
      return replyDone([itemOf({ enabled: s.macServerEnabled ? 'yes' : 'no' })]);
    },
    set: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (a.enabled !== undefined) s.macServerEnabled = a.enabled === 'yes';
      log(s, 'system', 'MAC-сервер ' + (s.macServerEnabled ? 'включён' : 'выключен'));
      return replyDone([]);
    }
  };

  /* --- /ip/arp --- */
  HANDLERS['ip/arp'] = {
    print: function (s) {
      var items = (s.arp || []).map(function (a) {
        return itemOf({ address: a.address, 'mac-address': a.mac, interface: a.interface || '', 'published': a.published ? 'yes' : 'no' });
      });
      return replyDone(items);
    },
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.address) return replyTrap('укажите address');
      if (!a['mac-address']) return replyTrap('укажите mac-address');
      s.arp = s.arp || [];
      s.arp.push({ address: a.address, mac: a['mac-address'], interface: a.interface || '', published: a.published === 'yes' });
      log(s, 'arp', 'ARP запись ' + escAttr(a.address));
      return replyDone([itemOf({ address: a.address })]);
    },
    remove: function (s, attrs, conds, words) {
      var address = null;
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (a.address) address = a.address;
      if (!address && conds && conds.length) {
        for (var i = 0; i < conds.length; i++) { if (conds[i].name === 'address') { address = conds[i].value; break; } }
      }
      if (!address) return replyTrap('укажите address');
      if (!s.arp) return replyDone([]);
      var idx = s.arp.findIndex(function (ar) { return ar.address === address; });
      if (idx < 0) return replyTrap('ARP запись не найдена: ' + escAttr(address));
      s.arp.splice(idx, 1);
      return replyDone([]);
    }
  };

  /* --- /ip/firewall/mangle --- */
  HANDLERS['ip/firewall/mangle'] = {
    print: function (s) {
      var items = (s.mangle || []).map(function (m) {
        return itemOf({ chain: m.chain, action: m.action, 'new-routing-mark': m.routingMark || '', 'new-connection-mark': m.connMark || '', comment: m.comment || '' });
      });
      return replyDone(items);
    },
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a.chain) return replyTrap('укажите chain');
      if (!a.action) return replyTrap('укажите action');
      s.mangle = s.mangle || [];
      s.mangle.push({ chain: a.chain, action: a.action, routingMark: a['new-routing-mark'] || '', connMark: a['new-connection-mark'] || '', comment: a.comment || '' });
      log(s, 'firewall', 'mangle правило ' + escAttr(a.chain) + '/' + escAttr(a.action));
      return replyDone([itemOf({ chain: a.chain, action: a.action })]);
    },
    remove: function (s, attrs, conds, words) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      var chain = a.chain;
      var action = a.action;
      if (!chain && conds && conds.length) {
        for (var i = 0; i < conds.length; i++) { if (conds[i].name === 'chain') { chain = conds[i].value; break; } }
      }
      if (!chain) return replyTrap('укажите chain');
      if (!s.mangle) return replyDone([]);
      var idx = s.mangle.findIndex(function (m) { return m.chain === chain && (!action || m.action === action); });
      if (idx < 0) return replyTrap('mangle правило не найдено');
      s.mangle.splice(idx, 1);
      return replyDone([]);
    }
  };

  /* --- /ip/dhcp-server/lease --- */
  HANDLERS['ip/dhcp-server/lease'] = {
    print: function (s) {
      var items = (s.dhcpLeases || []).map(function (l) {
        return itemOf({ 'mac-address': l.mac, address: l.address, 'server': l.server || '', 'status': l.status || 'bound', 'expires-after': l.expires || '' });
      });
      return replyDone(items);
    },
    add: function (s, attrs) {
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (!a['mac-address']) return replyTrap('укажите mac-address');
      if (!a.address) return replyTrap('укажите address');
      s.dhcpLeases = s.dhcpLeases || [];
      s.dhcpLeases.push({ mac: a['mac-address'], address: a.address, server: a.server || 'dhcp-lan', status: 'bound', expires: '3d' });
      log(s, 'dhcp', 'аренда DHCP ' + escAttr(a.address));
      return replyDone([itemOf({ address: a.address })]);
    },
    remove: function (s, attrs, conds, words) {
      var address = null;
      var a = {};
      attrs.forEach(function (w) { var eq = w.indexOf('=', 1); if (eq > 0) a[w.slice(1, eq)] = w.slice(eq + 1); });
      if (a.address) address = a.address;
      if (!address && conds && conds.length) {
        for (var i = 0; i < conds.length; i++) { if (conds[i].name === 'address') { address = conds[i].value; break; } }
      }
      if (!address) return replyTrap('укажите address');
      if (!s.dhcpLeases) return replyDone([]);
      var idx = s.dhcpLeases.findIndex(function (l) { return l.address === address; });
      if (idx < 0) return replyTrap('аренда не найдена: ' + escAttr(address));
      s.dhcpLeases.splice(idx, 1);
      return replyDone([]);
    }
  };

  global.VirtualRouter = VirtualRouter;
  if (typeof module !== 'undefined' && module.exports) module.exports = VirtualRouter;
})(this);
