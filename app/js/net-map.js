/* =====================================================================
   Интерактивная карта сети (сеть Микротик + оборудование).
   Рендерит SVG-схему: роутер, коммутатор, ПК, сервер, принтер, линии связи.
   Клик на устройство — выбирает его для конфигурирования.
   =================================================================== */
(function (global) {
  'use strict';

  var mapEl = null;
  var svgEl = null;
  var onDeviceSelect = null;
  var selectedDeviceId = null;

  /* ---------- устройства сети ---------- */
  var DEVICES = [
    { id: 'router', kind: 'router', name: 'MikroTik RouterOS', x: 450, y: 90, icon: 'R', color: '#0ea5e9', label: 'Роутер MikroTik' },
    { id: 'switch', kind: 'switch', name: 'Коммутатор', x: 150, y: 90, icon: 'S', color: '#6366f1', label: 'Коммутатор' },
    { id: 'pc1', kind: 'pc', name: 'ПК 1', x: 100, y: 260, icon: 'C', color: '#84cc16', label: 'Компьютер 1' },
    { id: 'pc2', kind: 'pc', name: 'ПК 2', x: 300, y: 260, icon: 'C', color: '#84cc16', label: 'Компьютер 2' },
    { id: 'server', kind: 'server', name: 'Сервер', x: 450, y: 260, icon: 'S', color: '#a855f7', label: 'Сервер' },
    { id: 'printer', kind: 'printer', name: 'Принтер', x: 650, y: 260, icon: 'P', color: '#f59e0b', label: 'Принтер' },
    { id: 'wifi-ap', kind: 'wifi-ap', name: 'Wi-Fi точка доступа', x: 650, y: 90, icon: 'W', color: '#06b6d4', label: 'Wi-Fi точка доступа' },
    { id: 'phone', kind: 'phone', name: 'IP-телефон', x: 740, y: 260, icon: 'T', color: '#ef4444', label: 'IP-телефон' }
  ];

  var LINKS = [
    { from: 'router', to: 'switch' },
    { from: 'switch', to: 'pc1' },
    { from: 'switch', to: 'pc2' },
    { from: 'switch', to: 'server' },
    { from: 'switch', to: 'printer' },
    { from: 'switch', to: 'wifi-ap' },
    { from: 'wifi-ap', to: 'phone' }
  ];

  /* ---------- инициализация ---------- */
  function init(containerId, cb) {
    mapEl = document.getElementById(containerId);
    if (!mapEl) { console.error('NetMap: контейнер #' + containerId + ' не найден'); return false; }
    onDeviceSelect = cb || null;
    selectedDeviceId = null;

    mapEl.innerHTML = '';
    svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('height', '360');
    svgEl.setAttribute('viewBox', '0 0 850 360');
    svgEl.setAttribute('class', 'net-map-svg');
    svgEl.style.display = 'block';
    mapEl.appendChild(svgEl);

    try {
      drawLinks();
      drawDevices();
      console.log('NetMap: инициализировано, устройств:', DEVICES.length);
    } catch (e) {
      console.error('NetMap: ошибка отрисовки', e);
      mapEl.innerHTML = '<div style="padding:20px;color:#dc2626">Ошибка отрисовки карты: ' + e.message + '</div>';
    }
    return true;
  }

  /* ---------- линии связи ---------- */
  function drawLinks() {
    LINKS.forEach(function (l) {
      var a = findDev(l.from);
      var b = findDev(l.to);
      if (!a || !b) return;
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(a.x + 30));
      line.setAttribute('y1', String(a.y + 30));
      line.setAttribute('x2', String(b.x + 30));
      line.setAttribute('y2', String(b.y + 30));
      line.setAttribute('stroke', '#94a3b8');
      line.setAttribute('stroke-width', '4');
      line.setAttribute('stroke-dasharray', '8 6');
      line.setAttribute('stroke-linecap', 'round');
      svgEl.appendChild(line);
    });
  }

  /* ---------- устройства ---------- */
  function drawDevices() {
    DEVICES.forEach(function (d) {
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'net-device');
      g.setAttribute('data-id', d.id);
      g.setAttribute('data-kind', d.kind);
      g.setAttribute('transform', 'translate(' + d.x + ',' + d.y + ')');
      g.style.cursor = 'pointer';

      // тень
      var shadow = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      shadow.setAttribute('x', '4'); shadow.setAttribute('y', '4');
      shadow.setAttribute('width', '60'); shadow.setAttribute('height', '60');
      shadow.setAttribute('rx', '10'); shadow.setAttribute('fill', '#000000');
      shadow.setAttribute('opacity', '0.15');
      g.appendChild(shadow);

      // фон устройства
      var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '0'); rect.setAttribute('y', '0');
      rect.setAttribute('width', '60'); rect.setAttribute('height', '60');
      rect.setAttribute('rx', '10'); rect.setAttribute('fill', '#ffffff');
      rect.setAttribute('stroke', d.color); rect.setAttribute('stroke-width', '3');
      g.appendChild(rect);

      // иконка (буква)
      var icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      icon.setAttribute('x', '30'); icon.setAttribute('y', '34');
      icon.setAttribute('text-anchor', 'middle');
      icon.setAttribute('font-size', '22'); icon.setAttribute('font-weight', 'bold');
      icon.setAttribute('fill', d.color); icon.setAttribute('font-family', 'Arial, sans-serif');
      icon.textContent = d.icon;
      g.appendChild(icon);

      // имя
      var name = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      name.setAttribute('x', '30'); name.setAttribute('y', '58');
      name.setAttribute('text-anchor', 'middle');
      name.setAttribute('font-size', '10'); name.setAttribute('fill', '#33415a');
      name.setAttribute('font-weight', '600'); name.setAttribute('font-family', 'Arial, sans-serif');
      name.textContent = d.name;
      g.appendChild(name);

      // статус
      var status = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      status.setAttribute('cx', '52'); status.setAttribute('cy', '8');
      status.setAttribute('r', '7'); status.setAttribute('fill', '#22c55e');
      status.setAttribute('stroke', '#ffffff'); status.setAttribute('stroke-width', '2');
      g.appendChild(status);

      g.addEventListener('click', function (e) {
        e.stopPropagation();
        selectDevice(d.id, d.kind, d.name);
      });
      svgEl.appendChild(g);
    });
  }

  function findDev(id) {
    for (var i = 0; i < DEVICES.length; i++) {
      if (DEVICES[i].id === id) return DEVICES[i];
    }
    return null;
  }

  /* ---------- выбор устройства ---------- */
  function selectDevice(id, kind, name) {
    selectedDeviceId = id;
    var groups = svgEl.querySelectorAll('.net-device');
    groups.forEach(function (g) {
      var rect = g.querySelector('rect');
      if (g.getAttribute('data-id') === id) {
        rect.setAttribute('stroke-width', '6');
        rect.setAttribute('stroke', '#f59e0b');
      } else {
        rect.setAttribute('stroke-width', '3');
      }
    });

    if (onDeviceSelect) onDeviceSelect(id, kind, name);
  }

  /* ---------- применить конфигурацию с карты на виртуальный роутер ---------- */
  function applyMapConfig(vr) {
    if (!vr || !vr.execute) return Promise.reject(new Error('виртуальный роутер не инициализирован'));

    var commands = [
      '/system identity set name="MikroTik-Router"',
      '/interface ethernet set [ find default-name=ether1 ] name=WAN disabled=no',
      '/interface ethernet set [ find default-name=ether2 ] name=LAN disabled=no',
      '/interface ethernet set [ find default-name=ether3 ] name=SERVER disabled=no',
      '/interface bridge add name=bridge-lan',
      '/interface bridge port add bridge=bridge-lan interface=LAN',
      '/interface bridge port add bridge=bridge-lan interface=ether3',
      '/ip address add address=192.168.88.1/24 interface=bridge-lan',
      '/ip pool add name=pool-lan ranges=192.168.88.10-192.168.88.250',
      '/ip dhcp-server add name=dhcp-lan interface=bridge-lan address-pool=pool-lan disabled=no',
      '/ip dhcp-server network add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=77.88.8.8',
      '/ip firewall filter add chain=input in-interface=WAN action=drop',
      '/ip firewall filter add chain=input in-interface=bridge-lan action=accept',
      '/ip firewall nat add chain=srcnat out-interface=WAN action=masquerade',
      '/ip route add dst-address=0.0.0.0/0 gateway=WAN distance=1 check-gateway=ping',
      '/system ntp client set enabled=yes primary-ntp=77.88.8.8 secondary-ntp=8.8.4.4',
      '/ip cloud set ddns-enabled=yes'
    ];

    var results = [];
    return commands.reduce(function (promise, cmd) {
      return promise.then(function () {
        return vr.execute(cmd.split(/\s+/));
      }).then(function (rep) {
        results.push({ cmd: cmd, status: rep.status, text: rep.text || '' });
      });
    }, Promise.resolve()).then(function () { return results; });
  }

  global.NetMap = { init: init, selectDevice: selectDevice, applyMapConfig: applyMapConfig, DEVICES: DEVICES };
})(this);
