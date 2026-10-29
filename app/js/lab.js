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
      dhcp: true, nat: true, firewall: true, vpn: false, wanFailover: false, routerFailover: true,
      wanMonitor: false, monitorHost: '9.9.9.9', staticRoute: false, routeDst: '10.20.0.0/24', routeGw: '192.168.88.254', routeDistance: '1',
      dnsCache: true, customDns: false, dnsPrimary: '1.1.1.1', dnsSecondary: '8.8.8.8', dnsStatic: false, dnsStaticName: 'server.lan', dnsStaticIp: '192.168.88.10',
      ntpClient: false, ntpServer: 'pool.ntp.org', timeZone: 'Etc/UTC', cloudDdns: false, identityOn: false, systemIdentity: 'MikroTik-Lab',
      vlanGuest: false, guestVlan: '20', guestNet: '192.168.99.0/24', guestGw: '192.168.99.1', guestDhcp: true,
      wifiAp: false, wifiIf: 'wifi1', wifiCountry: '', wifiSsid: 'MikroTik-LAN', wifiPass: '', wifiGuest: false, wifiGuestSsid: 'MikroTik-Guest', wifiGuestPass: '',
      vpnType: 'wireguard', vpnPort: '13231', vpnPool: '10.10.10.0/24', vpnPeer: '', vpnUser: '', vpnPass: '', vpnPsk: '', vpnServerCert: '', vpnClientCert: '' }; } },
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
var currentRes = null, flowEnabled = false;

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
      (linkFrom === d.id ? ' linksrc' : '') + (d.on === false ? ' powered-off' : '');
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
      if (d.cfg.vlanGuest) roles.push('VLAN');
      if (d.cfg.wifiAp) roles.push('Wi-Fi');
      badge = '<span class="lab-ip">' + esc(roles.join('·') || 'роли —') + '</span>';
    }
    el.innerHTML = '<div class="lab-ico">' + ICONS[d.type] + '</div>' +
      '<div class="lab-nm">' + esc(d.name) + '</div>' + badge +
      '<button type="button" class="lab-power" aria-label="' + (d.on === false ? 'Включить ' : 'Выключить ') + esc(d.name) + '" title="' + (d.on === false ? 'Включить' : 'Выключить') + '" aria-pressed="' + (d.on !== false) + '">' + (d.on === false ? 'OFF' : 'ON') + '</button>' +
      '<button type="button" class="lab-gear" aria-label="Настроить ' + esc(d.name) + '" title="Настроить ' + esc(d.name) + '">⚙</button>';
    var power = el.querySelector('.lab-power');
    power.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    power.addEventListener('touchstart', function(e) { e.stopPropagation(); });
    power.addEventListener('click', function(e) { e.stopPropagation(); togglePower(d.id); });
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
function linkPoints(l) {
  var a = byId(l.a), b = byId(l.b); if (!a || !b) return null;
  var A = center(a), B = center(b);
  var peers = state.links.filter(function(x) { return (x.a === l.a && x.b === l.b) || (x.a === l.b && x.b === l.a); });
  var idx = peers.indexOf(l), delta = (idx - (peers.length - 1) / 2) * 18;
  var dx = B.x - A.x, dy = B.y - A.y, len = Math.sqrt(dx*dx + dy*dy) || 1;
  // Normal is calculated in canonical device order, even for reversed links.
  var sign = l.a < l.b ? 1 : -1, nx = -dy / len * sign, ny = dx / len * sign;
  return {A:{x:A.x + nx*delta,y:A.y + ny*delta}, B:{x:B.x + nx*delta,y:B.y + ny*delta}};
}
function cardsOf(d) { return ['nic1'].concat((d.cfg.nics || []).map(function(n) {return n.id;})); }
function cardUsed(d, card, except) { return state.links.some(function(l) { return l.id !== except && (l.a === d.id || l.b === d.id) && (l.nicId || 'nic1') === card; }); }
function cardName(id) { return 'Карта ' + String(id || 'nic1').slice(3); }
function renderLinks() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  state.links.forEach(function (l) {
    var a = byId(l.a), b = byId(l.b);
    if (!a || !b) return;
    var geo = linkPoints(l), A = geo.A, B = geo.B;
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
    mid.textContent = wan ? 'WAN' : (l.nicId ? 'LAN · ' + cardName(l.nicId) : 'LAN');
    svg.appendChild(mid);
  });
  if (flowEnabled && typeof LabEngine !== 'undefined') {
    var drawn = Object.create(null), routes = LabEngine.activeRoutes(state);
    routes.forEach(function(route) {
      for (var i = 0; i < route.path.length - 1; i++) {
        var from = route.path[i], to = route.path[i + 1], linkId = route.linkIds && route.linkIds[i], key = linkId || [from,to].sort().join('|');
        if (drawn[key]) continue; drawn[key] = true;
        var lg = findLinkEl(from,to,linkId); if (!lg) continue;
        var A = lg.reverse ? lg.B : lg.A, B = lg.reverse ? lg.A : lg.B;
        svg.appendChild(svgEl('line', { class:'lab-flow lab-flow-out', x1:A.x, y1:A.y-3, x2:B.x, y2:B.y-3 }));
        svg.appendChild(svgEl('line', { class:'lab-flow lab-flow-back', x1:B.x, y1:B.y+3, x2:A.x, y2:A.y+3 }));
      }
    });
    var status = $('lab-flow-status');
    if (status) {
      status.hidden = false;
      if (!routes.length) status.textContent = 'Нет активного пути в модели: проверьте ON/OFF и резервирование.';
      else { var r = byId(routes[0].router), i = byId(routes[0].isp); status.textContent = 'Учебный трафик туда/обратно: ' + r.name + ' → ' + i.name + '. Реальные пакеты не отправляются.'; }
    }
  }
}

function togglePower(id) {
  var d = byId(id); if (!d) return;
  d.on = d.on === false;
  if (playCtl) { clearTimeout(playCtl.timer); playCtl = null; playToken++; skipBtn.hidden = true; if (currentRes) { lastModel = currentRes.model; renderResults(currentRes); } }
  renderAll();
  if (flowEnabled) appendLog('info', d.name + (d.on ? ': ON. ' : ': OFF. ') + (LabEngine.activeRoutes(state).length ? 'Маршрут модели пересчитан.' : 'Активного пути нет.'));
}

function toggleProbe(id) {
  var d = byId(id); if (!d || d.type !== 'router' || !d.cfg.wanMonitor) return;
  d.probeOn = d.probeOn === false;
  if (playCtl) { clearTimeout(playCtl.timer); playCtl = null; playToken++; skipBtn.hidden = true; if (currentRes) { lastModel = currentRes.model; renderResults(currentRes); } }
  renderAll();
  if (flowEnabled) appendLog('warn', 'Контрольный узел: ' + (d.probeOn ? 'условно восстановлен' : 'условно недоступен') + '. Реальный ping не выполнялся; маршрут модели пересчитан.');
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
    var direct = (a.type === 'router' && (b.type === 'pc' || b.type === 'server')) ? b : (b.type === 'router' && (a.type === 'pc' || a.type === 'server')) ? a : null;
    var endpoint = (a.type === 'pc' || a.type === 'server') ? a : (b.type === 'pc' || b.type === 'server') ? b : null;
    var cardOptions = endpoint ? cardsOf(endpoint).map(function(id) { return '<option value="' + esc(id) + '"' + ((l.nicId || 'nic1') === id ? ' selected' : '') + (cardUsed(endpoint,id,l.id) ? ' disabled' : '') + '>' + esc(cardName(id)) + (cardUsed(endpoint,id,l.id) ? ' (занята)' : '') + '</option>'; }).join('') : '';
    inspectEl.innerHTML = '<div class="insp-t">🔗 Линия связи: ' + esc(a.name) + ' — ' + esc(b.name) + '</div>' +
      '<div class="insp-sub">' + esc((a.type === 'isp' || b.type === 'isp') && (a.type === 'router' || b.type === 'router') ? 'WAN-канал' : 'LAN-сегмент') + '</div>' +
      (endpoint ? '<label>Сетевая карта «' + esc(endpoint.name) + '» <select id="insp_nic">' + cardOptions + '</select></label>' : '') +
      '<div class="insp-acts">' + (direct ? '<button type="button" class="btn ghost" id="insp_ext">⚙ Доступ извне и порты</button>' : '') + '<button type="button" class="btn danger-ghost" id="insp_del">✕ Удалить линию</button></div>';
    if (endpoint) $('insp_nic').addEventListener('change', function() { l.nicId = this.value; invalidate(); renderAll(); });
    if (direct) $('insp_ext').addEventListener('click', function () { openSettings(direct.id); });
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
    if (d.cfg.vlanGuest) roles.push('гостевой VLAN');
    if (d.cfg.wifiAp) roles.push('Wi-Fi');
    sub = esc(d.cfg.lan) + ' · ' + (d.cfg.routerRole === 'backup' ? 'резервный' : 'основной') + ' · роли: ' + esc(roles.join(', ') || 'не заданы');
  } else if (d.type === 'isp') {
    sub = { pppoe: 'PPPoE: логин/пароль', dhcp: 'DHCP — авто', static: 'Статический IP', lte: 'USB 3G/LTE' }[d.cfg.kind];
    sub = esc(sub) + ' · ' + (d.cfg.priority === 'backup' ? 'резервный' : 'основной');
  } else if (d.type === 'switch') {
    sub = 'Коммутатор L2 — просто соединяет сегменты';
  } else {
    sub = (d.type === 'pc' || d.type === 'server' ? 'Сетевых карт: ' + cardsOf(d).length + ' · ' : '') + (d.cfg.segment === 'guest' ? 'гостевой VLAN · ' : 'основная LAN · ') + (d.cfg.mode === 'dhcp' ? 'получает адрес по DHCP' : 'статический: ' + esc(d.cfg.ip));
  }
  inspectEl.innerHTML = '<div class="insp-t">' + esc(d.name) + '</div><div class="insp-sub">' + sub + '</div>' +
    '<div class="insp-acts">' +
    '<button type="button" class="btn ghost" id="insp_cfg">⚙ Настроить</button>' +
    (d.type === 'router' && d.cfg.wanMonitor ? '<button type="button" class="btn ghost" id="insp_probe">' + (d.probeOn === false ? '↻ Узел: восстановить' : '⚡ Узел: имитировать сбой') + '</button>' : '') +
    '<button type="button" class="btn danger-ghost" id="insp_del">✕ Удалить</button></div>';
  inspectEl.hidden = false;
  $('insp_cfg').addEventListener('click', function () { openSettings(d.id); });
  if ($('insp_probe')) $('insp_probe').addEventListener('click', function() { toggleProbe(d.id); });
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
  if (type === 'router') d.cfg.routerRole = countType('router') ? 'backup' : 'primary';
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
  var da = byId(a), db = byId(b);
  var endpoint = (da.type === 'pc' || da.type === 'server') ? da : (db.type === 'pc' || db.type === 'server') ? db : null;
  var otherEndpoint = endpoint && (da.type === 'pc' || da.type === 'server') && (db.type === 'pc' || db.type === 'server');
  var dup = state.links.some(function (l) { return (l.a === a && l.b === b) || (l.a === b && l.b === a); });
  if (otherEndpoint || (dup && !endpoint)) return null;
  var free = endpoint && cardsOf(endpoint).filter(function(card) { return !cardUsed(endpoint,card); })[0];
  if (endpoint && !free) return null;
  var id = nid('l'), link = { id:id, a:a, b:b };
  if (endpoint) link.nicId = free;
  state.links.push(link);
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
    if (!made) { hintEl.textContent = 'Линию создать нельзя: проверьте свободную сетевую карту и типы устройств.'; }
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
    if (e.target.closest && e.target.closest('.lab-gear, .lab-power')) return;
    var el = e.target.closest ? e.target.closest('.lab-dev') : null;
    if (!el || !el.dataset.id) return;
    var d = byId(el.dataset.id);
    if (d) startDrag(d, el, e.clientX, e.clientY);
  });
  canvas.addEventListener('touchstart', function (e) {
    if (e.target.closest && e.target.closest('.lab-gear, .lab-power')) return;
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
function findLinkEl(from, to, linkId) {
  var l = state.links.filter(function (x) {
    return (!linkId || x.id === linkId) && ((x.a === from && x.b === to) || (x.a === to && x.b === from));
  })[0];
  if (!l) return null;
  var a = byId(l.a), b = byId(l.b);
  if (!a || !b) return null;
  var p = linkPoints(l); return { A: p.A, B: p.B, reverse: l.b === from };
}
function flyPacket(ev) {
  if (typeof window.requestAnimationFrame !== 'function') return;
  var geo = findLinkEl(ev.from, ev.to, ev.linkId);
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
  flowEnabled = false;
  if ($('lab-flow-status')) $('lab-flow-status').hidden = true;
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
  flowEnabled = false;
  if ($('lab-flow-status')) $('lab-flow-status').hidden = true;
  renderLinks();
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
  flowEnabled = true;
  renderLinks();

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
      '<p>Показан предполагаемый путь, реальные пакеты не отправлялись. DHCP-адреса на карте — примеры. ' + (res.dual ? 'Для двух роутеров ниже приведён только план VRRP, настройка выполняется вручную.' : 'Ниже — проект настроек для проверки на реальном оборудовании.') + '</p></div>';
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
    html += '<div class="note">' + (res.dual ? 'При двух роутерах номера портов согласуйте вручную. ' : 'Порты назначаются по порядку создания линий к MikroTik. ' ) + ' Подключите кабели согласно карте ниже; для DHCP-клиентов настройте автоматическое получение IP, для статических — адрес, шлюз и DNS из таблицы. Пароли и ключи могут присутствовать в командах: не публикуйте их.</div>';
    html += '<div class="res-card"><div class="res-head">🔌 Подключения MikroTik</div><div class="res-body"><ul>' +
      (res.dual ? '<li>Два MikroTik: см. соединения на схеме; номера портов и VRRP необходимо согласовать вручную.</li>' : res.model.isps.map(function(i) { return '<li>' + esc(i.phys) + ' → ' + esc(i.name) + ' (' + esc(i.kind) + ', ' + (i.priority === 'primary' ? 'основной' : 'резервный') + ')</li>'; }).join('') +
      res.model.router.lanPorts.map(function(p) { return '<li>' + esc(p.phys) + ' → ' + esc(p.dev.name) + (res.model.router.cfg.vlanGuest ? ' (' + (p.segment === 'guest' ? 'гостевой VLAN ' + esc(res.model.router.cfg.guestVlan) : 'основная LAN') + ')' : '') + '</li>'; }).join('')) + '</ul></div></div>';
    html += '<div class="res-card" id="lab-winbox"><div class="res-head">🖥 Пошаговая настройка через WinBox</div><div class="res-body">' +
      '<div class="note">Снимки ниже — примеры из официальной документации и сторонних источников, не снимки вашего роутера. Используйте значения из текста и карты адресов. Интерфейс зависит от версии WinBox и RouterOS.</div>';
    res.winbox.forEach(function (step, i) {
      html += '<section class="lab-winbox-step"><h3>' + (i + 1) + '. ' + esc(step.title) + '</h3>' +
        (step.image ? '<figure class="shot"><img src="assets/img/' + esc(step.image) + '" alt="Снимок WinBox: ' + esc(step.title) + '" loading="lazy"><figcaption>Снимок из документации MikroTik: значения на нём могут отличаться. <a href="' + (step.image === 'official/winbox-login.png' ? 'https://help.mikrotik.com/docs/spaces/ROS/pages/328129/WinBox' : 'https://help.mikrotik.com/docs/spaces/ROS/pages/328151/First+Time+Configuration') + '">Источник</a></figcaption><button class="shot-zoom" type="button">🔍 Увеличить</button></figure>' : '') +
        '<ol>' + step.instructions.map(function (item, itemIndex) {
          var pictures = (step.illustrations || []).filter(function (pic) { return pic.after === itemIndex; }).map(function (pic) {
            return '<figure class="shot"><img src="assets/img/' + esc(pic.image) + '" alt="' + esc(pic.caption) + '" loading="lazy"><figcaption>' + esc(pic.caption) + ' <a href="' + esc(pic.source) + '">Источник: ' + esc(pic.sourceName) + '</a></figcaption><button class="shot-zoom" type="button">🔍 Увеличить</button></figure>';
          }).join('');
          return '<li>' + esc(item) + pictures + '</li>';
        }).join('') + '</ol></section>';
    });
    html += '</div></div>';
    html += '<div class="res-card"><div class="res-head">⚙ ' + (res.dual ? 'План VRRP — требуется ручная настройка' : 'Проект настроек RouterOS') + '</div><div class="res-body">';
    res.groups.forEach(function (g, i) {
      html += '<details class="cmd-group"' + (i < 2 ? ' open' : '') + '><summary>' + esc(g.title) + '</summary><div class="cg-body">' +
        '<div class="codeblock"><div class="code-head"><span class="ch-lang">RouterOS</span><button type="button" class="copy-btn" data-copy="labg' + i + '">Копировать</button></div><pre><code id="labg' + i + '">' + esc(g.code) + '</code></pre></div>' +
        '</div></details>';
    });
    html += '<p class="fs-hint">' + (res.dual ? 'Для двух роутеров выше приведён только план, не готовый проект команд. ' : '') + 'Проект рассчитан на чистую конфигурацию RouterOS 7. Перед применением сделайте резервную копию, сверьте порты, модель и существующие правила; выполняйте группы по порядку с локальным доступом. Протестируйте на реальном оборудовании.</p>';
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
    html += sel('lm_router_role', 'Роль MikroTik', [['primary', 'Основной'], ['backup', 'Резервный']], c.routerRole || 'primary');
    html += '<div class="lm-grid">' + f('lm_lan', 'Подсеть LAN (CIDR)', 'text', c.lan, 'spellcheck="false" list="dl-net"') +
      f('lm_gw', 'IP роутера (шлюз)', 'text', c.gw, 'list="dl-ip" inputmode="decimal"') + '</div>';
    html += '<div class="lm-t">Роли MikroTik:</div>' +
      chk('lm_dhcp', 'DHCP-сервер в LAN', c.dhcp) +
      chk('lm_nat', 'NAT (masquerade) — выход в интернет', c.nat) +
      chk('lm_fw', 'Firewall — правила защиты', c.firewall) +
      chk('lm_wan_failover', 'Резервный интернет с автопереключением (при двух провайдерах)', c.wanFailover !== false) +
      chk('lm_router_failover', 'Учебное переключение на резервный MikroTik (задаётся на основном)' , c.routerFailover !== false) +
      chk('lm_vpn', 'VPN-сервер', c.vpn) +
      '<p class="fs-hint">Переключение в модели условное. Для реальной доступности интернета и резервирования двух роутеров нужна отдельная проверка оборудования и VRRP.</p>';
    html += '<div class="lm-t">LAN, VLAN и Wi‑Fi</div>' +
      '<p class="fs-hint">LAN — основная сеть моста. Гостевой VLAN создаёт отдельную подсеть; у каждого ПК/сервера/принтера выберите сегмент. Одно подключение неуправляемого коммутатора может нести только один сегмент.</p>' +
      chk('lm_guest_vlan', 'Гостевой VLAN и изоляция от LAN', c.vlanGuest) +
      '<div id="lm_guest_vlan_box"' + (c.vlanGuest ? '' : ' hidden') + '><div class="lm-grid">' +
      f('lm_guest_vlan_id', 'VLAN ID (2–4094)', 'text', c.guestVlan || '20', 'inputmode="numeric"') +
      f('lm_guest_net', 'Гостевая подсеть /24', 'text', c.guestNet || '192.168.99.0/24', 'spellcheck="false"') +
      f('lm_guest_gw', 'Гостевой шлюз', 'text', c.guestGw || '192.168.99.1', 'inputmode="decimal"') + '</div>' +
      chk('lm_guest_dhcp', 'DHCP гостевого сегмента (пул .100–.199)', c.guestDhcp !== false) +
      '<p class="fs-hint">Гости получают доступ в WAN и к DNS/DHCP роутера, но не в основную LAN. Для этого обязателен Firewall. Клиенты одного гостевого сегмента могут общаться друг с другом.</p></div>' +
      chk('lm_wifi_ap', 'Рабочая точка доступа Wi‑Fi (пакет wifi)', c.wifiAp) +
      '<div id="lm_wifi_box"' + (c.wifiAp ? '' : ' hidden') + '><div class="lm-grid">' +
      f('lm_wifi_if', 'Имя радио-интерфейса', 'text', c.wifiIf || 'wifi1', 'spellcheck="false"') +
      f('lm_wifi_country', 'Страна точно как в RouterOS', 'text', c.wifiCountry || '', 'spellcheck="false" placeholder="Например: Belarus"') +
      f('lm_wifi_ssid', 'SSID основной сети', 'text', c.wifiSsid || 'MikroTik-LAN', 'spellcheck="false"') +
      f('lm_wifi_pass', 'Пароль WPA2 (8–63 символа ASCII)', 'password', c.wifiPass || '', 'autocomplete="new-password"') + '</div>' +
      chk('lm_wifi_guest', 'Гостевой Wi‑Fi (виртуальный SSID в гостевом VLAN)', c.wifiGuest) +
      '<div id="lm_wifi_guest_box"' + (c.wifiGuest ? '' : ' hidden') + '><div class="lm-grid">' +
      f('lm_wifi_guest_ssid', 'SSID гостей', 'text', c.wifiGuestSsid || 'MikroTik-Guest', 'spellcheck="false"') +
      f('lm_wifi_guest_pass', 'Пароль гостей WPA2', 'password', c.wifiGuestPass || '', 'autocomplete="new-password"') + '</div></div>' +
      '<p class="fs-hint">RouterOS 7.13+ с пакетом wifi и поддержкой AP/виртуального интерфейса. Для старого wireless и wifiwave2 команды отличаются; радио и покрытие не эмулируются. Пароли попадут в проект команд.</p></div>' +
      '<p class="fs-hint"><a id="lm_network_guide" href="#networks">Подробные инструкции по LAN, VLAN и Wi‑Fi в учебнике</a></p>';
    html += '<div class="lm-t">Маршрутизация и системные службы</div>' +
      chk('lm_wan_monitor', 'Проверять основной WAN по внешнему IPv4 (статический WAN)', c.wanMonitor) +
      '<div id="lm_monitor_box"' + (c.wanMonitor ? '' : ' hidden') + '>' + f('lm_monitor_host', 'Контрольный IPv4 (ICMP)', 'text', c.monitorHost || '9.9.9.9', 'inputmode="decimal"') + '<p class="fs-hint">Для двух каналов и включённого резервирования: рекурсивный маршрут проверяет один узел. DHCP, PPPoE и LTE как основной в этом режиме пока не поддерживаются. При выборе MikroTik можно условно имитировать сбой узла.</p></div>' +
      chk('lm_static_route', 'Статический маршрут через шлюз в основной LAN', c.staticRoute) +
      '<div id="lm_route_box"' + (c.staticRoute ? '' : ' hidden') + '><div class="lm-grid">' + f('lm_route_dst', 'Подсеть назначения', 'text', c.routeDst || '10.20.0.0/24', 'spellcheck="false"') + f('lm_route_gw', 'Шлюз в основной LAN', 'text', c.routeGw || '192.168.88.254', 'inputmode="decimal"') + f('lm_route_distance', 'Distance (1–254)', 'text', c.routeDistance || '1', 'inputmode="numeric"') + '</div><p class="fs-hint">Один маршрут к другой сети за LAN-шлюзом. Доступность следующего роутера и обратный маршрут не проверяются.</p></div>' +
      chk('lm_dns_cache', 'DNS-кэш роутера для клиентов', c.dnsCache !== false) +
      '<p class="fs-hint">Если выключить кэш, DHCP будет выдавать клиентам первый вышестоящий DNS вместо IP роутера.</p>' +
      chk('lm_custom_dns', 'Задать DNS-серверы вручную', c.customDns) +
      '<div id="lm_dns_box"' + (c.customDns ? '' : ' hidden') + '><div class="lm-grid">' + f('lm_dns_primary', 'Основной DNS IPv4', 'text', c.dnsPrimary || '1.1.1.1', 'inputmode="decimal"') + f('lm_dns_secondary', 'Второй DNS IPv4 (необязательно)', 'text', c.dnsSecondary || '', 'inputmode="decimal"') + '</div></div>' +
      chk('lm_dns_static', 'Добавить локальную DNS-запись A', c.dnsStatic) +
      '<div id="lm_dns_static_box"' + (c.dnsStatic ? '' : ' hidden') + '><div class="lm-grid">' + f('lm_dns_name', 'Имя хоста', 'text', c.dnsStaticName || 'server.lan', 'spellcheck="false"') + f('lm_dns_ip', 'IPv4 хоста', 'text', c.dnsStaticIp || '192.168.88.10', 'inputmode="decimal"') + '</div><p class="fs-hint">Клиенты должны использовать DNS роутера; существование хоста модель не проверяет.</p></div>' +
      chk('lm_ntp', 'Синхронизация времени NTP', c.ntpClient) +
      '<div id="lm_ntp_box"' + (c.ntpClient ? '' : ' hidden') + '><div class="lm-grid">' + f('lm_ntp_server', 'NTP-сервер (имя или IPv4)', 'text', c.ntpServer || 'pool.ntp.org', 'spellcheck="false"') + f('lm_timezone', 'Часовой пояс RouterOS', 'text', c.timeZone || 'Etc/UTC', 'spellcheck="false"') + '</div><p class="fs-hint">Пояс выберите для своего региона, например Europe/Minsk. Модель время не синхронизирует.</p></div>' +
      chk('lm_cloud', 'IP Cloud DDNS от MikroTik', c.cloudDdns) + '<p class="fs-hint">IP Cloud обращается к серверам MikroTik; DDNS не обходит CGNAT и не гарантирует доступ извне.</p>' +
      chk('lm_identity', 'Задать системное имя роутера', c.identityOn) +
      '<div id="lm_identity_box"' + (c.identityOn ? '' : ' hidden') + '>' + f('lm_identity_name', 'Системное имя', 'text', c.systemIdentity || 'MikroTik-Lab', 'spellcheck="false"') + '</div>' +
      '<p class="fs-hint"><a id="lm_routing_guide" href="#routing">Маршрутизация в учебнике</a> · <a id="lm_failover_guide" href="#failover">Резервирование в учебнике</a></p>';
    html += '<div id="lm_vpn_box"' + (c.vpn ? '' : ' hidden') + '><div class="lm-grid">' +
      sel('lm_vpn_type', 'Тип VPN', [['wireguard', 'WireGuard'], ['ikev2', 'IPsec IKEv2'], ['l2tp-ipsec', 'L2TP/IPsec']], c.vpnType) +
      f('lm_vpn_pool', 'Подсеть VPN (CIDR)', 'text', c.vpnPool, 'list="dl-net"') + '</div>' +
      '<div id="lm_vpn_wg">' + f('lm_vpn_port', 'Порт WireGuard UDP', 'text', c.vpnPort || '13231', 'inputmode="numeric"') + f('lm_vpn_peer', 'Публичный ключ клиента WireGuard (необязательно)', 'text', c.vpnPeer || '', 'spellcheck="false"') + '<p class="fs-hint">Без ключа клиент не подключится — его можно добавить позже.</p></div>' +
      '<div id="lm_vpn_ike">' + f('lm_vpn_server_cert', 'Имя импортированного сертификата сервера', 'text', c.vpnServerCert || '', 'spellcheck="false"') + f('lm_vpn_client_cert', 'Имя доверенного сертификата клиента', 'text', c.vpnClientCert || '', 'spellcheck="false"') + '<p class="fs-hint">Сертификаты и закрытые ключи подготовьте и импортируйте заранее; настройте доверие и имя сервера на клиенте.</p></div>' +
      '<div id="lm_vpn_l2tp">' + f('lm_vpn_user', 'Имя пользователя L2TP', 'text', c.vpnUser || '', 'spellcheck="false"') + f('lm_vpn_pass', 'Пароль (не менее 8 символов)', 'password', c.vpnPass || '', 'autocomplete="new-password"') + f('lm_vpn_psk', 'Общий ключ IPsec (не менее 8 символов)', 'password', c.vpnPsk || '', 'autocomplete="new-password"') + '</div></div>';
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
    if (d.type === 'pc' || d.type === 'server') html += '<div class="lm-t">Сетевая карта 1 (основная)</div>';
    html += sel('lm_segment', 'Сегмент сети', [['main', 'Основная LAN'], ['guest', 'Гостевой VLAN']], c.segment || 'main');
    html += sel('lm_mode', 'Получение адреса', [['static', 'Статический IP'], ['dhcp', 'DHCP (авто)']], c.mode || 'static');
    html += '<div id="lm_g_static_ep"' + ((c.mode || 'static') === 'static' ? '' : ' hidden') + '><div class="lm-grid">' +
      f('lm_ip2', 'IP/маска', 'text', c.ip, 'list="dl-net" inputmode="decimal"') +
      f('lm_gw2', 'Шлюз', 'text', c.gw, 'list="dl-ip" inputmode="decimal"') +
      f('lm_ep_dns', 'DNS (необязательно)', 'text', c.dns || '', 'list="dl-dns" inputmode="decimal"') + '</div>' +
      '<button type="button" class="btn ghost lm-mini" id="lm_fill_gw">↳ подставить адрес и шлюз выбранного сегмента</button></div>';
    if (d.type === 'pc' || d.type === 'server') {
      var cardCount = 1 + (Array.isArray(c.nics) ? c.nics.length : 0);
      html += '<div class="lm-t">Дополнительные сетевые карты</div>' + sel('lm_nic_count', 'Количество сетевых карт', [['1','1'],['2','2'],['3','3'],['4','4']], String(cardCount)) + '<p class="fs-hint">До четырёх независимых карт: каждая использует один кабель. При создании линии выбирается свободная карта; изменить назначение можно, выбрав линию. Публикация относится к карте 1.</p>';
      for (var n=2; n<=4; n++) {
        var nc = (c.nics || []).filter(function(x) { return x.id === 'nic' + n; })[0] || {mode:'dhcp', segment:'main',ip:'',gw:'',dns:''};
        html += '<div id="lm_nic_box_' + n + '"' + (n <= cardCount ? '' : ' hidden') + '><div class="lm-t">Сетевая карта ' + n + '</div>' +
          sel('lm_nic_segment_' + n, 'Сегмент карты ' + n, [['main','Основная LAN'],['guest','Гостевой VLAN']], nc.segment || 'main') +
          sel('lm_nic_mode_' + n, 'Получение адреса карты ' + n, [['dhcp','DHCP (авто)'],['static','Статический IP']], nc.mode || 'dhcp') +
          '<div class="lm-grid">' + f('lm_nic_ip_' + n, 'IP/маска при статике', 'text', nc.ip || '', 'inputmode="decimal"') + f('lm_nic_gw_' + n, 'Шлюз при статике', 'text', nc.gw || '', 'inputmode="decimal"') + f('lm_nic_dns_' + n, 'DNS (необязательно)', 'text', nc.dns || '', 'inputmode="decimal"') + '</div></div>';
      }
      html += '<div class="lm-t">Публикация в интернете</div>' + chk('lm_external', 'Разрешить доступ извне к этому устройству', c.external) +
        '<div id="lm_external_box"' + (c.external ? '' : ' hidden') + '><div class="lm-grid">' +
        sel('lm_ext_proto', 'Протокол', [['tcp', 'TCP'], ['udp', 'UDP']], c.extProto || 'tcp') +
        f('lm_ext_port', 'Внешний порт', 'text', c.extPort || '8080', 'inputmode="numeric"') +
        f('lm_local_port', 'Локальный порт', 'text', c.localPort || '80', 'inputmode="numeric"') + '</div>' +
        '<p class="fs-hint">Нужен статический LAN-адрес вне DHCP-пула и доступный белый IP. Публикация открывает сервис в интернет; защитите его. Эти же настройки доступны на прямой линии ПК/сервер — MikroTik.</p></div>';
    }

  } else {
    html += '<p class="fs-hint">В этой модели коммутатор работает как неуправляемый L2. Он просто объединяет сегменты в один широковещательный домен.</p>';
  }
  html += '<div class="fs-hint">Изменения применяются сразу после сохранения — карта настроек пересчитается при запуске.</div>';

  lmTitle.textContent = '⚙ ' + TYPES[d.type].label + ' — настройки';
  lmBody.innerHTML = html;
  lmErr.hidden = true;
  modal.hidden = false;

  var kindSel = $('lm_kind'), modeSel = $('lm_mode'), vpnChk = $('lm_vpn'), vpnType = $('lm_vpn_type'), extChk = $('lm_external'), guestChk = $('lm_guest_vlan'), wifiChk = $('lm_wifi_ap'), wifiGuestChk = $('lm_wifi_guest'), monitorChk = $('lm_wan_monitor'), routeChk = $('lm_static_route'), dnsChk = $('lm_custom_dns'), staticDnsChk = $('lm_dns_static'), ntpChk = $('lm_ntp'), identityChk = $('lm_identity');
  function applyVis() {
    if (kindSel) {
      $('lm_g_pppoe').hidden = kindSel.value !== 'pppoe';
      $('lm_g_static').hidden = kindSel.value !== 'static';
      $('lm_g_lte').hidden = kindSel.value !== 'lte';
    }
    if (modeSel) $('lm_g_static_ep').hidden = modeSel.value !== 'static';
    if ($('lm_nic_count')) for (var n=2;n<=4;n++) $('lm_nic_box_' + n).hidden = n > Number($('lm_nic_count').value);
    if (vpnChk) $('lm_vpn_box').hidden = !vpnChk.checked;
    if (vpnType) { $('lm_vpn_wg').hidden = vpnType.value !== 'wireguard'; $('lm_vpn_ike').hidden = vpnType.value !== 'ikev2'; $('lm_vpn_l2tp').hidden = vpnType.value !== 'l2tp-ipsec'; }
    if (extChk) $('lm_external_box').hidden = !extChk.checked;
    if (guestChk) $('lm_guest_vlan_box').hidden = !guestChk.checked;
    if (wifiChk) { $('lm_wifi_box').hidden = !wifiChk.checked; if (!wifiChk.checked && wifiGuestChk) wifiGuestChk.checked = false; }
    if (wifiGuestChk) $('lm_wifi_guest_box').hidden = !wifiGuestChk.checked;
    [[monitorChk,'lm_monitor_box'],[routeChk,'lm_route_box'],[dnsChk,'lm_dns_box'],[staticDnsChk,'lm_dns_static_box'],[ntpChk,'lm_ntp_box'],[identityChk,'lm_identity_box']].forEach(function(pair) { if (pair[0]) $(pair[1]).hidden = !pair[0].checked; });
  }
  [kindSel, modeSel, vpnChk, vpnType, extChk, guestChk, wifiChk, wifiGuestChk, monitorChk, routeChk, dnsChk, staticDnsChk, ntpChk, identityChk, $('lm_nic_count')].forEach(function (e2) {
    if (e2) e2.addEventListener('change', applyVis);
  });
  ['lm_network_guide', 'lm_routing_guide', 'lm_failover_guide'].forEach(function(id) { var link = $(id); if (link) link.addEventListener('click', function () { modal.hidden = true; editingId = null; }); });
  var fill = $('lm_fill_gw');
  if (fill) fill.addEventListener('click', function () {
    var rt = state.devices.filter(function (x) { return x.type === 'router'; })[0];
    if (rt) {
      var guest = $('lm_segment') && $('lm_segment').value === 'guest';
      var network = LabEngine.parseCidr(guest ? rt.cfg.guestNet : rt.cfg.lan), gw = guest ? rt.cfg.guestGw : rt.cfg.gw;
      if (!network) return lmFail('Сначала настройте подсеть выбранного сегмента на MikroTik');
      var used = state.devices.filter(function(x) { return x.id !== d.id && x.cfg && x.cfg.mode === 'static'; }).map(function(x) { return (x.cfg.ip || '').split('/')[0]; });
      var host = 10, ip; do { ip = LabEngine.intToIp(network.firstInt + host++); } while (host < 100 && (ip === gw || used.indexOf(ip) !== -1));
      if (ip === gw || used.indexOf(ip) !== -1) return lmFail('Нет свободных статических адресов .10–.99 в сегменте.');
      $('lm_ip2').value = ip + '/24'; $('lm_gw2').value = gw;
    }
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
  var c = Object.assign({}, d.cfg);
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
      firewall: $('lm_fw').checked, vpn: vpn, routerRole: $('lm_router_role').value, wanFailover: $('lm_wan_failover').checked, routerFailover: $('lm_router_failover').checked,
      wanMonitor: $('lm_wan_monitor').checked, monitorHost: $('lm_monitor_host').value.trim(), staticRoute: $('lm_static_route').checked, routeDst: $('lm_route_dst').value.trim(), routeGw: $('lm_route_gw').value.trim(), routeDistance: $('lm_route_distance').value.trim(),
      dnsCache: $('lm_dns_cache').checked, customDns: $('lm_custom_dns').checked, dnsPrimary: $('lm_dns_primary').value.trim(), dnsSecondary: $('lm_dns_secondary').value.trim(), dnsStatic: $('lm_dns_static').checked, dnsStaticName: $('lm_dns_name').value.trim(), dnsStaticIp: $('lm_dns_ip').value.trim(),
      ntpClient: $('lm_ntp').checked, ntpServer: $('lm_ntp_server').value.trim(), timeZone: $('lm_timezone').value.trim(), cloudDdns: $('lm_cloud').checked, identityOn: $('lm_identity').checked, systemIdentity: $('lm_identity_name').value.trim(),
      vlanGuest: $('lm_guest_vlan').checked, guestVlan: $('lm_guest_vlan_id').value.trim(), guestNet: $('lm_guest_net').value.trim(), guestGw: $('lm_guest_gw').value.trim(), guestDhcp: $('lm_guest_dhcp').checked,
      wifiAp: $('lm_wifi_ap').checked, wifiIf: $('lm_wifi_if').value.trim(), wifiCountry: $('lm_wifi_country').value.trim(), wifiSsid: $('lm_wifi_ssid').value, wifiPass: $('lm_wifi_pass').value, wifiGuest: $('lm_wifi_guest').checked, wifiGuestSsid: $('lm_wifi_guest_ssid').value, wifiGuestPass: $('lm_wifi_guest_pass').value,
      vpnType: $('lm_vpn_type').value, vpnPort: $('lm_vpn_port').value.trim(), vpnPool: $('lm_vpn_pool').value.trim(),
      vpnPeer: $('lm_vpn_peer').value.trim(), vpnServerCert: $('lm_vpn_server_cert').value.trim(), vpnClientCert: $('lm_vpn_client_cert').value.trim(),
      vpnUser: $('lm_vpn_user').value.trim(), vpnPass: $('lm_vpn_pass').value, vpnPsk: $('lm_vpn_psk').value };
    if (vp.wanMonitor && (!vp.wanFailover || !E.validIp(vp.monitorHost))) return lmFail('Для контроля WAN включите резервирование и укажите IPv4 контрольного узла.');
    if (vp.customDns && (!E.validIp(vp.dnsPrimary) || (vp.dnsSecondary && !E.validIp(vp.dnsSecondary)))) return lmFail('Укажите корректные IPv4 DNS-серверов.');
    if (vp.dnsStatic && (!vp.dnsCache || !vp.dnsStaticName || !E.validIp(vp.dnsStaticIp))) return lmFail('Для локальной DNS-записи включите DNS-кэш и укажите имя и IPv4.');
    if (vp.staticRoute && (!E.parseCidr(vp.routeDst) || !E.validIp(vp.routeGw) || !/^\d{1,3}$/.test(vp.routeDistance) || +vp.routeDistance < 1 || +vp.routeDistance > 254)) return lmFail('Укажите сеть маршрута, IPv4 шлюза и distance 1–254.');
    if (vp.ntpClient && (!vp.ntpServer || !vp.timeZone)) return lmFail('Укажите NTP-сервер и часовой пояс.');
    if (vp.identityOn && !vp.systemIdentity) return lmFail('Введите системное имя роутера.');
    if (vp.vlanGuest && (!E.parseCidr(vp.guestNet) || !E.validIp(vp.guestGw))) return lmFail('Укажите подсеть и шлюз гостевого VLAN.');
    if (vp.vlanGuest && (!/^\d{1,4}$/.test(vp.guestVlan) || +vp.guestVlan < 2 || +vp.guestVlan > 4094)) return lmFail('VLAN ID должен быть от 2 до 4094.');
    if (vp.vlanGuest && !vp.firewall) return lmFail('Для изоляции гостей включите Firewall.');
    if (vp.wifiGuest && (!vp.wifiAp || !vp.vlanGuest)) return lmFail('Для гостевого Wi-Fi включите точку доступа и гостевой VLAN.');
    if (vp.wifiAp && (!vp.wifiCountry || !vp.wifiSsid || vp.wifiPass.length < 8)) return lmFail('Для Wi-Fi укажите страну, SSID и пароль не короче 8 символов.');
    if (vp.wifiGuest && (!vp.wifiGuestSsid || vp.wifiGuestPass.length < 8)) return lmFail('Для гостевого Wi-Fi задайте SSID и пароль не короче 8 символов.');
    if (vpn && !E.parseCidr(vp.vpnPool)) return lmFail('Пул VPN задан неверно — нужен вид 10.10.10.0/24');
    if (vpn && vp.vpnType === 'wireguard' && (!/^\d{1,5}$/.test(vp.vpnPort) || +vp.vpnPort < 1 || +vp.vpnPort > 65535)) return lmFail('Порт WireGuard — число от 1 до 65535');
    if (vpn && vp.vpnType === 'ikev2' && (!vp.vpnServerCert || !vp.vpnClientCert)) return lmFail('Для IKEv2 укажите имена сертификатов сервера и клиента');
    if (vpn && vp.vpnType === 'l2tp-ipsec' && (!vp.vpnUser || vp.vpnPass.length < 8 || vp.vpnPsk.length < 8)) return lmFail('Для L2TP/IPsec нужны имя, пароль и общий ключ не короче 8 символов');
    Object.assign(c, vp);
    state.devices.forEach(function(other) { if (other.type === 'router' && other.id !== d.id) other.cfg.routerRole = vp.routerRole === 'primary' ? 'backup' : 'primary'; });
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
    c.segment = $('lm_segment').value;
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
  if (d.type === 'pc' || d.type === 'server') {
    var count = Number($('lm_nic_count').value), newNics = [];
    for (var n=2; n<=4; n++) {
      if (n > count) { if (cardUsed(d, 'nic' + n)) return lmFail('Сначала удалите или переназначьте линию сетевой карты ' + n + '.'); continue; }
      var nic = {id:'nic' + n, segment:$('lm_nic_segment_' + n).value, mode:$('lm_nic_mode_' + n).value, ip:$('lm_nic_ip_' + n).value.trim(), gw:$('lm_nic_gw_' + n).value.trim(), dns:$('lm_nic_dns_' + n).value.trim()};
      if (nic.mode === 'static' && (!E.parseCidr(nic.ip) || !E.validIp(nic.gw) || (nic.dns && !E.validIp(nic.dns)))) return lmFail('Карта ' + n + ': укажите IP/маску, шлюз и корректный DNS.');
      newNics.push(nic);
    }
    c.nics = newNics;
  }
  if (d.type === 'pc' || d.type === 'server') {
    var external = $('lm_external').checked, ep = $('lm_ext_port').value.trim(), lp = $('lm_local_port').value.trim();
    if (external && c.mode !== 'static') return lmFail('Для доступа извне выберите статический IP.');
    if (external && (!/^\d{1,5}$/.test(ep) || +ep < 1 || +ep > 65535 || !/^\d{1,5}$/.test(lp) || +lp < 1 || +lp > 65535)) return lmFail('Внешний и локальный порты должны быть от 1 до 65535.');
    Object.assign(c, { external: external, extProto: $('lm_ext_proto').value, extPort: ep, localPort: lp });
  }
  d.cfg = c;
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
  $('lab_example_backup').addEventListener('click', function () {
    resetBtn.click();
    var w = canvas.clientWidth || 800, left = Math.max(0, w * .08), right = Math.max(0, w - 110), middle = Math.max(0, (w - DEV_W) / 2);
    var isp1 = place('isp', left, 5), isp2 = place('isp', right, 5);
    var rt1 = place('router', left, 120), rt2 = place('router', right, 120);
    var sw = place('switch', middle, 245), pc = place('pc', left, 365), server = place('server', right, 365);
    byId(rt1).cfg.wanFailover = true;
    byId(rt1).cfg.routerFailover = true;
    byId(pc).cfg.mode = 'dhcp';
    addLink(isp1, rt1); addLink(isp2, rt2); addLink(rt1, sw); addLink(rt2, sw); addLink(sw, pc); addLink(sw, server);
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
  togglePower: togglePower,
  toggleProbe: toggleProbe,
  get lastModel() { return lastModel; },
  get mode() { return mode; }
};
})();
