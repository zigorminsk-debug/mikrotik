#!/usr/bin/env node
/* Генератор учебной схемы сети (не скриншот WinBox).
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

/* Записываем только схему сети: снимки WinBox не генерируются. */
fs.writeFileSync(path.join(OUT, 'topology.svg'), scenes['topology.svg']);
console.log('Схема сети создана → ' + OUT);
