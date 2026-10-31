/* =====================================================================
   Интерактивная карта сети (сеть Микротик + оборудование).
   Рендерит SVG-схему: роутер, коммутатор, ПК, сервер, принтер, линии связи.
   Клик на устройство — открывает его конфигурацию в виртуальном роутере.
   =================================================================== */
(function (global) {
  'use strict';

  var MAP_ID = 'net-map';
  var mapEl = null;
  var svgEl = null;
  var onDeviceSelect = null; // callback(id, kind, name)

  /* ---------- устройства сети ---------- */
  var DEVICES = [
    { id: 'router', kind: 'router', name: 'MikroTik RouterOS', x: 500, y: 140, icon: '🖥️', color: '#0ea5e9' },
    { id: 'switch', kind: 'switch', name: 'Коммутатор', x: 200, y: 140, icon: '🔌', color: '#6366f1' },
    { id: 'pc1', kind: 'pc', name: 'ПК 1', x: 100, y: 280, icon: '💻', color: '#84cc16' },
    { id: 'pc2', kind: 'pc', name: 'ПК 2', x: 300, y: 280, icon: '💻', color: '#84cc16' },
    { id: 'server', kind: 'server', name: 'Сервер', x: 500, y: 280, icon: '⚙️', color: '#a855f7' },
    { id: 'printer', kind: 'printer', name: 'Принтер', x: 700, y: 280, icon: '🖨️', color: '#f59e0b' }
  ];

  var LINKS = [
    { from: 'router', to: 'switch' },
    { from: 'switch', to: 'pc1' },
    { from: 'switch', to: 'pc2' },
    { from: 'switch', to: 'server' },
    { from: 'switch', to: 'printer' }
  ];

  /* ---------- инициализация ---------- */
  function init(containerId, cb) {
    mapEl = document.getElementById(containerId);
    if (!mapEl) return false;
    onDeviceSelect = cb || null;

    mapEl.innerHTML = '';
    svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('height', '420');
    svgEl.setAttribute('viewBox', '0 0 900 420');
    svgEl.setAttribute('class', 'net-map-svg');
    mapEl.appendChild(svgEl);

    drawLinks();
    drawDevices();
    return true;
  }

  /* ---------- линии связи ---------- */
  function drawLinks() {
    LINKS.forEach(function (l) {
      var a = findDev(l.from);
      var b = findDev(l.to);
      if (!a || !b) return;
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', a.x + 40);
      line.setAttribute('y1', a.y + 40);
      line.setAttribute('x2', b.x + 40);
      line.setAttribute('y2', b.y + 40);
      line.setAttribute('stroke', '#64748b');
      line.setAttribute('stroke-width', '3');
      line.setAttribute('stroke-dasharray', '6 4');
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

      // фон устройства
      var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '0');
      rect.setAttribute('y', '0');
      rect.setAttribute('width', '80');
      rect.setAttribute('height', '80');
      rect.setAttribute('rx', '12');
      rect.setAttribute('fill', '#ffffff');
      rect.setAttribute('stroke', d.color);
      rect.setAttribute('stroke-width', '3');
      g.appendChild(rect);

      // иконка
      var icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      icon.setAttribute('x', '40');
      icon.setAttribute('y', '42');
      icon.setAttribute('text-anchor', 'middle');
      icon.setAttribute('font-size', '32');
      icon.textContent = d.icon;
      g.appendChild(icon);

      // имя
      var name = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      name.setAttribute('x', '40');
      name.setAttribute('y', '72');
      name.setAttribute('text-anchor', 'middle');
      name.setAttribute('font-size', '11');
      name.setAttribute('fill', '#33415a');
      name.setAttribute('font-weight', '600');
      name.textContent = d.name;
      g.appendChild(name);

      // статус (подготовлено к подсветке)
      var status = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      status.setAttribute('cx', '70');
      status.setAttribute('cy', '12');
      status.setAttribute('r', '8');
      status.setAttribute('fill', '#22c55e');
      status.setAttribute('stroke', '#ffffff');
      status.setAttribute('stroke-width', '2');
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
    // подсветка
    var groups = svgEl.querySelectorAll('.net-device');
    groups.forEach(function (g) {
      var rect = g.querySelector('rect');
      if (g.getAttribute('data-id') === id) {
        rect.setAttribute('stroke-width', '5');
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
