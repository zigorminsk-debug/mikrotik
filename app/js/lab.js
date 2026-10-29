/* ============================================================
   Лаборатория — графический стенд уровня PNETLab.
   Карта устройств (провайдер, MikroTik, коммутатор, ПК, сервер,
   принтер), линии связи, настройки каждого устройства, запуск
   модели с прохождением трафика и карта настроек MikroTik.
   ============================================================ */
(function () {
'use strict';
if (typeof document === 'undefined') return;

var DEV_W = 96, DEV_H = 86;

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

/* ---------- Иконки устройств ---------- */
var ICONS = {
  isp: '<svg viewBox="0 0 48 48"><path d="M14 34a8 8 0 0 1 1.7-15.8A11 11 0 0 1 36 17.6 7.5 7.5 0 0 1 34.5 34H14z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M20 25l4-4 4 4M24 21v8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  router: '<svg viewBox="0 0 48 48"><rect x="7" y="26" width="34" height="13" rx="3.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M15 26l-4.5-9M33 26l4.5-9" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M9.5 14.5l1.5 2M38.5 14.5l-1.5 2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="14" cy="33" r="2" fill="currentColor"/><circle cx="21" cy="33" r="2" fill="currentColor"/><path d="M30 31h7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  switch: '<svg viewBox="0 0 48 48"><rect x="5" y="17" width="38" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M11 36v-4M17 36v-4M23 36v-4M29 36v-4M35 36v-4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M13 24.5h6M29 24.5h6M16 21.5l3 3-3 3M32 21.5l-3 3 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pc: '<svg viewBox="0 0 48 48"><rect x="9" y="11" width="30" height="20" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M18 37h12M24 31v6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M14 16h10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  server: '<svg viewBox="0 0 48 48"><rect x="13" y="7" width="22" height="34" rx="3" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M18 14h12M18 21h12M18 28h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="19" cy="35" r="1.8" fill="currentColor"/><path d="M25 35h5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  printer: '<svg viewBox="0 0 48 48"><path d="M15 20v-9h18v9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><rect x="8" y="20" width="32" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M15 28h18v11H15z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="34" cy="25" r="1.6" fill="currentColor"/></svg>'
};

/* ---------- Типы устройств ---------- */
var TYPES = {
  isp: { label: 'Провайдер', cls: 'isp',
    defName: function (n) { return n <= 1 ? 'Провайдер' : 'Провайдер ' + n; },
    cfg: function () { return { kind: 'pppoe', user: 'user@isp', pass: 'secret',
      ip: '198.51.100.2/30', gw: '198.51.100.1', dns: '198.51.100.1', apn: 'internet' }; } },
  router: { label: 'MikroTik', cls: 'router',
    defName: function (n) { return n <= 1 ? 'MikroTik' : 'MikroTik ' + n; },
    cfg: function () { return { lan: '192.168.88.0/24', gw: '192.168.88.1',
      dhcp: true, nat: true, firewall: true, vpn: false,
      vpnType: 'wireguard', vpnPort: '13231', vpnPool: '10.10.10.0/24' }; } },
  switch: { label: 'Коммутатор', cls: 'switch',
    defName: function (n) { return n <= 1 ? 'Коммутатор' : 'Коммутатор ' + n; },
    cfg: function () { return {}; } },
  pc: { label: 'ПК', cls: 'pc',
    defName: function (n) { return 'ПК ' + n; },
    cfg: function () { return { mode: 'static', ip: '192.168.88.10/24', gw: '192.168.88.1', dns: '' }; } },
  server: { label: 'Сервер', cls: 'server',
    defName: function (n) { return 'Сервер ' + n; },
    cfg: function () { return { mode: 'static', ip: '192.168.88.20/24', gw: '192.168.88.1', dns: '' }; } },
  printer: { label: 'Принтер', cls: 'printer',
    defName: function (n) { return 'Принтер ' + n; },
    cfg: function () { return { mode: 'static', ip: '192.168.88.30/24', gw: '192.168.88.1', dns: '' }; } }
};

/* ---------- Состояние ---------- */
var state = { devices: [], links: [], seq: 0 };
var mode = 'select';            /* select | place | link */
var pickType = null;            /* какой тип ставим в режиме place */
var linkFrom = null;            /* первая точка линии */
var selected = null;            /* {kind:'dev'|'link', id} */
var lastModel = null;           /* адресная карта после успешного запуска */
var playToken = 0, playCtl = null;
var currentRes = null;

function nid(p) { state.seq++; return p + state.seq; }
function byId(id) { return state.devices.filter(function (d) { return d.id === id; })[0]; }
function countType(t) { return state.devices.filter(function (d) { return d.type === t; }).length; }
function center(d) { return { x: d.x + DEV_W / 2, y: d.y + DEV_H / 2 }; }

/* ---------- DOM ---------- */
var canvas, svg, hintEl, emptyEl, inspectEl, logBox, logLines, resultsEl,
    modeBtns, palBtns, runBtn, resetBtn, skipBtn, modal, lmTitle, lmBody, lmErr,
    lmSave, lmCancel, lmClose;

function $(id) { return document.getElementById(id); }

/* ---------- Рендер устройств ---------- */
function renderDevices() {
  Array.prototype.slice.call(canvas.querySelectorAll('.lab-dev')).forEach(function (e) { e.remove(); });
  state.devices.forEach(function (d) {
    var t = TYPES[d.type];
    var el = document.createElement('div');
    el.className = 'lab-dev t-' + t.cls +
      (selected && selected.kind === 'dev' && selected.id === d.id ? ' sel' : '') +
      (linkFrom === d.id ? ' linksrc' : '');
    el.dataset.id = d.id;
    el.style.left = d.x + 'px';
    el.style.top = d.y + 'px';
    var badge = '';
    if (lastModel && lastModel.assignments && lastModel.assignments[d.id]) {
      if (d.type === 'isp')
        badge = '<span class="lab-ip">' + esc({ pppoe: 'PPPoE', dhcp: 'DHCP', static: 'IP', lte: 'LTE' }[d.cfg.kind] || '') + ' · ' + (d.cfg.priority === 'backup' ? 'резерв' : 'основной') + '</span>';
      else
        badge = '<span class="lab-ip">' + esc(lastModel.assignments[d.id].ip) + '</span>';
    } else if (d.type === 'isp') {
      badge = '<span class="lab-ip">' + esc({pppoe:'PPPoE', dhcp:'DHCP', static:'Статический IP', lte:'LTE'}[d.cfg.kind]) + ' · ' + esc(d.cfg.priority === 'backup' ? 'резерв' : 'основной') + '</span>';
    } else if (d.type === 'pc' || d.type === 'server' || d.type === 'printer') {
      badge = '<span class="lab-ip">' + esc(d.cfg.mode === 'dhcp' ? 'DHCP' : d.cfg.ip) + '</span>';
    } else if (d.type === 'router') {
      var roles = [];
      if (d.cfg.dhcp) roles.push('DHCP');
      if (d.cfg.nat) roles.push('NAT');
      if (d.cfg.firewall) roles.push('FW');
      if (d.cfg.vpn) roles.push('VPN');
      badge = '<span class="lab-ip">' + esc(roles.join('·') || 'роли —') + '</span>';
    }
    el.innerHTML = '<div class="lab-ico">' + ICONS[d.type] + '</div>' +
      '<div class="lab-nm">' + esc(d.name) + '</div>' + badge +
      '<button type="button" class="lab-gear" aria-label="Настроить ' + esc(d.name) + '" title="Настроить ' + esc(d.name) + '">⚙</button>';
    var gear = el.querySelector('.lab-gear');
    gear.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    gear.addEventListener('touchstart', function (e) { e.stopPropagation(); });
    gear.addEventListener('click', function (e) { e.stopPropagation(); select(d.id); openSettings(d.id); });
    el.addEventListener('click', function (e) {
      if (el._sup) { el._sup = false; return; }
      onDeviceClick(d);
    });
    canvas.appendChild(el);
  });
}

/* ---------- Рендер линий ---------- */
function svgEl(name, attrs) {
  var e = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
  return e;
}
function renderLinks() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  state.links.forEach(function (l) {
    var a = byId(l.a), b = byId(l.b);
    if (!a || !b) return;
    var A = center(a), B = center(b);
    var isSel = selected && selected.kind === 'link' && selected.id === l.id;
    var line = svgEl('line', { class: 'lab-link' + (isSel ? ' sel' : ''),
      x1: A.x, y1: A.y, x2: B.x, y2: B.y });
    var hit = svgEl('line', { class: 'lab-link-hit', x1: A.x, y1: A.y, x2: B.x, y2: B.y });
    hit.addEventListener('click', function (e) {
      e.stopPropagation();
      if (mode === 'delete') { requestDelete('link', l.id); return; }
      if (mode !== 'select') return;
      selectLink(l.id);
    });
    svg.appendChild(line);
    svg.appendChild(hit);
    var wan = (a.type === 'router' && b.type === 'isp') || (b.type === 'router' && a.type === 'isp');
    var mid = svgEl('text', { class: 'lab-link-lbl', x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 - 6 });
    mid.textContent = wan ? 'WAN' : 'LAN';
    svg.appendChild(mid);
  });
}

function updateHint() {
  var t = '';
  if (mode === 'place')
    t = pickType
      ? 'Коснитесь пустого места на карте — поставим: «' + TYPES[pickType].label + '»'
      : 'Выберите устройство в панели выше и коснитесь карты';
  else if (mode === 'link')
    t = linkFrom
      ? 'Отлично. Коснитесь второго устройства — появится линия связи'
      : 'Коснитесь первого устройства, затем второго — соедините их линией';
  else if (mode === 'delete')
    t = 'Нажмите устройство или линию на карте, затем подтвердите удаление';
  else
    t = 'Коснитесь устройства или линии — можно настроить, удалить или просто рассмотреть';
  hintEl.textContent = t + ' Настройки устройства: нажмите ⚙ на его значке (в любом режиме).';
}
function setMode(m) {
  mode = m;
  linkFrom = null;
  modeBtns.forEach(function (b) {
    b.classList.toggle('active', b.dataset.mode === m);
  });
  renderAll();
}
function setPick(type) {
  pickType = type;
  mode = 'place';
  modeBtns.forEach(function (b) { b.classList.toggle('active', b.dataset.mode === 'place'); });
  palBtns.forEach(function (b) { b.classList.toggle('active', b.dataset.dev === type); });
  renderAll();
}

function renderAll() {
  renderDevices();
  renderLinks();
  renderInspect();
  updateHint();
  if (emptyEl) emptyEl.hidden = state.devices.length > 0;
}

/* ---------- Выделение и инспектор ---------- */
function select(id) { selected = { kind: 'dev', id: id }; renderAll(); }
function selectLink(id) { selected = { kind: 'link', id: id }; renderAll(); }

function renderInspect() {
  if (!selected) { inspectEl.hidden = true; inspectEl.innerHTML = ''; return; }
  if (selected.kind === 'link') {
    var l = state.links.filter(function (x) { return x.id === selected.id; })[0];
    var a = l && byId(l.a), b = l && byId(l.b);
    if (!l || !a || !b) { selected = null; renderInspect(); return; }
    inspectEl.innerHTML = '<div class="insp-t">🔗 Линия связи: ' + esc(a.name) + ' — ' + esc(b.name) + '</div>' +
      '<div class="insp-sub">' + esc((a.type === 'isp' || b.type === 'isp') && (a.type === 'router' || b.type === 'router') ? 'WAN-канал' : 'LAN-сегмент') + '</div>' +
      '<div class="insp-acts"><button type="button" class="btn danger-ghost" id="insp_del">✕ Удалить линию</button></div>';
    inspectEl.hidden = false;
    $('insp_del').addEventListener('click', function () { requestDelete('link', l.id); });
    return;
  }
  var d = byId(selected.id);
  if (!d) { selected = null; renderInspect(); return; }
  var sub = '';
  if (d.type === 'router') {
    var roles = [];
    if (d.cfg.dhcp) roles.push('DHCP-сервер');
    if (d.cfg.nat) roles.push('NAT');
    if (d.cfg.firewall) roles.push('Firewall');
    if (d.cfg.vpn) roles.push('VPN');
    sub = esc(d.cfg.lan) + ' · роли: ' + esc(roles.join(', ') || 'не заданы');
  } else if (d.type === 'isp') {
    sub = { pppoe: 'PPPoE: логин/пароль', dhcp: 'DHCP — авто', static: 'Статический IP', lte: 'USB 3G/LTE' }[d.cfg.kind];
    sub = esc(sub) + ' · ' + (d.cfg.priority === 'backup' ? 'резервный' : 'основной');
  } else if (d.type === 'switch') {
    sub = 'Коммутатор L2 — просто соединяет сегменты';
  } else {
    sub = d.cfg.mode === 'dhcp' ? 'получает адрес по DHCP' : 'статический: ' + esc(d.cfg.ip);
  }
  inspectEl.innerHTML = '<div class="insp-t">' + esc(d.name) + '</div><div class="insp-sub">' + sub + '</div>' +
    '<div class="insp-acts">' +
    '<button type="button" class="btn ghost" id="insp_cfg">⚙ Настроить</button>' +
    '<button type="button" class="btn danger-ghost" id="insp_del">✕ Удалить</button></div>';
  inspectEl.hidden = false;
  $('insp_cfg').addEventListener('click', function () { openSettings(d.id); });
  $('insp_del').addEventListener('click', function () { requestDelete('dev', d.id); });
}

/* Подтверждаем удаление в собственном диалоге: window.confirm не работает
   в Android WebView без WebChromeClient. Удаление устройства удаляет его линии. */
var pendingDelete = null;
function requestDelete(kind, id) {
  var target = kind === 'dev' ? byId(id) : state.links.filter(function (l) { return l.id === id; })[0];
  if (!target) return;
  pendingDelete = { kind: kind, id: id };
  var text;
  if (kind === 'dev') {
    var count = state.links.filter(function (l) { return l.a === id || l.b === id; }).length;
    text = 'Удалить «' + target.name + '»? Вместе с устройством будут удалены его линии: ' + count + '.';
  } else {
    var a = byId(target.a), b = byId(target.b);
    text = 'Удалить линию между «' + (a ? a.name : '') + '» и «' + (b ? b.name : '') + '»? Устройства останутся на карте.';
  }
  $('lab-confirm-text').textContent = text;
  $('lab-confirm').hidden = false;
}
function finishDelete() {
  if (!pendingDelete) return;
  var item = pendingDelete;
  pendingDelete = null;
  $('lab-confirm').hidden = true;
  if (item.kind === 'dev') {
    state.devices = state.devices.filter(function (d) { return d.id !== item.id; });
    state.links = state.links.filter(function (l) { return l.a !== item.id && l.b !== item.id; });
    modal.hidden = true;
    editingId = null;
  } else state.links = state.links.filter(function (l) { return l.id !== item.id; });
  selected = null;
  linkFrom = null;
  invalidate();
  renderAll();
}

/* ---------- Размещение и связи ---------- */
function place(type, x, y) {
  var t = TYPES[type];
  if (!t) return null;
  var maxW = canvas.clientWidth > 0 ? canvas.clientWidth - DEV_W : 100000;
  var maxH = canvas.clientHeight > 0 ? canvas.clientHeight - DEV_H : 100000;
  var d = { id: nid('d'), type: type,
    name: t.defName(countType(type) + 1),
    x: Math.round(clamp(x, 0, Math.max(0, maxW))),
    y: Math.round(clamp(y, 0, Math.max(0, maxH))),
    cfg: t.cfg() };
  if (type === 'isp') {
    d.cfg.priority = countType('isp') ? 'backup' : 'primary';
    if (countType('isp')) { d.cfg.ip = '203.0.113.2/30'; d.cfg.gw = '203.0.113.1'; d.cfg.dns = '1.1.1.1'; }
  }
  if (type === 'pc' || type === 'server' || type === 'printer') {
    var router = state.devices.filter(function (x) { return x.type === 'router'; })[0];
    var net = LabEngine.parseCidr(router ? router.cfg.lan : '192.168.88.0/24');
    if (net && net.prefix === 24) {
      var used = state.devices.map(function (x) { return x.cfg && x.cfg.mode === 'static' ? (x.cfg.ip || '').split('/')[0] : ''; });
      var gw = router ? router.cfg.gw : '192.168.88.1';
      used.push(gw);
      var host = 10;
      while (host < 255 && (host >= 100 && host <= 199 || used.indexOf(LabEngine.intToIp(net.firstInt + host)) !== -1)) host++;
      if (host < 255) { d.cfg.ip = LabEngine.intToIp(net.firstInt + host) + '/24'; d.cfg.gw = gw; }
      else d.cfg.mode = 'dhcp';
    }
  }
  state.devices.push(d);
  invalidate();
  renderAll();
  return d.id;
}
function addLink(a, b) {
  if (!a || !b || a === b) return null;
  if (!byId(a) || !byId(b)) return null;
  var dup = state.links.some(function (l) {
    return (l.a === a && l.b === b) || (l.a === b && l.b === a);
  });
  if (dup) return null;
  var id = nid('l');
  state.links.push({ id: id, a: a, b: b });
  invalidate();
  renderAll();
  return id;
}
function onDeviceClick(d) {
  if (mode === 'delete') { requestDelete('dev', d.id); return; }
  if (mode === 'link') {
    if (!linkFrom) { linkFrom = d.id; renderAll(); return; }
    if (linkFrom === d.id) { linkFrom = null; renderAll(); return; }
    var made = addLink(linkFrom, d.id);
    linkFrom = null;
    if (!made) { hintEl.textContent = 'Эти устройства уже соединены'; }
    renderAll();
    return;
  }
  if (mode === 'place') {
    hintEl.textContent = 'Это уже устройство — коснитесь пустого места карты';
    return;
  }
  select(d.id);
  openSettings(d.id);
}

/* ---------- Перетаскивание ---------- */
var drag = null;
function startDrag(d, el, sx, sy) {
  drag = { d: d, el: el, sx: sx, sy: sy, ox: d.x, oy: d.y, moved: false };
}
function moveDrag(sx, sy) {
  if (!drag) return;
  var dx = sx - drag.sx, dy = sy - drag.sy;
  if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
  var maxW = canvas.clientWidth > 0 ? canvas.clientWidth - DEV_W : 100000;
  var maxH = canvas.clientHeight > 0 ? canvas.clientHeight - DEV_H : 100000;
  drag.d.x = Math.round(clamp(drag.ox + dx, 0, Math.max(0, maxW)));
  drag.d.y = Math.round(clamp(drag.oy + dy, 0, Math.max(0, maxH)));
  drag.el.style.left = drag.d.x + 'px';
  drag.el.style.top = drag.d.y + 'px';
  renderLinks();
}
function endDrag() {
  if (!drag) return;
  if (drag.moved) drag.el._sup = true;
  drag = null;
}document.addEventListener('mousemove', function (e) { if (drag) { e.preventDefault(); moveDrag(e.clientX, e.clientY); } });
document.addEventListener('mouseup', endDrag);
document.addEventListener('touchmove', function (e) {
  if (drag && e.touches[0]) { moveDrag(e.touches[0].clientX, e.touches[0].clientY); }
}, { passive: true });
document.addEventListener('touchend', endDrag);
/* перепривязка после каждого renderDevices — используем делегирование: */
function bindDragDelegates() {
  canvas.addEventListener('mousedown', function (e) {
    if (e.target.closest && e.target.closest('.lab-gear')) return;
    var el = e.target.closest ? e.target.closest('.lab-dev') : null;
    if (!el || !el.dataset.id) return;
    var d = byId(el.dataset.id);
    if (d) startDrag(d, el, e.clientX, e.clientY);
  });
  canvas.addEventListener('touchstart', function (e) {
    if (e.target.closest && e.target.closest('.lab-gear')) return;
    var el = e.target.closest ? e.target.closest('.lab-dev') : null;
    if (!el || !el.dataset.id || !e.touches[0]) return;
    var d = byId(el.dataset.id);
    if (d) startDrag(d, el, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
}

/* ---------- Журнал и анимация пакетов ---------- */
function appendLog(level, text) {
  var line = document.createElement('div');
  line.className = 'lab-line l-' + level;
  line.textContent = text;
  logLines.appendChild(line);
  logBox.hidden = false;
  logLines.scrollTop = logLines.scrollHeight;
}
function findLinkEl(from, to) {
  var l = state.links.filter(function (x) {
    return (x.a === from && x.b === to) || (x.a === to && x.b === from);
  })[0];
  if (!l) return null;
  var a = byId(l.a), b = byId(l.b);
  if (!a || !b) return null;
  return { A: center(a), B: center(b), reverse: l.b === from };
}
function flyPacket(ev) {
  if (typeof window.requestAnimationFrame !== 'function') return;
  var geo = findLinkEl(ev.from, ev.to);
  if (!geo) return;
  var A = geo.reverse ? geo.B : geo.A;
  var B = geo.reverse ? geo.A : geo.B;
  var c = svgEl('circle', { class: 'lab-pkt k-' + (ev.kind || 'data'), r: 5, cx: A.x, cy: A.y });
  var ttl = svgEl('title'); ttl.textContent = ev.proto || '';
  c.appendChild(ttl);
  svg.appendChild(c);
  var t0 = performance.now ? performance.now() : Date.now();
  var dur = 260;
  function frame(t) {
    var k = Math.min(1, (t - t0) / dur);
    var e2 = k < 0.5 ? 2 * k * k : -1 + (4 - 2 * k) * k; /* ease-in-out */
    c.setAttribute('cx', A.x + (B.x - A.x) * e2);
    c.setAttribute('cy', A.y + (B.y - A.y) * e2);
    if (k < 1) window.requestAnimationFrame(frame);
    else c.remove();
  }
  window.requestAnimationFrame(frame);
}

/* ---------- Запуск модели ---------- */
function invalidate() {
  if (playCtl) { clearTimeout(playCtl.timer); playCtl = null; playToken++; }
  currentRes = null;
  lastModel = null;
  if (resultsEl) { resultsEl.hidden = true; resultsEl.innerHTML = ''; }
  if (logBox) { logBox.hidden = true; logLines.innerHTML = ''; }
  if (skipBtn) skipBtn.hidden = true;
}
function playStep() {
  if (!playCtl) return;
  var ctl = playCtl;
  if (ctl.token !== playToken) return;
  if (ctl.idx >= ctl.tl.length) { finalize(ctl.token); return; }
  var ev = ctl.tl[ctl.idx++];
  var gap;
  if (ev.t === 'log') { appendLog(ev.level, ev.text); gap = 150; }
  else { flyPacket(ev); appendLog('info', ev.proto + ': ' + (byId(ev.from) || {}).name + ' → ' + (byId(ev.to) || {}).name); gap = 300; }
  ctl.timer = setTimeout(playStep, gap);
}
function finalize(token) {
  if (token !== playToken) return;
  playCtl = null;
  skipBtn.hidden = true;
  if (!currentRes) return;
  lastModel = currentRes.errors.length ? null : currentRes.model;
  renderDevices();
  renderResults(currentRes);
}
function skip() {
  if (!playCtl) return;
  clearTimeout(playCtl.timer);
  var ctl = playCtl;
  for (var i = ctl.idx; i < ctl.tl.length; i++) {
    var ev = ctl.tl[i];
    if (ev.t === 'log') appendLog(ev.level, ev.text);
  }
  finalize(ctl.token);
}
function run(opts) {
  opts = opts || {};
  var instant = !!opts.instant || typeof window !== 'undefined' && window.LAB_INSTANT === true;
  if (playCtl) { clearTimeout(playCtl.timer); playCtl = null; }
  playToken++;
  resultsEl.hidden = true;
  resultsEl.innerHTML = '';
  logLines.innerHTML = '';
  logBox.hidden = false;
  lastModel = null;
  renderDevices();

  var res = (typeof LabEngine !== 'undefined') ? LabEngine.run(state) : { errors: ['Движок не загружен'], warnings: [] };
  currentRes = res;

  if (res.errors.length) {
    res.errors.forEach(function (e) { appendLog('err', '✗ ' + e); });
    res.warnings.forEach(function (w) { appendLog('warn', '⚠ ' + w); });
    finalize(playToken);
    return;
  }
  res.warnings.forEach(function (w) { appendLog('warn', '⚠ ' + w); });

  if (instant) {
    res.timeline.forEach(function (ev) { if (ev.t === 'log') appendLog(ev.level, ev.text); });
    finalize(playToken);
    return;
  }
  playCtl = { idx: 0, tl: res.timeline, token: playToken, timer: null };
  skipBtn.hidden = false;
  playStep();
}

/* ---------- Результаты ---------- */
function renderResults(res) {
  var html = '';
  if (res.errors.length) {
    html += '<div class="res-card"><div class="res-head">❌ Схема не прошла проверку — ошибок: ' + res.errors.length + '</div><div class="res-body">' +
      '<ul class="check-list">' +
      res.errors.map(function (e) { return '<li class="err"><span class="ci">✗</span><span>' + esc(e) + '</span></li>'; }).join('') +
      res.warnings.map(function (w) { return '<li class="warn"><span class="ci">⚠</span><span>' + esc(w) + '</span></li>'; }).join('') +
      '</ul><p class="fs-hint">Исправьте схему или настройки и нажмите «▶ Запустить модель» ещё раз.</p>' +
      '</div></div>';
  } else {
    html += '<div class="res-summary"><h3>✅ Проверка учебной модели пройдена</h3>' +
      '<p>Показан предполагаемый путь, реальные пакеты не отправлялись. DHCP-адреса на карте — примеры. Ниже — проект настроек для проверки на реальном оборудовании.</p></div>';
    if (res.warnings.length) {
      html += '<div class="res-card"><div class="res-head">⚠ Предупреждения: ' + res.warnings.length + '</div><div class="res-body"><ul class="check-list">' +
        res.warnings.map(function (w) { return '<li class="warn"><span class="ci">⚠</span><span>' + esc(w) + '</span></li>'; }).join('') +
        '</ul></div></div>';
    }
    html += '<div class="res-card"><div class="res-head">🗺 Карта адресации</div><div class="res-body"><div class="tbl"><table class="data">' +
      '<thead><tr><th>Устройство</th><th>Роль</th><th>IP-адрес</th><th>Шлюз</th><th>DNS</th><th>Источник</th></tr></thead><tbody>' +
      res.addrRows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
      }).join('') +
      '</tbody></table></div></div></div>';
    html += '<div class="note">Порты назначаются по порядку создания линий к MikroTik. Подключите кабели согласно карте ниже; для DHCP-клиентов настройте автоматическое получение IP, для статических — адрес, шлюз и DNS из таблицы. Пароль PPPoE присутствует в командах: не публикуйте их.</div>';
    html += '<div class="res-card"><div class="res-head">🔌 Подключения MikroTik</div><div class="res-body"><ul>' +
      res.model.isps.map(function(i) { return '<li>' + esc(i.phys) + ' → ' + esc(i.name) + ' (' + esc(i.kind) + ', ' + (i.priority === 'primary' ? 'основной' : 'резервный') + ')</li>'; }).join('') +
      res.model.router.lanPorts.map(function(p) { return '<li>' + esc(p.phys) + ' → ' + esc(p.dev.name) + '</li>'; }).join('') + '</ul></div></div>';
    html += '<div class="res-card" id="lab-winbox"><div class="res-head">🖥 Пошаговая настройка через WinBox</div><div class="res-body">' +
      '<div class="note">Изображения ниже — схематичные иллюстрации WinBox с примерными данными, не снимки вашего роутера. Вводите значения из текста и карты адресов. Интерфейс зависит от версии RouterOS.</div>';
    res.winbox.forEach(function (step, i) {
      html += '<section class="lab-winbox-step"><h3>' + (i + 1) + '. ' + esc(step.title) + '</h3>' +
        (step.image ? '<figure class="shot"><img src="assets/img/' + esc(step.image) + '" alt="Иллюстрация WinBox: ' + esc(step.title) + '" loading="lazy"><figcaption>Иллюстрация: пример окна WinBox, значения на ней могут отличаться.</figcaption></figure>' : '') +
        '<ol>' + step.instructions.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ol></section>';
    });
    html += '</div></div>';
    html += '<div class="res-card"><div class="res-head">⚙ Проект настроек RouterOS</div><div class="res-body">';
    res.groups.forEach(function (g, i) {
      html += '<details class="cmd-group"' + (i < 2 ? ' open' : '') + '><summary>' + esc(g.title) + '</summary><div class="cg-body">' +
        '<div class="codeblock"><div class="code-head"><span class="ch-lang">RouterOS</span><button type="button" class="copy-btn" data-copy="labg' + i + '">Копировать</button></div><pre><code id="labg' + i + '">' + esc(g.code) + '</code></pre></div>' +
        '</div></details>';
    });
    html += '<p class="fs-hint">Проект рассчитан на чистую конфигурацию RouterOS 7. Перед применением сделайте резервную копию, сверьте порты, модель и существующие правила; выполняйте группы по порядку с локальным доступом. Протестируйте на реальном оборудовании.</p>';
    html += '</div></div>';
  }
  resultsEl.innerHTML = html;
  resultsEl.hidden = false;
}

/* ---------- Настройки устройства (модальное окно) ---------- */
var editingId = null;
function f(id, label, type, value, attrs) {
  return '<label>' + esc(label) + '<input id="' + id + '" type="' + type + '" value="' + esc(value == null ? '' : value) + '" ' + (attrs || '') + '></label>';
}
function sel(id, label, options, value) {
  return '<label>' + esc(label) + '<select id="' + id + '">' +
    options.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (o[0] === value ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select></label>';
}
function chk(id, label, on) {
  return '<label class="row-check"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + esc(label) + '</label>';
}
function openSettings(id) {
  var d = byId(id);
  if (!d) return;
  editingId = id;
  var c = d.cfg;
  var html = f('lm_name', 'Название устройства', 'text', d.name, 'spellcheck="false"');
  if (d.type === 'router') {
    html += '<div class="lm-grid">' + f('lm_lan', 'Подсеть LAN (CIDR)', 'text', c.lan, 'spellcheck="false" list="dl-net"') +
      f('lm_gw', 'IP роутера (шлюз)', 'text', c.gw, 'list="dl-ip" inputmode="decimal"') + '</div>';
    html += '<div class="lm-t">Роли MikroTik:</div>' +
      chk('lm_dhcp', 'DHCP-сервер в LAN', c.dhcp) +
      chk('lm_nat', 'NAT (masquerade) — выход в интернет', c.nat) +
      chk('lm_fw', 'Firewall — правила защиты', c.firewall) +
      chk('lm_vpn', 'VPN-сервер', c.vpn) +
      '<p class="fs-hint">VPN пока не моделируется: при включении карта команд не формируется. Для VPN используйте отдельный раздел учебника.</p>';
    html += '<div id="lm_vpn_box"' + (c.vpn ? '' : ' hidden') + '><div class="lm-grid">' +
      sel('lm_vpn_type', 'Тип VPN', [['wireguard', 'WireGuard'], ['ikev2', 'IPsec IKEv2'], ['l2tp-ipsec', 'L2TP/IPsec']], c.vpnType) +
      f('lm_vpn_port', 'Порт/слушать', 'text', c.vpnPort, 'list="dl-port" inputmode="numeric"') +
      f('lm_vpn_pool', 'Пул VPN (CIDR)', 'text', c.vpnPool, 'list="dl-net"') + '</div></div>';
  } else if (d.type === 'isp') {
    html += sel('lm_priority', 'Роль канала', [['primary', 'Основной'], ['backup', 'Резервный']], c.priority || 'primary');
    html += sel('lm_kind', 'Тип подключения', [['pppoe', 'PPPoE (логин/пароль)'], ['dhcp', 'DHCP (авто)'], ['static', 'Статический IP'], ['lte', 'USB 3G/LTE-модем']], c.kind);
    html += '<div id="lm_g_pppoe"' + (c.kind === 'pppoe' ? '' : ' hidden') + '><div class="lm-grid">' +
      f('lm_user', 'Логин PPPoE', 'text', c.user, 'spellcheck="false"') +
      f('lm_pass', 'Пароль PPPoE', 'text', c.pass, 'spellcheck="false"') + '</div></div>';
    html += '<div id="lm_g_static"' + (c.kind === 'static' ? '' : ' hidden') + '><div class="lm-grid">' +
      f('lm_ip', 'IP роутера (CIDR)', 'text', c.ip, 'list="dl-wan" inputmode="decimal"') +
      f('lm_gw2', 'Шлюз провайдера', 'text', c.gw, 'list="dl-wan" inputmode="decimal"') +
      f('lm_dns', 'DNS провайдера', 'text', c.dns, 'list="dl-dns" inputmode="decimal"') + '</div></div>';
    html += '<div id="lm_g_lte"' + (c.kind === 'lte' ? '' : ' hidden') + '><div class="lm-grid">' +
      f('lm_apn', 'APN', 'text', c.apn || 'internet', 'spellcheck="false"') + '</div></div>';
  } else if (d.type !== 'switch') {
    html += sel('lm_mode', 'Получение адреса', [['static', 'Статический IP'], ['dhcp', 'DHCP (авто)']], c.mode || 'static');
    html += '<div id="lm_g_static_ep"' + ((c.mode || 'static') === 'static' ? '' : ' hidden') + '><div class="lm-grid">' +
      f('lm_ip2', 'IP/маска', 'text', c.ip, 'list="dl-net" inputmode="decimal"') +
      f('lm_gw2', 'Шлюз', 'text', c.gw, 'list="dl-ip" inputmode="decimal"') +
      f('lm_ep_dns', 'DNS (необязательно)', 'text', c.dns || '', 'list="dl-dns" inputmode="decimal"') + '</div>' +
      '<button type="button" class="btn ghost lm-mini" id="lm_fill_gw">↳ подставить IP роутера</button></div>';
  } else {
    html += '<p class="fs-hint">В этой модели коммутатор работает как неуправляемый L2. Он просто объединяет сегменты в один широковещательный домен.</p>';
  }
  html += '<div class="fs-hint">Изменения применяются сразу после сохранения — карта настроек пересчитается при запуске.</div>';

  lmTitle.textContent = '⚙ ' + TYPES[d.type].label + ' — настройки';
  lmBody.innerHTML = html;
  lmErr.hidden = true;
  modal.hidden = false;

  var kindSel = $('lm_kind'), modeSel = $('lm_mode'), vpnChk = $('lm_vpn');
  function applyVis() {
    if (kindSel) {
      $('lm_g_pppoe').hidden = kindSel.value !== 'pppoe';
      $('lm_g_static').hidden = kindSel.value !== 'static';
      $('lm_g_lte').hidden = kindSel.value !== 'lte';
    }
    if (modeSel) $('lm_g_static_ep').hidden = modeSel.value !== 'static';
    if (vpnChk) $('lm_vpn_box').hidden = !vpnChk.checked;
  }
  [kindSel, modeSel, vpnChk].forEach(function (e2) {
    if (e2) e2.addEventListener('change', applyVis);
  });
  var fill = $('lm_fill_gw');
  if (fill) fill.addEventListener('click', function () {
    var rt = state.devices.filter(function (x) { return x.type === 'router'; })[0];
    if (rt) $('lm_gw2').value = rt.cfg.gw;
  });
  applyVis();
}
function lmFail(msg) {
  lmErr.textContent = msg;
  lmErr.hidden = false;
}
function saveSettings() {
  var d = byId(editingId);
  if (!d) { modal.hidden = true; return; }
  var name = ($('lm_name').value || '').trim() || TYPES[d.type].defName(countType(d.type) + 1);
  var c = d.cfg;
  var E = (typeof LabEngine !== 'undefined') ? LabEngine : null;

  if (d.type === 'router') {
    var lan = $('lm_lan').value.trim(), gw = $('lm_gw').value.trim();
    if (!E || !E.parseCidr(lan)) return lmFail('Подсеть LAN задана неверно — нужен вид 192.168.88.0/24');
    if (!E.validIp(gw)) return lmFail('IP роутера задан неверно — нужен вид 192.168.88.1');
    if (!E.parseCidr(lan).contains(gw)) return lmFail('IP роутера не входит в подсеть LAN');
    if (gw === E.parseCidr(lan).first || gw === E.parseCidr(lan).last)
      return lmFail('Сетевой и широковещательный адрес нельзя назначать роутеру');
    var vpn = $('lm_vpn').checked;
    var vp = { lan: lan, gw: gw, dhcp: $('lm_dhcp').checked, nat: $('lm_nat').checked,
      firewall: $('lm_fw').checked, vpn: vpn,
      vpnType: $('lm_vpn_type').value, vpnPort: $('lm_vpn_port').value.trim(), vpnPool: $('lm_vpn_pool').value.trim() };
    if (vpn && !E.parseCidr(vp.vpnPool)) return lmFail('Пул VPN задан неверно — нужен вид 10.10.10.0/24');
    if (vpn && !/^\d{1,5}$/.test(vp.vpnPort)) return lmFail('Порт VPN — число');
    Object.assign(c, vp);
  } else if (d.type === 'isp') {
    var kind = $('lm_kind').value;
    var nc = { kind: kind };
    if (kind === 'pppoe') {
      nc.user = $('lm_user').value.trim();
      nc.pass = $('lm_pass').value.trim();
      if (!nc.user || !nc.pass) return lmFail('Для PPPoE нужны логин и пароль');
    } else if (kind === 'static') {
      nc.ip = $('lm_ip').value.trim();
      nc.gw = $('lm_gw2').value.trim();
      nc.dns = $('lm_dns').value.trim();
      if (!E || !E.parseCidr(nc.ip)) return lmFail('IP роутера задан неверно — нужен вид 198.51.100.2/30');
      if (!E.validIp(nc.gw)) return lmFail('Шлюз провайдера задан неверно — нужен вид 198.51.100.1');
    } else if (kind === 'lte') {
      nc.apn = $('lm_apn').value.trim() || 'internet';
    }
    nc.priority = $('lm_priority').value;
    Object.assign(c, nc);
    state.devices.forEach(function (other) {
      if (other.type === 'isp' && other.id !== d.id) other.cfg.priority = nc.priority === 'primary' ? 'backup' : 'primary';
    });
  } else if (d.type !== 'switch') {
    var md = $('lm_mode').value;
    if (md === 'static') {
      var ip = $('lm_ip2').value.trim(), gwv = $('lm_gw2').value.trim();
      if (!E || !E.parseCidr(ip)) return lmFail('Адрес задан неверно — нужен вид 192.168.88.10/24');
      if (gwv && !E.validIp(gwv)) return lmFail('Шлюз задан неверно — нужен вид 192.168.88.1');
      var dns = $('lm_ep_dns').value.trim();
      if (dns && !E.validIp(dns)) return lmFail('DNS задан неверно');
      Object.assign(c, { mode: 'static', ip: ip, gw: gwv, dns: dns });
    } else {
      Object.assign(c, { mode: 'dhcp' });
    }
  }
  d.name = name;
  modal.hidden = true;
  editingId = null;
  invalidate();
  renderAll();
}

/* ---------- Инициализация ---------- */
function init() {
  canvas = $('lab-canvas');
  if (!canvas) return;
  svg = $('lab-svg');
  hintEl = $('lab-hint');
  emptyEl = $('lab-empty');
  inspectEl = $('lab-inspect');
  logBox = $('lab-log');
  logLines = $('lab-log-lines');
  resultsEl = $('lab-results');
  runBtn = $('lab_run');
  resetBtn = $('lab_reset');
  skipBtn = $('lab_skip');
  modal = $('lab-modal');
  lmTitle = $('lm_title');
  lmBody = $('lm_body');
  lmErr = $('lm_err');
  lmSave = $('lm_save');
  lmCancel = $('lm_cancel');
  lmClose = $('lm_close');
  modeBtns = Array.prototype.slice.call(document.querySelectorAll('.lab-mode'));
  palBtns = Array.prototype.slice.call(document.querySelectorAll('.lab-pick'));

  palBtns.forEach(function (b) {
    b.addEventListener('click', function () { setPick(b.dataset.dev); });
  });
  modeBtns.forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); });
  });
  canvas.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.lab-dev')) return;
    if (e.target.classList && e.target.classList.contains('lab-link-hit')) return;
    if (mode !== 'place') return;
    if (!pickType) { updateHint(); return; }
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX || 0) - rect.left - DEV_W / 2;
    var y = (e.clientY || 0) - rect.top - DEV_H / 2;
    place(pickType, x, y);
  });
  bindDragDelegates();
  runBtn.addEventListener('click', function () {
    run({ instant: window.LAB_INSTANT === true });
  });
  $('lab_example').addEventListener('click', function () {
    resetBtn.click();
    var w = canvas.clientWidth || 800, x1 = Math.max(0, w * 0.08), x2 = Math.max(0, w * 0.52 - 48);
    var isp = place('isp', x1, 20), rt = place('router', x1, 150), sw = place('switch', x2, 250);
    var pc = place('pc', x1, 365), server = place('server', Math.max(0, w - 110), 365);
    byId(pc).cfg.mode = 'dhcp';
    addLink(isp, rt); addLink(rt, sw); addLink(sw, pc); addLink(sw, server);
    setMode('select');
  });
  resetBtn.addEventListener('click', function () {
    if (playCtl) { clearTimeout(playCtl.timer); playCtl = null; playToken++; }
    state.devices = [];
    state.links = [];
    selected = null; linkFrom = null; pickType = null;
    palBtns.forEach(function (b) { b.classList.remove('active'); });
    invalidate();
    setMode('select');
  });
  skipBtn.addEventListener('click', skip);
  lmSave.addEventListener('click', saveSettings);
  $('lm_delete').addEventListener('click', function () { if (editingId) requestDelete('dev', editingId); });
  $('lab-confirm-ok').addEventListener('click', finishDelete);
  $('lab-confirm-cancel').addEventListener('click', function () { pendingDelete = null; $('lab-confirm').hidden = true; });
  lmCancel.addEventListener('click', function () { modal.hidden = true; editingId = null; });
  lmClose.addEventListener('click', function () { modal.hidden = true; editingId = null; });
  modal.addEventListener('click', function (e) { if (e.target === modal) { modal.hidden = true; editingId = null; } });

  setMode('select');
  renderAll();
}
init();

window.addEventListener('hashchange', function () {
  if ((location.hash || '').replace(/^#/, '') !== 'lab' && playCtl) {
    clearTimeout(playCtl.timer);
    playCtl = null;
    playToken++;
    skipBtn.hidden = true;
    appendLog('info', '⏹ Запуск остановлен (вы вышли из лаборатории)');
  }
});

/* ---------- Публичный API (для тестов и отладки) ---------- */
window.Lab = {
  state: state,
  place: place,
  link: addLink,
  run: run,
  reset: function () { resetBtn.click(); },
  setMode: setMode,
  setPick: setPick,
  openSettings: openSettings,
  select: select,
  selectLink: selectLink,
  get lastModel() { return lastModel; },
  get mode() { return mode; }
};
})();
