#!/usr/bin/env node
/* Генератор SVG-скриншотов окон WinBox для учебника.
   Запуск: node tools/gen-screens.js  (файлы → app/assets/img/) */
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'app', 'assets', 'img');
fs.mkdirSync(OUT, { recursive: true });

const FONT = "font-family='Segoe UI, Tahoma, sans-serif'";
const MONO = "font-family='Consolas, monospace'";

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function txt(x, y, s, o = {}) {
  const size = o.size || 12;
  const fill = o.fill || '#1b2430';
  const anchor = o.anchor ? ` text-anchor="${o.anchor}"` : '';
  const weight = o.bold ? " font-weight='600'" : '';
  const font = o.mono ? MONO : FONT;
  const extra = o.color ? ` fill="${o.fill || '#1b2430'}"` : '';
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${o.fill || fill}"${anchor}${weight} ${font}${o.extra || ''}>${esc(s)}</text>`;
}
function rect(x, y, w, h, fill, o = {}) {
  const stroke = o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : '';
  const rx = o.rx != null ? ` rx="${o.rx}"` : '';
  const extra = o.extra || '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${rx}${stroke}${extra}/>`;
}

/* Окно WinBox */
function win(title, w, h, body, o = {}) {
  const menuW = o.menu ? 148 : 0;
  const tbH = 30; // title bar
  const toolH = o.toolbar ? 26 : 0;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  s += rect(0, 0, w, h, '#8a95a3', { rx: 0 });
  s += rect(1, 1, w - 2, h - 2, '#eceff3', { stroke: '#5c6673' });
  // title bar
  s += rect(2, 2, w - 4, tbH, o.titleFill || '#2f6fb5');
  s += txt(12, 21, title, { fill: '#ffffff', size: 13, bold: true });
  // window buttons
  s += txt(w - 54, 21, '—', { fill: '#dce9f7', size: 13, anchor: 'middle' });
  s += txt(w - 34, 21, '□', { fill: '#dce9f7', size: 12, anchor: 'middle' });
  s += txt(w - 15, 21, '✕', { fill: '#dce9f7', size: 12, anchor: 'middle' });
  let y = 2 + tbH;
  if (o.toolbar) {
    s += rect(2, y, w - 4, toolH, '#dfe5ec');
    let x = 12;
    for (const t of o.toolbar) {
      s += txt(x, y + 17, t, { size: 12, fill: '#2b3a4d' });
      x += t.length * 7.4 + 18;
    }
    y += toolH;
    s += `<line x1="2" y1="${y}" x2="${w - 2}" y2="${y}" stroke="#b9c2cd"/>`;
  }
  // menu
  if (o.menu) {
    s += rect(3, y, menuW, h - y - 3, '#f5f7fa');
    s += `<line x1="${menuW + 3}" y1="${y}" x2="${menuW + 3}" y2="${h - 3}" stroke="#c4ccd6"/>`;
    let my = y + 14;
    for (let i = 0; i < o.menu.length; i++) {
      const it = o.menu[i];
      const active = o.active != null && i === o.active;
      if (active) s += rect(6, my - 11, menuW - 8, 17, '#cfe3f6', { rx: 3 });
      if (it.sep) { s += `<line x1="8" y1="${my - 5}" x2="${menuW - 4}" y2="${my - 5}" stroke="#d5dbe3"/>`; my += 10; continue; }
      s += txt(14, my, it.t || it, { size: 11.5, fill: active ? '#0b4f8a' : '#33415a', bold: !!active });
      my += it.gap || 19;
    }
    s += `<g>${body}</g>`.replace('<g>', `<g transform="translate(${menuW},0)">`);
  } else {
    s += body;
  }
  s += '</svg>';
  return s;
}

/* Таблица */
function table(x, y, w, headers, rows, o = {}) {
  const rowH = o.rowH || 20;
  const headH = 22;
  const cols = o.cols || headers.map((_, i) => w / headers.length);
  let xs = [x];
  for (const c of cols) xs.push(xs[xs.length - 1] + c);
  let s = rect(x, y, w, headH, '#dbe3ec', { stroke: '#a9b4c2' });
  headers.forEach((hd, i) => s += txt(xs[i] + 6, y + 15, hd, { size: 11.5, bold: true, fill: '#25324a' }));
  rows.forEach((r, ri) => {
    const ry = y + headH + ri * rowH;
    const sel = o.selected === ri;
    s += rect(x, ry, w, rowH, sel ? '#cde4f8' : (ri % 2 ? '#f3f6fa' : '#ffffff'), { stroke: '#d7dde5' });
    r.forEach((c, ci) => {
      let fill = '#1b2430', bold = false;
      if (typeof c === 'object' && c !== null) {
        fill = c.fill || fill; bold = !!c.bold; c = c.t;
      }
      if (ci === 0 && o.flagA && c === 'A') { fill = '#0f8a3d'; bold = true; }
      s += txt(xs[ci] + 6, ry + 14, c, { size: 11.5, fill, bold, mono: o.monoCols ? o.monoCols.includes(ci) : false });
    });
  });
  // frame
  const total = headH + rows.length * rowH;
  s += rect(x, y, w, total, 'none', { stroke: '#a9b4c2' });
  return { s, bottom: y + total };
}

/* Поле диалога */
function field(x, y, label, value, o = {}) {
  const lw = o.lw || 130;
  const vw = o.vw || 220;
  let s = txt(x, y + 13, label, { size: 12, fill: '#26344a' });
  if (o.check) {
    s += rect(x + lw, y + 1, 13, 13, '#ffffff', { stroke: '#7b8794', rx: 2 });
    if (o.checkOn) s += `<path d="M${x + lw + 3} ${y + 7.5} l3 3 l5.5 -7" stroke="#0b6fd3" stroke-width="2" fill="none"/>`;
    s += txt(x + lw + 20, y + 13, value, { size: 12, fill: '#1b2430' });
    return s;
  }
  s += rect(x + lw, y, vw, 20, '#ffffff', { stroke: '#8d99a8', rx: 2 });
  s += txt(x + lw + 6, y + 14, value, { size: 12, mono: true, fill: o.muted ? '#8a93a3' : '#101820' });
  if (o.select) s += txt(x + lw + vw - 16, y + 14, '▼', { size: 9, fill: '#46536b' });
  if (o.pw) {
    const len = Math.min(12, String(value).length);
    s = s.replace(esc(value), '•'.repeat(Math.max(6, len)));
  }
  return s;
}
function buttons(x, y, labels, o = {}) {
  let s = '';
  let cx = x;
  for (const b of labels) {
    const w = b.w || (b.t.length * 7 + 26);
    const primary = b.primary;
    s += rect(cx, y, w, 24, primary ? '#2f6fb5' : '#e8ecf1', { stroke: primary ? '#245a95' : '#9aa5b3', rx: 4 });
    s += txt(cx + w / 2, y + 16, b.t, { size: 12, anchor: 'middle', fill: primary ? '#fff' : '#1b2430', bold: !!primary });
    cx += w + 8;
  }
  return s;
}
function caption(x, y, s_, o = {}) { return txt(x, y, s_, { size: 11, fill: o.fill || '#5a6678', mono: o.mono !== false }); }

/* ---------- сцены ---------- */
const scenes = {};

/* 1. Топология */
scenes['topology.svg'] = (() => {
  const w = 760, h = 380;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  s += rect(0, 0, w, h, '#f7fafc');
  s += txt(20, 30, 'Типовая топология: два провайдера, LAN и гостевая сеть', { size: 15, bold: true });
  const box = (x, y, bw, bh, title, lines, color) => {
    let b = rect(x, y, bw, bh, '#ffffff', { stroke: color, sw: 2, rx: 10 });
    b += rect(x, y, bw, 26, color, { rx: 10 });
    b += rect(x, y + 16, bw, 10, color);
    b += txt(x + bw / 2, y + 18, title, { size: 13, bold: true, fill: '#fff', anchor: 'middle' });
    lines.forEach((l, i) => b += txt(x + bw / 2, y + 46 + i * 17, l, { size: 11.5, anchor: 'middle', fill: '#334155' }));
    return b;
  };
  const arrow = (x1, y1, x2, y2, label) => {
    let a = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#64748b" stroke-width="2.5" marker-end="url(#ar)"/>`;
    if (label) a += txt((x1 + x2) / 2 + (y1 === y2 ? 0 : 14), (y1 + y2) / 2 - 8, label, { size: 10.5, fill: '#64748b', anchor: 'middle' });
    return a;
  };
  s += `<defs><marker id="ar" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#64748b"/></marker></defs>`;
  s += box(30, 60, 170, 84, 'Провайдер А', ['PPPoE / DHCP', 'основной канал'], '#2f6fb5');
  s += box(30, 170, 170, 84, 'Провайдер Б', ['резервный канал', 'авто-переключение'], '#7c3aed');
  s += box(300, 90, 190, 170, 'MikroTik RouterOS', ['firewall + NAT', 'failover (distance)', 'Wi-Fi · DHCP · VPN', ''], '#0f766e');
  s += box(600, 60, 140, 74, 'LAN', ['192.168.88.0/24', 'рабочие ПК'], '#2f6fb5');
  s += box(600, 160, 140, 74, 'Гости', ['192.168.99.0/24', 'только интернет'], '#b45309');
  s += box(600, 260, 140, 74, 'VPN', ['10.10.10.0/24', 'удалённые клиенты'], '#0e7490');
  s += arrow(200, 102, 300, 130, 'ether1');
  s += arrow(200, 212, 300, 180, 'ether2');
  s += arrow(490, 130, 600, 97, 'bridge-lan');
  s += arrow(490, 175, 600, 197, 'bridge-guest');
  s += arrow(490, 220, 600, 292, 'wg0');
  s += txt(300, 310, 'Гостевой сегмент изолирован от LAN правилами firewall', { size: 11.5, fill: '#64748b' });
  s += txt(300, 330, 'Публикация серверов — dstnat по нужному провайдеру', { size: 11.5, fill: '#64748b' });
  s += txt(300, 350, 'Проверка каналов — check-gateway=ping + netwatch', { size: 11.5, fill: '#64748b' });
  s += '</svg>';
  return s;
})();

/* 2. WinBox логин */
scenes['winbox-login.svg'] = (() => {
  const w = 560, h = 300;
  let body = '';
  body += field(30, 60, 'Connect To:', '4C:5E:0C:AA:BB:CC', { lw: 110, vw: 330 });
  body += field(30, 95, 'Login:', 'admin', { lw: 110, vw: 330 });
  body += field(30, 130, 'Password:', '', { lw: 110, vw: 330, pw: true });
  body += field(30, 168, '', 'Session: keepalive', { check: true, checkOn: true, lw: 0 });
  body += field(30, 192, '', 'Try WinBox For MikroTik (TLS)', { check: true, checkOn: false, lw: 0 });
  body += buttons(30, 235, [{ t: 'Connect', primary: true, w: 100 }, { t: 'Cancel', w: 84 }, { t: 'Help', w: 70 }, { t: 'Settings', w: 90 }, { t: 'Install Key', w: 100 }]);
  body += caption(30, 280, 'WinBox 4.x · Neighbors → MAC роутера → Connect');
  return win('MikroTik WinBox', w, h, body, { toolbar: ['WinBox', 'Neighbors', 'Managed'] });
})();

/* 3. Интерфейсы */
scenes['winbox-interfaces.svg'] = {
  menu: ['Interfaces', 'Bridge', 'Wireless', 'IP', 'Firewall', 'Queues', 'System', 'Tools', 'New Terminal'],
  active: 0,
  toolbar: ['＋', '✕', '↑', '↓', '⟳'],
  build() {
    let body = txt(170, 24, 'Interface List', { size: 12, bold: true, fill: '#25324a' });
    const t = table(162, 34, 570,
      ['#', 'Name', 'Type', 'Actual Tx', 'R', 'S', 'Comment'],
      [
        ['1', 'ether1', 'ether', '0 bps', 'R', 'S', 'WAN: провайдер А'],
        ['2', 'ether-wan2', 'ether', '1.2 Mbps', 'R', 'S', 'WAN: провайдер Б'],
        ['3', 'ether3', 'ether', '0 bps', 'R', '', 'LAN'],
        ['4', 'ether4', 'ether', '0 bps', 'R', '', 'LAN'],
        ['5', 'bridge-lan', 'bridge', '3.4 Mbps', 'R', '', 'Локальная сеть'],
        ['6', 'bridge-guest', 'bridge', '812 kbps', 'R', '', 'Гостевая сеть'],
        ['7', 'pppoe-out1', 'pppoe-out', '5.1 Mbps', 'R', 'S', 'OSНОВНОЙ' ],
        ['8', 'wg0', 'wireguard', '96 kbps', 'R', '', 'VPN'],
        ['9', 'lte1', 'lte', '0 bps', 'R', '', 'USB LTE (резерв)'],
      ],
      { cols: [34, 110, 90, 90, 26, 26, 174], monoCols: [1, 2], selected: 6, flagA: false });
    body += t.s;
    body += caption(170, t.bottom + 16, 'R = running · S = slave/выключен по ссылке · Double-click → свойства');
    return win('Interface List', 748, t.bottom + 60, body, { menu: this.menu, active: this.active, toolbar: this.toolbar });
  }
};

/* 4. PPPoE client dialog */
scenes['pppoe-client.svg'] = {
  build() {
    let b = '';
    b += rect(24, 18, 700, 30, '#e6ebf1', { rx: 4, stroke: '#c3ccd7' });
    ['General', 'Dialing', 'Status', 'Status Details'].forEach((t, i) => {
      b += txt(44 + i * 110, 38, t, { size: 12, bold: i === 0, fill: i === 0 ? '#0b4f8a' : '#46536b' });
    });
    b += `<line x1="40" y1="48" x2="140" y2="48" stroke="#0b4f8a" stroke-width="2.5"/>`;
    b += field(40, 70, 'Name:', 'pppoe-out1');
    b += field(40, 102, 'Interface:', 'ether1', { select: true });
    b += field(40, 134, 'Service:', '(любой)', { muted: true });
    b += field(40, 166, 'User:', 'user@by.provider');
    b += field(40, 198, 'Password:', 'secretpass', { pw: true });
    b += field(40, 232, '', 'Add Default Route', { check: true, checkOn: false, lw: 0 });
    b += field(40, 256, '', 'Use Peer DNS = yes', { check: true, checkOn: true, lw: 0 });
    b += field(40, 280, '', 'Dial On Demand = off · MTU 1480', { check: true, checkOn: false, lw: 0 });
    b += caption(40, 316, 'Add Default Route = no → маршрут по умолчанию зададите сами (нужно для failover)');
    b += buttons(40, 336, [{ t: 'OK', primary: true, w: 80 }, { t: 'Cancel', w: 80 }, { t: 'Apply', w: 80 }, { t: 'Help', w: 70 }]);
    return win('Interface <PPPoe Client>', 748, 400, b, {});
  }
};

/* 5. DHCP client */
scenes['dhcp-client.svg'] = {
  build() {
    let b = '';
    b += rect(24, 18, 700, 30, '#e6ebf1', { rx: 4, stroke: '#c3ccd7' });
    ['General', 'Status', 'Advanced'].forEach((t, i) => {
      b += txt(44 + i * 100, 38, t, { size: 12, bold: i === 0, fill: i === 0 ? '#0b4f8a' : '#46536b' });
    });
    b += `<line x1="40" y1="48" x2="120" y2="48" stroke="#0b4f8a" stroke-width="2.5"/>`;
    b += field(40, 70, 'Interface:', 'ether-wan2', { select: true });
    b += field(40, 102, 'Use Peer NTP:', 'yes (checkbox)', { check: true, checkOn: true, lw: 0 });
    b += field(40, 126, '', 'Add Default Route', { check: true, checkOn: false, lw: 0 });
    b += field(40, 150, '', 'Use Peer DNS', { check: true, checkOn: true, lw: 0 });
    b += field(40, 174, '', 'Add Default Route Distance: 1', { check: true, checkOn: false, lw: 0 });
    b += rect(40, 214, 660, 96, '#f4f7fa', { rx: 6, stroke: '#c9d2dd' });
    b += txt(56, 238, 'Status:', { size: 12, bold: true });
    b += txt(130, 238, 'bound — адрес получен', { size: 12, fill: '#0f8a3d', bold: true });
    b += caption(56, 262, 'IP: 192.0.2.130/24      Gateway: 192.0.2.1      Router: 192.0.2.1');
    b += caption(56, 282, 'DNS: 198.51.100.53, 198.51.100.54      Expires: 00:08:41');
    b += buttons(40, 330, [{ t: 'OK', primary: true, w: 80 }, { t: 'Cancel', w: 80 }, { t: 'Apply', w: 80 }, { t: 'Status…', w: 90 }]);
    return win('DHCP Client <dhcp-client2>', 748, 392, b, {});
  }
};

/* 6. LTE */
scenes['lte-setup.svg'] = {
  build() {
    let b = '';
    b += rect(24, 18, 430, 30, '#e6ebf1', { rx: 4, stroke: '#c3ccd7' });
    ['General', 'APN', 'Status'].forEach((t, i) => {
      b += txt(44 + i * 90, 38, t, { size: 12, bold: i === 1, fill: i === 1 ? '#0b4f8a' : '#46536b' });
    });
    b += field(40, 74, 'Name:', 'lte1');
    b += field(40, 106, 'APN:', 'internet', { select: true });
    b += field(40, 138, 'PDP Type:', 'ipv4', { select: true });
    b += field(40, 170, 'Use Network APN:', 'no', { check: true, checkOn: false, lw: 0 });
    b += field(40, 194, 'Add Default Route:', 'no (зададим в маршрутах)', { check: true, checkOn: false, lw: 0 });
    b += field(40, 218, 'PIN Code:', '1234', { pw: true });
    // monitor panel
    b += rect(480, 60, 240, 210, '#0e1726', { rx: 8, stroke: '#2b3c55' });
    b += txt(496, 84, '/interface lte monitor lte1', { size: 11, fill: '#7dd3fc', mono: true });
    const mon = [['mode', 'LTE-A'], ['rsrp', '-92 dBm'], ['rsrq', '-11 dB'], ['sinr', '13 dB'], ['rscp', '-85 dBm'], ['cellid', '0x2A31C'], ['pin-status', 'ok'], ['status', 'ready']];
    mon.forEach(([k, v], i) => {
      b += txt(496, 110 + i * 19, k, { size: 11, fill: '#94a3b8', mono: true });
      b += txt(640, 110 + i * 19, v, { size: 11, fill: i === 7 ? '#4ade80' : '#e2e8f0', mono: true, bold: i === 7 });
    });
    b += caption(40, 300, 'Сигнал: RSRP −80…−100 дБм — нормально; SINR > 0 — стабильно');
    b += buttons(40, 330, [{ t: 'OK', primary: true, w: 80 }, { t: 'Cancel', w: 80 }, { t: 'Apply', w: 80 }, { t: 'Monitor', w: 90 }]);
    return win('LTE Interface <lte1>', 748, 392, b, {});
  }
};

/* 7. Bridge ports */
scenes['bridge-lan.svg'] = {
  menu: ['Interfaces', 'Bridge', 'Wireless', 'IP', 'Firewall', 'Queues', 'System', 'Tools'],
  active: 1,
  toolbar: ['＋', '✕', '↑', '↓'],
  build() {
    let b = txt(170, 24, 'Bridge → Ports', { size: 12, bold: true });
    b += rect(162, 32, 570, 26, '#e6ebf1', { stroke: '#c3ccd7' });
    ['Bridge', 'PVID', 'Horizon', 'Topology Change'].forEach((t, i) => b += txt(178 + i * 140, 49, t, { size: 11.5, bold: true, fill: i === 0 ? '#0b4f8a' : '#46536b' }));
    const t = table(162, 58, 570,
      ['Port', 'Bridge', 'PVID', 'Horizon', 'Comment'],
      [
        ['ether3', 'bridge-lan', '1', 'none', 'рабочий стол'],
        ['ether4', 'bridge-lan', '1', 'none', 'принтер'],
        ['ether5', 'bridge-guest', '99', 'none', 'гостевой сегмент'],
        ['wlan1', 'bridge-lan', '1', 'none', 'Wi-Fi рабочий'],
        ['wlan2', 'bridge-guest', '99', 'none', 'Wi-Fi гостевой'],
      ],
      { cols: [120, 140, 70, 100, 140], monoCols: [0, 1], selected: 0 });
    b += t.s;
    b += caption(170, t.bottom + 18, 'ether1/ether2 — WAN-порты провайдеров, В мост НЕ входят');
    b += caption(170, t.bottom + 38, '/interface bridge port add bridge=bridge-lan interface=ether3');
    return win('Bridge', 748, t.bottom + 90, b, { menu: this.menu, active: this.active, toolbar: this.toolbar });
  }
};

/* 8. IP Pool */
scenes['ip-pool.svg'] = {
  menu: ['Interfaces', 'Bridge', 'Wireless', 'IP', 'Firewall', 'Queues', 'System', 'Tools'],
  active: 3,
  toolbar: ['＋', '✕', '⬍'],
  build() {
    let b = txt(170, 24, 'IP → Pool', { size: 12, bold: true });
    const t = table(162, 34, 570,
      ['Name', 'Ranges', 'Used', 'Next'],
      [
        [{ t: 'pool-lan', fill: '#0b4f8a', bold: true }, '192.168.88.10-192.168.88.250', '14', '192.168.88.24'],
        ['pool-guest', '192.168.99.10-192.168.99.250', '6', '192.168.99.16'],
        ['vpn-pool', '10.10.10.20-10.10.10.254', '3', '10.10.10.23'],
      ],
      { cols: [130, 260, 60, 120], monoCols: [1, 3], selected: 0 });
    b += t.s;
    b += caption(170, t.bottom + 18, 'Адрес шлюза (192.168.88.1) в пул попадать НЕ должен');
    b += caption(170, t.bottom + 38, '/ip pool add name=pool-lan ranges=192.168.88.10-192.168.88.250');
    return win('IP Pool', 748, t.bottom + 90, b, { menu: this.menu, active: this.active, toolbar: this.toolbar });
  }
};

/* 9. DHCP server */
scenes['dhcp-server.svg'] = {
  menu: ['Interfaces', 'Bridge', 'Wireless', 'IP', 'Firewall', 'Queues', 'System', 'Tools'],
  active: 3,
  toolbar: ['＋', '✕', '⚙ Setup'],
  build() {
    let b = txt(170, 24, 'DHCP Server → Servers', { size: 12, bold: true });
    const t1 = table(162, 34, 570,
      ['Name', 'Interface', 'Lease Time', 'Address Pool', 'Dynamic'],
      [
        [{ t: 'dhcp-lan', fill: '#0b4f8a', bold: true }, 'bridge-lan', '10m', 'pool-lan', ''],
        ['dhcp-guest', 'bridge-guest', '10m', 'pool-guest', ''],
      ],
      { cols: [130, 140, 100, 120, 80], monoCols: [1, 3], selected: 0 });
    b += t1.s;
    b += txt(170, t1.bottom + 30, 'DHCP Server → Networks', { size: 12, bold: true });
    const t2 = table(162, t1.bottom + 40, 570,
      ['Address', 'Gateway', 'DNS Server', 'Comment'],
      [
        ['192.168.88.0/24', '192.168.88.1', '77.88.8.8, 8.8.8.8', 'LAN'],
        ['192.168.99.0/24', '192.168.99.1', '77.88.8.8', 'Гости'],
      ],
      { cols: [150, 140, 180, 100], monoCols: [0, 1, 2], selected: 0 });
    b += t2.s;
    b += caption(170, t2.bottom + 18, 'Мастер DHCP Setup создает сервер и network за 6 кликов');
    return win('DHCP Server', 748, t2.bottom + 66, b, { menu: this.menu, active: this.active, toolbar: this.toolbar });
  }
};

/* 10. Wi-Fi work */
scenes['wifi-work.svg'] = {
  menu: ['Interfaces', 'Bridge', 'Wireless/WiFi', 'IP', 'Firewall', 'Queues', 'System', 'Tools'],
  active: 2,
  toolbar: ['＋', '✕', '⟳'],
  build() {
    let b = txt(170, 24, 'WiFi Configuration (v7 wifiwave2)', { size: 12, bold: true });
    b += rect(162, 34, 570, 26, '#e6ebf1', { stroke: '#c3ccd7' });
    ['Configuration', 'Security', 'Radios'].forEach((t, i) => b += txt(180 + i * 130, 51, t, { size: 11.5, bold: true, fill: i === 0 ? '#0b4f8a' : '#46536b' }));
    let y = 76;
    const F = (l, v, o = {}) => { b += field(180, y, l, v, Object.assign({ lw: 150, vw: 360 }, o)); y += 30; };
    F('Configuration Name:', 'cfg-work');
    F('SSID:', 'MyNet');
    F('Security:', 'sec-work  (mode=wpa2)');
    F('Mode:', 'ap', { select: true });
    F('Bridge:', 'bridge-lan', { select: true });
    F('Country:', 'BY', { select: true });
    F('Channel Width:', '20/40/80mhz', { select: true });
    b += caption(180, y + 6, 'Пароль: wpa2-pre-shared-key="ВашНадежныйПароль1!"');
    b += caption(180, y + 26, '/interface wifi configuration add name=cfg-work ssid="MyNet" security=sec-work mode-ap bridge=bridge-lan');
    b += buttons(180, y + 46, [{ t: 'OK', primary: true, w: 80 }, { t: 'Cancel', w: 80 }, { t: 'Apply', w: 80 }]);
    return win('WiFi Configuration', 748, y + 100, b, { menu: this.menu, active: this.active, toolbar: this.toolbar });
  }
};

/* 11. Wi-Fi guest */
scenes['wifi-guest.svg'] = {
  menu: ['Interfaces', 'Bridge', 'Wireless/WiFi', 'IP', 'Firewall', 'Queues', 'System', 'Tools'],
  active: 2,
  toolbar: ['＋', '✕', '⟳'],
  build() {
    let b = txt(170, 24, 'WiFi Configuration — гостевая сеть', { size: 12, bold: true });
    b += rect(162, 34, 570, 26, '#e6ebf1', { stroke: '#c3ccd7' });
    ['Configuration', 'Security', 'Radios'].forEach((t, i) => b += txt(180 + i * 130, 51, t, { size: 11.5, bold: true, fill: i === 0 ? '#0b4f8a' : '#46536b' }));
    let y = 76;
    const F = (l, v, o = {}) => { b += field(180, y, l, v, Object.assign({ lw: 150, vw: 360 }, o)); y += 30; };
    F('Configuration Name:', 'cfg-guest');
    F('SSID:', 'MyNet-Guest');
    F('Security:', 'sec-guest  (wpa2)');
    F('Mode:', 'ap', { select: true });
    F('Bridge:', 'bridge-guest', { select: true });
    b += rect(180, y + 4, 540, 64, '#fff7ed', { rx: 6, stroke: '#fdba74' });
    b += txt(194, y + 26, '⚠ Гости получают адреса 192.168.99.0/24 — своя подсеть.', { size: 11.5, fill: '#7c2d12' });
    b += txt(194, y + 46, 'Доступ в LAN закрыт правилами forward; полоса ограничена queue guest-limit.', { size: 11.5, fill: '#7c2d12' });
    y += 76;
    b += caption(180, y + 6, '/interface wifi configuration add name=cfg-guest ssid="MyNet-Guest" security=sec-guest mode-ap bridge=bridge-guest');
    b += buttons(180, y + 26, [{ t: 'OK', primary: true, w: 80 }, { t: 'Cancel', w: 80 }, { t: 'Apply', w: 80 }]);
    return win('WiFi Configuration', 748, y + 80, b, { menu: this.menu, active: this.active, toolbar: this.toolbar });
  }
};

/* 12. Firewall filter */
scenes['firewall-filter.svg'] = {
  menu: ['Interfaces', 'Bridge', 'IP', 'Firewall', 'Queues', 'System', 'Tools'],
  active: 3,
  toolbar: ['＋', '✕', '↑', '↓', '▶'],
  build() {
    let b = txt(170, 24, 'Firewall → Filter Rules', { size: 12, bold: true });
    const t = table(162, 34, 570,
      ['#', 'A', 'T', 'Chain', 'Action', 'Proto', 'In. Iface', 'Comment'],
      [
        ['0', '', 'r', 'input', { t: 'accept', fill: '#0f8a3d', bold: true }, '', '', '1. Существующие'],
        ['1', '', 'r', 'input', { t: 'drop', fill: '#dc2626', bold: true }, '', '', '2. Невалидные'],
        ['2', '', 'r', 'input', { t: 'accept', fill: '#0f8a3d' }, 'udp', '', '3. DHCP от провайдера'],
        ['3', '', 'r', 'input', { t: 'drop', fill: '#dc2626', bold: true }, '', 'WAN', '4. Интернет → роутер'],
        ['4', '', 'r', 'input', { t: 'accept', fill: '#0f8a3d' }, '', 'bridge-lan', '6. LAN → роутер'],
        ['5', '', 'r', 'input', { t: 'drop', fill: '#dc2626' }, '', '', '7. Всё прочее'],
        ['6', '', 'r', 'forward', { t: 'accept', fill: '#0f8a3d' }, '', 'bridge-lan', 'F4. LAN → интернет'],
        ['7', '', 'r', 'forward', { t: 'drop', fill: '#dc2626', bold: true }, '', 'WAN', 'F6. Интернет → LAN'],
      ],
      { cols: [26, 22, 22, 66, 70, 46, 100, 176], monoCols: [3, 5, 6], selected: 3 });
    b += t.s;
    b += caption(170, t.bottom + 16, 'Порядок = приоритет: первое совупавшее правило побеждает');
    b += caption(170, t.bottom + 34, '/ip firewall filter print stats  — счётчики Bytes/Packets');
    return win('Firewall', 748, t.bottom + 76, b, { menu: this.menu, active: this.active, toolbar: this.toolbar });
  }
};

/* 13. NAT masquerade */
scenes['nat-rules.svg'] = {
  menu: ['Interfaces', 'Bridge', 'IP', 'Firewall', 'Queues', 'System', 'Tools'],
  active: 3,
  toolbar: ['＋', '✕', '↑', '↓'],
  build() {
    let b = txt(170, 24, 'Firewall → NAT → SrcNAT', { size: 12, bold: true });
    const t = table(162, 34, 570,
      ['#', 'T', 'Chain', 'Action', 'Out. Iface', 'Comment'],
      [
        ['0', 'r', 'srcnat', { t: 'masquerade', fill: '#0b4f8a', bold: true }, 'WAN', 'Выход в интернет'],
        ['1', 'r', 'srcnat', { t: 'src-nat', fill: '#0b4f8a' }, 'pppoe-out1', 'to 203.0.113.2 (статика)'],
      ],
      { cols: [30, 26, 90, 140, 130, 154], monoCols: [2, 4], selected: 0 });
    b += t.s;
    b += caption(170, t.bottom + 18, 'masquerade — для динамических адресов (PPPoE/DHCP/LTE)');
    b += caption(170, t.bottom + 36, 'src-nat to-addresses — лучше для статического IP провайдера');
    b += rect(170, t.bottom + 54, 540, 40, '#f0fdf4', { rx: 6, stroke: '#86efac' });
    b += txt(184, t.bottom + 78, 'Клиенты 192.168.88.x выходят в интернет как IP провайдера ✓', { size: 11.5, fill: '#14532d' });
    return win('Firewall', 748, t.bottom + 120, b, { menu: this.menu, active: this.active, toolbar: this.toolbar });
  }
};

/* 14. dstnat */
scenes['dstnat.svg'] = {
  menu: ['Interfaces', 'Bridge', 'IP', 'Firewall', 'Queues', 'System', 'Tools'],
  active: 3,
  toolbar: ['＋', '✕', '↑', '↓'],
  build() {
    let b = txt(170, 24, 'Firewall → NAT → DstNAT (публикации)', { size: 12, bold: true });
    const t = table(162, 34, 570,
      ['#', 'Chain', 'Action', 'Dst. Port', 'To Addresses', 'To Ports', 'In. Iface'],
      [
        ['0', 'dstnat', { t: 'dst-nat', fill: '#0b4f8a', bold: true }, '443', '192.168.88.10', '443', 'WAN'],
        ['1', 'dstnat', { t: 'dst-nat', fill: '#0b4f8a' }, '8443', '192.168.88.20', '443', 'WAN'],
        ['2', 'dstnat', { t: 'dst-nat', fill: '#0b4f8a' }, '22022', '192.168.88.30', '22', 'pppoe-out1'],
      ],
      { cols: [30, 80, 90, 90, 140, 70, 70], monoCols: [3, 4, 5, 6], selected: 0 });
    b += t.s;
    b += caption(170, t.bottom + 18, 'Правило 2: SSH доступен ТОЛЬКО через основного провайдера (in-interface=pppoe-out1)');
    b += caption(170, t.bottom + 36, 'Не забудьте разрешающее forward-правило (Filter Rules, выше «Интернет → LAN»)');
    return win('Firewall', 748, t.bottom + 80, b, { menu: this.menu, active: this.active, toolbar: this.toolbar });
  }
};

/* 15. Routes */
scenes['routes-failover.svg'] = {
  menu: ['ARP', 'NDP', 'Neighbors', 'Routes', 'Routing', 'Firewall', 'NAT'],
  active: 3,
  toolbar: ['＋', '✕', '⟳'],
  build() {
    let b = txt(170, 24, 'IP → Routes (failover)', { size: 12, bold: true });
    const t = table(162, 34, 570,
      ['DA S', 'Dst Address', 'Gateway', 'Dist', 'Status'],
      [
        [{ t: 'D A', fill: '#0f8a3d', bold: true }, '0.0.0.0/0', { t: 'pppoe-out1', fill: '#0b4f8a' }, '1', 'reachable (ОСНОВНОЙ)'],
        ['D A  S', '0.0.0.0/0', '192.0.2.1', '2', 'reachable (РЕЗЕРВ)'],
        ['D A', '192.168.88.0/24', 'bridge-lan', '0', 'connected'],
        ['D A', '192.168.99.0/24', 'bridge-guest', '0', 'connected'],
        ['D A', '10.10.10.0/24', 'wg0', '0', 'connected'],
        ['D A', '10.20.0.0/24', '10.10.10.1', '1', 'reachable (VPN офис2)'],
      ],
      { cols: [58, 150, 140, 50, 172], monoCols: [1, 2], selected: 0, flagA: false });
    b += t.s;
    b += rect(170, t.bottom + 12, 540, 54, '#eff6ff', { rx: 6, stroke: '#93c5fd' });
    b += txt(184, t.bottom + 34, 'distance 1 = активен, пока шлюз отвечает; иначе → distance 2 (через ~30 с)', { size: 11.5, fill: '#1e3a8a' });
    b += txt(184, t.bottom + 54, 'check-gateway=ping · gateway-ping-interval=10s — проверка в обе стороны', { size: 11.5, fill: '#1e3a8a' });
    return win('Route List', 748, t.bottom + 100, b, { menu: this.menu, active: this.active, toolbar: this.toolbar });
  }
};

/* 16. Mangle */
scenes['mangle-marks.svg'] = {
  menu: ['Interfaces', 'IP', 'Firewall', 'Routing', 'Queues', 'System'],
  active: 2,
  toolbar: ['＋', '✕', '↑', '↓'],
  build() {
    let b = txt(170, 24, 'Firewall → Mangle', { size: 12, bold: true });
    const t = table(162, 34, 570,
      ['#', 'Chain', 'Action', 'New Conn-Mark', 'New Routing-Mark', 'Comment'],
      [
        ['0', 'prerouting', { t: 'mark-connection', fill: '#0b4f8a' }, 'conn-primary', '', 'новые из LAN'],
        ['1', 'output', { t: 'mark-connection', fill: '#0b4f8a' }, 'conn-primary', '', 'новые от роутера'],
        ['2', 'postrouting', { t: 'mark-connection', fill: '#0b4f8a' }, 'conn-backup', '', 'ушедшие в резерв'],
        ['3', 'prerouting', { t: 'mark-routing', fill: '#7c3aed' }, 'conn-primary', 'to-primary', 'стол маршрутов'],
        ['4', 'prerouting', { t: 'mark-routing', fill: '#7c3aed' }, 'conn-backup', 'to-backup', 'стол маршрутов'],
        ['5', 'output', { t: 'mark-routing', fill: '#7c3aed' }, 'conn-backup', 'to-backup', 'локальный трафик'],
      ],
      { cols: [30, 96, 120, 120, 124, 80], monoCols: [1, 3, 4], selected: 4 });
    b += t.s;
    b += caption(170, t.bottom + 16, 'Сессии, попавшие в резерв, продолжают работать по столу to-backup');
    b += caption(170, t.bottom + 34, 'после восстановления основного канала — без обрыва TCP/RDP');
    return win('Firewall', 748, t.bottom + 76, b, { menu: this.menu, active: this.active, toolbar: this.toolbar });
  }
};

/* 17. Netwatch */
scenes['netwatch.svg'] = {
  menu: ['Interfaces', 'IP', 'Firewall', 'Tools', 'System'],
  active: 3,
  toolbar: ['＋', '✕', '▶'],
  build() {
    let b = txt(170, 24, 'Tools → Netwatch', { size: 12, bold: true });
    const t = table(162, 34, 570,
      ['#', 'Host', 'Type', 'Interval', 'Status', 'Since', 'Sent/Recv'],
      [
        ['0', '8.8.8.8', 'icmp', '10s', { t: 'up', fill: '#0f8a3d', bold: true }, '14:02:11', '148/148'],
        ['1', '192.0.2.1', 'icmp', '10s', { t: 'up', fill: '#0f8a3d', bold: true }, '14:02:11', '148/147'],
        ['2', 'pppoe-out1-gw', 'icmp', '5s', { t: 'up', fill: '#0f8a3d' }, '14:02:12', '296/296'],
      ],
      { cols: [30, 150, 60, 70, 70, 110, 80], monoCols: [1, 2], selected: 0 });
    b += t.s;
    b += rect(170, t.bottom + 14, 540, 64, '#f0fdf4', { rx: 6, stroke: '#86efac' });
    b += txt(184, t.bottom + 38, 'down-script: :log warning "НЕТ ИНТЕРНЕТА — канал down"', { size: 11.5, fill: '#14532d', mono: true });
    b += txt(184, t.bottom + 58, 'up-script: :log info "Интернет восстановлен"', { size: 11.5, fill: '#14532d', mono: true });
    b += caption(170, t.bottom + 96, 'Статус up/down обновляется каждые interval; журнал: /log print where topics~"netwatch"');
    return win('Netwatch', 748, t.bottom + 130, b, { menu: this.menu, active: this.active, toolbar: this.toolbar });
  }
};

/* 18. WireGuard */
scenes['wireguard-peers.svg'] = {
  menu: ['Interfaces', 'Bridge', 'Wireless', 'IP', 'Firewall', 'VPN', 'System'],
  active: 0,
  toolbar: ['＋', '✕'],
  build() {
    let b = txt(170, 24, 'Interfaces → WireGuard (wg0, UDP 13231)', { size: 12, bold: true });
    const t1 = table(162, 34, 570,
      ['Name', 'Listen Port', 'MTU', 'Actual Rx/Tx'],
      [['wg0', '13231', '1420', '96 kbps / 84 kbps']],
      { cols: [140, 140, 80, 210], monoCols: [0, 1], selected: 0 });
    b += t1.s;
    b += txt(170, t1.bottom + 30, 'Peers', { size: 12, bold: true });
    const t2 = table(162, t1.bottom + 40, 570,
      ['Public Key', 'Allowed Address', 'Endpoint', 'Last Handshake'],
      [
        ['HuRt6x…9fQ=', { t: '10.10.10.2/32', fill: '#0b4f8a' }, '—', { t: '14:04:51', fill: '#0f8a3d', bold: true }],
        ['kQ2mP8…Xv1=', { t: '10.10.10.3/32', fill: '#0b4f8a' }, '203.0.113.77:51820', { t: '14:04:47', fill: '#0f8a3d' }],
      ],
      { cols: [160, 140, 160, 110], monoCols: [0, 1, 2], selected: 1 });
    b += t2.s;
    b += caption(170, t2.bottom + 18, 'Last Handshake обновляется каждые ~2 мин — значит туннель жив');
    b += caption(170, t2.bottom + 36, '/interface wireguard peers add public-key="…" allowed-address=10.10.10.4/32 interface=wg0');
    return win('WireGuard', 748, t2.bottom + 80, b, { menu: this.menu, active: this.active, toolbar: this.toolbar });
  }
};

/* 19. IPsec peers */
scenes['ipsec-peer.svg'] = {
  menu: ['Interfaces', 'IP', 'Firewall', 'VPN', 'System', 'Tools'],
  active: 3,
  toolbar: ['＋', '✕', '⟳'],
  build() {
    let b = txt(170, 24, 'IPsec → Peers', { size: 12, bold: true });
    const t = table(162, 34, 570,
      ['Name', 'Address', 'Exchange', 'State', 'Profile'],
      [
        [{ t: 'ike2-peer', fill: '#0b4f8a', bold: true }, '0.0.0.0/0', 'ike2', { t: 'established (2)', fill: '#0f8a3d', bold: true }, 'default'],
        [{ t: 'office2', fill: '#0b4f8a' }, '203.0.113.5', 'ike2', { t: 'established', fill: '#0f8a3d', bold: true }, 'default'],
        ['l2tp-remote', '0.0.0.0/0', 'main', { t: 'established (1)', fill: '#0f8a3d' }, 'default'],
      ],
      { cols: [130, 130, 90, 150, 70], monoCols: [1, 2], selected: 1 });
    b += t.s;
    b += txt(170, t.bottom + 30, 'Active Peers / Identities', { size: 12, bold: true });
    const t2 = table(162, t.bottom + 40, 570,
      ['Identity', 'Auth Method', 'Remote Address', 'Uptime'],
      [
        ['employee (EAP)', 'pre-shared-key', '198.51.100.44', '02:14:09'],
        ['(any)', 'pre-shared-key', '203.0.113.5', '5d02:11:33'],
      ],
      { cols: [170, 160, 150, 90], monoCols: [2], selected: 0 });
    b += t2.s;
    b += caption(170, t2.bottom + 18, 'State=established — туннель поднят; логи: /ip ipsec log print');
    return win('IPsec', 748, t2.bottom + 66, b, { menu: this.menu, active: this.active, toolbar: this.toolbar });
  }
};

/* ---------- запись ---------- */
let count = 0;
for (const [name, spec] of Object.entries(scenes)) {
  const svg = typeof spec === 'string' ? spec : spec.build();
  fs.writeFileSync(path.join(OUT, name), svg);
  count++;
}
console.log('Generated ' + count + ' screenshots → ' + OUT);
