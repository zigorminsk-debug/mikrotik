/* UI-контроллер: навигация, рендер шагов учебника, интерактивный стенд. */
(function () {
'use strict';

var contentEl = document.getElementById('content');
var standView = document.getElementById('stand-view');
var labView = document.getElementById('lab-view');
var navEl = document.getElementById('nav');
var topTitle = document.getElementById('topbar-title');
var sidebar = document.getElementById('sidebar');
var overlay = document.getElementById('overlay');

/* ---------- утилиты ---------- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmt(t) {
  return esc(t)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
function el(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

/* ---------- рендер блоков ---------- */
function renderBlock(b, stepIdx, bi) {
  var key = 's' + stepIdx + 'b' + bi;
  switch (b.k) {
    case 'p': return el('p', 'p', fmt(b.t));
    case 'h': return el('h3', 'sec-sub', esc(b.t));
    case 'ul': {
      var ul = document.createElement('ul');
      (b.items || []).forEach(function (it) { ul.appendChild(el('li', '', fmt(it))); });
      return ul;
    }
    case 'ol': {
      var ol = document.createElement('ol');
      (b.items || []).forEach(function (it, itemIndex) {
        var data = typeof it === 'string' ? {text:it} : it;
        var li = el('li', '', fmt(data.text));
        if (data.shot && data.shot.k === 'img' && data.shot.src) li.appendChild(renderBlock(data.shot, stepIdx, bi + '-' + itemIndex));
        else li.appendChild(el('div', 'fs-hint', 'Для этого пункта отдельный скриншот пока не добавлен.'));
        ol.appendChild(li);
      });
      return ol;
    }
    case 'cmd': {
      var wrap = el('div', 'codeblock');
      var head = el('div', 'code-head',
        '<span class="ch-lang">RouterOS</span>' +
        (b.title ? '<span class="ch-title">' + esc(b.title) + '</span>' : '') +
        '<button type="button" class="copy-btn" data-copy="' + key + '">Копировать</button>');
      var pre = el('pre', '', '<code id="' + key + '">' + esc(b.t) + '</code>');
      wrap.appendChild(head); wrap.appendChild(pre);
      return wrap;
    }
    case 'img': {
      var fig = document.createElement('figure');
      fig.className = 'shot';
      var im = document.createElement('img');
      im.src = b.src; im.alt = b.cap || 'Скриншот'; im.loading = 'lazy';
      fig.appendChild(im);
      if (b.cap) {
        var caption = el('figcaption', '', fmt(b.cap));
        if ((b.src || '').indexOf('assets/img/official/') === 0) {
          var link = document.createElement('a');
          link.href = b.src.indexOf('winbox-login') !== -1 ? 'https://help.mikrotik.com/docs/spaces/ROS/pages/328129/WinBox' : 'https://help.mikrotik.com/docs/spaces/ROS/pages/328151/First+Time+Configuration';
          link.textContent = ' Источник: MikroTik';
          caption.appendChild(link);
        } else if ((b.src || '').indexOf('assets/img/examples/dhcp-client-') === 0) {
          var exampleLink = document.createElement('a');
          exampleLink.href = 'https://mikrotik.wiki/wiki/%D0%9D%D0%B0%D1%81%D1%82%D1%80%D0%BE%D0%B9%D0%BA%D0%B0_DHCP_%D0%BD%D0%B0_MikroTik';
          exampleLink.textContent = ' Источник: MikroTik Wiki (независимый сайт)';
          caption.appendChild(exampleLink);
        }
        fig.appendChild(caption);
      }
      var zoom = document.createElement('button');
      zoom.type = 'button'; zoom.className = 'shot-zoom'; zoom.textContent = '🔍 Увеличить';
      zoom.setAttribute('aria-label', 'Увеличить изображение: ' + (b.cap || 'схема'));
      fig.appendChild(zoom);
      return fig;
    }
    case 'note': return el('div', 'note', fmt(b.t));
    case 'tip': return el('div', 'tip', fmt(b.t));
    case 'warn': return el('div', 'warn', fmt(b.t));
    case 'tbl': {
      var box = el('div', 'tbl');
      var t = el('table', 'data');
      if (b.head && b.head.length) {
        var thead = document.createElement('thead');
        var trh = document.createElement('tr');
        b.head.forEach(function (h) { trh.appendChild(el('th', '', esc(h))); });
        thead.appendChild(trh); t.appendChild(thead);
      }
      var tb = document.createElement('tbody');
      (b.rows || []).forEach(function (r) {
        var tr = document.createElement('tr');
        r.forEach(function (c) { tr.appendChild(el('td', '', fmt(c))); });
        tb.appendChild(tr);
      });
      t.appendChild(tb); box.appendChild(t);
      return box;
    }
    case 'raw': return el('div', '', b.t);
    default: return el('div', '', esc(JSON.stringify(b)));
  }
}

function renderStep(step, idx) {
  var s = el('section', 'step');
  s.appendChild(el('div', 'step-head',
    '<div class="step-num">' + (idx + 1) + '</div><h2 class="step-title">' + esc(step.t) + '</h2>'));
  var body = el('div', 'step-body');
  (step.b || []).forEach(function (b, i) { body.appendChild(renderBlock(b, idx, i)); });
  s.appendChild(body);
  return s;
}

function renderSection(sec) {
  var head = el('div', 'sec-header',
    '<div class="sec-icon">' + esc(sec.icon || '📘') + '</div><div>' +
    '<h1>' + esc(sec.title) + '</h1>' +
    (sec.lead ? '<p class="sec-lead">' + fmt(sec.lead) + '</p>' : '') + '</div>');
  contentEl.appendChild(head);
  (sec.steps || []).forEach(function (st, i) { contentEl.appendChild(renderStep(st, i)); });
}

/* ---------- навигация ---------- */
function buildNav() {
  navEl.innerHTML = '';
  GUIDE.sections.forEach(function (sec) {
    var a = el('a', 'nav-item',
      '<span class="ni-ico">' + esc(sec.icon || '📘') + '</span>' +
      '<span class="ni-t">' + esc(sec.title) + '</span>' +
      (sec.badge ? '<span class="ni-badge">' + esc(sec.badge) + '</span>' : ''));
    a.href = '#' + sec.id;
    a.dataset.sec = sec.id;
    a.addEventListener('click', function () { closeSidebar(); });
    navEl.appendChild(a);
  });
}

function currentId() {
  var id = (location.hash || '').replace(/^#/, '');
  var found = GUIDE.sections.filter(function (s) { return s.id === id; })[0];
  return found ? id : (GUIDE.sections[0] ? GUIDE.sections[0].id : '');
}

function route() {
  var id = currentId();
  var sec = GUIDE.sections.filter(function (s) { return s.id === id; })[0];
  if (!sec) { sec = GUIDE.sections[0]; id = sec ? sec.id : ''; }
  Array.prototype.forEach.call(navEl.children, function (a) {
    a.classList.toggle('active', a.dataset.sec === id);
  });
  topTitle.textContent = sec ? sec.title : 'Учебник MikroTik';
  if (sec && sec.type === 'stand') {
    standView.hidden = false;
    labView.hidden = true;
    contentEl.hidden = true;
  } else if (sec && sec.type === 'lab') {
    standView.hidden = true;
    labView.hidden = false;
    contentEl.hidden = true;
  } else {
    standView.hidden = true;
    labView.hidden = true;
    contentEl.hidden = false;
    contentEl.innerHTML = '';
    if (sec) renderSection(sec);
  }
  window.scrollTo(0, 0);
}

function closeSidebar() { sidebar.classList.remove('open'); overlay.hidden = true; }
document.getElementById('burger').addEventListener('click', function () {
  sidebar.classList.add('open'); overlay.hidden = false;
});
overlay.addEventListener('click', closeSidebar);
window.addEventListener('hashchange', route);

document.getElementById('nav-search').addEventListener('input', function (e) {
  var v = e.target.value.trim().toLowerCase();
  Array.prototype.forEach.call(navEl.children, function (a) {
    var title = (a.querySelector('.ni-t') || {}).textContent || '';
    a.style.display = (!v || title.toLowerCase().indexOf(v) >= 0) ? '' : 'none';
  });
});

/* ---------- копирование ---------- */
document.addEventListener('click', function (e) {
  var btn = e.target.closest ? e.target.closest('.copy-btn') : null;
  if (!btn) return;
  var codeEl = document.getElementById(btn.dataset.copy || '');
  if (!codeEl) {
    var pre = btn.closest('.codeblock');
    codeEl = pre ? pre.querySelector('code') : null;
  }
  if (!codeEl) return;
  var text = codeEl.textContent;
  var done = function () {
    btn.classList.add('ok'); btn.textContent = 'Скопировано ✓';
    setTimeout(function () { btn.classList.remove('ok'); btn.textContent = 'Копировать'; }, 1600);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
  } else { fallbackCopy(text); done(); }
});
function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (err) {}
  document.body.removeChild(ta);
}

/* =====================================================================
   ИНТЕРАКТИВНЫЙ СТЕНД
   ===================================================================== */
var ispRows = document.getElementById('isp-rows');
var pubRows = document.getElementById('pub-rows');
var tplIsp = document.getElementById('tpl-isp');
var tplPub = document.getElementById('tpl-pub');
var resultsEl = document.getElementById('stand-results');

function wireIspRow(row) {
  var typeSel = row.querySelector('[data-f=type]');
  function sync() {
    var t = typeSel.value;
    row.querySelectorAll('.f-pppoe').forEach(function (l) { l.hidden = t !== 'pppoe'; });
    row.querySelectorAll('.f-static').forEach(function (l) { l.hidden = t !== 'static'; });
    row.querySelectorAll('.f-lte').forEach(function (l) { l.hidden = t !== 'lte'; });
    row.querySelector('.isp-wan-note').textContent =
      t === 'pppoe' ? 'PPPoE-сессия поверх физического порта (ether1 и т.д.), логин/пароль от провайдера.'
      : t === 'dhcp' ? 'Кабель от провайдера с DHCP: роутер получит IP автоматически.'
      : t === 'static' ? 'Статический IP роутера и шлюз провайдера (данные из договора).'
      : 'USB 3G/LTE модем: укажите APN; проверьте, что модем виден в /interface lte.';
    typeSel.dataset.type = t;
  }
  typeSel.addEventListener('change', sync);
  row.querySelector('.isp-del').addEventListener('click', function () {
    if (ispRows.children.length <= 1) { flash('Нужен хотя бы один провайдер'); return; }
    row.remove(); refreshSelects();
  });
  sync();
}

function addIspRow(vals) {
  var node = tplIsp.content.firstElementChild.cloneNode(true);
  if (vals) {
    Object.keys(vals).forEach(function (k) {
      var f = node.querySelector('[data-f=' + k + ']');
      if (f) f.value = vals[k];
    });
  }
  ispRows.appendChild(node);
  wireIspRow(node);
  refreshSelects();
  return node;
}

function addPubRow(vals) {
  var node = tplPub.content.firstElementChild.cloneNode(true);
  if (vals) {
    Object.keys(vals).forEach(function (k) {
      var f = node.querySelector('[data-f=' + k + ']');
      if (f) f.value = vals[k];
    });
  }
  node.querySelector('.pub-del').addEventListener('click', function () {
    node.remove(); refreshSelects();
  });
  pubRows.appendChild(node);
  refreshSelects();
  return node;
}

function refreshSelects() {
  var isps = Array.prototype.map.call(ispRows.querySelectorAll('.isp-row'), function (row, i) {
    return { i: i, name: row.querySelector('[data-f=name]').value || ('Провайдер ' + (i + 1)) };
  });
  var pSel = document.getElementById('isp_primary');
  var bSel = document.getElementById('isp_backup');
  var oldP = pSel.value, oldB = bSel.value;
  [pSel, bSel].forEach(function (sel) {
    sel.innerHTML = '';
    isps.forEach(function (s) {
      var o = document.createElement('option');
      o.value = String(s.i); o.textContent = s.name;
      sel.appendChild(o);
    });
  });
  // sensible defaults: основной — первый, резервный — второй (если есть)
  pSel.value = '0';
  bSel.value = isps.length > 1 ? '1' : '0';
  // восстанавливаем прежний выбор пользователя, если он ещё валиден
  if (oldP !== '' && Number(oldP) < isps.length) pSel.value = oldP;
  if (oldB !== '' && Number(oldB) < isps.length) bSel.value = oldB;
  // страховка: основной и резервный не должны совпадать при 2+ провайдерах
  if (isps.length > 1 && pSel.value === bSel.value) {
    for (var k = 0; k < isps.length; k++) {
      if (String(k) !== pSel.value) { bSel.value = String(k); break; }
    }
  }
  document.querySelectorAll('[data-f=isp]').forEach(function (sel) {
    var old = sel.value;
    sel.innerHTML = '<option value="*0">Все провайдеры</option>';
    isps.forEach(function (s) {
      var o = document.createElement('option');
      o.value = String(s.i); o.textContent = s.name;
      sel.appendChild(o);
    });
    sel.value = (old && (old === '*0' || Number(old) < isps.length)) ? old : '*0';
  });
}

function flash(msg) {
  var d = el('div', 'note', esc(msg));
  d.style.position = 'fixed'; d.style.bottom = '18px'; d.style.left = '50%';
  d.style.transform = 'translateX(-50%)'; d.style.zIndex = '99';
  d.style.boxShadow = '0 8px 30px rgba(0,0,0,.25)';
  document.body.appendChild(d);
  setTimeout(function () { d.remove(); }, 2200);
}

/* чтение формы */
function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
function chk(id) { var e = document.getElementById(id); return e ? e.checked : false; }

function collect() {
  var isps = Array.prototype.map.call(ispRows.querySelectorAll('.isp-row'), function (row) {
    var g = function (k) { var f = row.querySelector('[data-f=' + k + ']'); return f ? f.value : ''; };
    return { name: g('name'), type: g('type'), user: g('user'), pass: g('pass'),
             ip: g('ip'), gw: g('gw'), dns: g('dns'), apn: g('apn'), lteif: g('lteif') };
  });
  var pubs = Array.prototype.map.call(pubRows.querySelectorAll('.pub-row'), function (row) {
    var g = function (k) { var f = row.querySelector('[data-f=' + k + ']'); return f ? f.value : ''; };
    return { ip: g('ip'), proto: g('proto'), port: g('port'), dport: g('dport'), isp: g('isp') };
  });
  return {
    lanCidr: val('lan_cidr'), lanGw: val('lan_gw'),
    lanPoolStart: val('lan_pool_start'), lanPoolEnd: val('lan_pool_end'), lanDhcp: chk('lan_dhcp'),
    guestOn: chk('guest_en'), guestCidr: val('guest_cidr'), guestGw: val('guest_gw'),
    guestPoolStart: val('guest_pool_start'), guestPoolEnd: val('guest_pool_end'),
    ssidWork: val('ssid_work'), wifiPass: val('wifi_pass'), ssidGuest: val('ssid_guest'),
    isps: isps,
    failover: chk('failover'), foTime: val('failover_time'),
    primaryIdx: Number(val('isp_primary')), backupIdx: Number(val('isp_backup')),
    vpnType: val('vpn_type'), vpnPool: val('vpn_pool'), vpnUser: val('vpn_user'),
    vpnPass: val('vpn_pass'), vpnPort: val('vpn_port'),
    s2sRemoteGw: val('s2s_remote_gw'), s2sPsk: val('s2s_psk'), s2sRemoteSubnet: val('s2s_remote_subnet'),
    pubs: pubs
  };
}

/* результаты */
function codeBlock(text, title, id) {
  var key = id || ('c' + Math.random().toString(36).slice(2, 9));
  return '<div class="codeblock"><div class="code-head">' +
    '<span class="ch-lang">RouterOS</span>' +
    (title ? '<span class="ch-title">' + esc(title) + '</span>' : '') +
    '<button type="button" class="copy-btn" data-copy="' + key + '">Копировать</button></div>' +
    '<pre><code id="' + key + '">' + esc(text) + '</code></pre></div>';
}

function planTable(plan, inp) {
  var rows = [];
  rows.push(['LAN', plan.lan.first + '/' + plan.lan.prefix, 'шлюз ' + inp.lan.gw,
    'пул ' + inp.lan.poolStart + '–' + inp.lan.poolEnd + (inp.lan.dhcp ? ', DHCP вкл' : ', DHCP выкл')]);
  if (plan.guest)
    rows.push(['Гостевая', plan.guest.first + '/' + plan.guest.prefix, 'шлюз ' + inp.guest.gw,
      'пул ' + inp.guest.poolStart + '–' + inp.guest.poolEnd]);
  if (inp.wifi.ssidWork)
    rows.push(['Wi-Fi', 'SSID «' + esc(inp.wifi.ssidWork) + '»' +
      (inp.guest.on && inp.wifi.ssidGuest ? ' + «' + esc(inp.wifi.ssidGuest) + '»' : ''),
      'WPA2/WPA3', 'пароль задан в форме']);
  plan.isps.forEach(function (i, n) {
    var role = plan.failover ? (i === plan.primary ? 'ОСНОВНОЙ' : (i === plan.backup ? 'РЕЗЕРВ' : 'доп.')) : 'WAN';
    rows.push(['WAN ' + (n + 1) + ': ' + i.name, i.type.toUpperCase(), i.iface, role]);
  });
  if (plan.failover)
    rows.push(['Failover', inp.primaryIdx + 1 + ' → ' + (inp.backupIdx + 1) + ' (по индексу)',
      'Netwatch: ' + inp.foTime + ' с (диагностика)', 'проверяйте переключение на устройстве']);
  if (inp.vpn.type !== 'none')
    rows.push(['VPN', StandEngine.vpnTitle(inp.vpn.type), inp.vpn.pool, 'пользователь ' + inp.vpn.user]);
  inp.pubs.forEach(function (p, n) {
    rows.push(['Публикация ' + (n + 1), p.ip + ':' + p.dport, 'наружу ' + p.port + '/' + p.proto,
      p.isp === '*0' ? 'все провайдеры' : 'провайдер №' + (Number(p.isp) + 1)]);
  });
  return '<div class="tbl"><table class="data plan-table"><thead><tr>' +
    '<th>Элемент</th><th>Значение</th><th>Интерфейс / параметр</th><th>Комментарий</th>' +
    '</tr></thead><tbody>' +
    rows.map(function (r) {
      return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
}

function renderResults(res) {
  resultsEl.hidden = false;
  var inp = res.input, ch = res.checks, h = '';
  var plan = res.plan || null;   // план есть только при успешной проверке модели

  var errCount = ch.errors.length;
  h += '<div class="res-summary"><h3>' + (errCount ? '✗ В модели найдено ошибок: ' + errCount : '✓ Модель прошла проверку') + '</h3>' +
    '<p>' + (errCount
      ? 'Исправьте отмеченные поля формы и запустите моделирование повторно.'
      : 'План адресации посчитан, конфигурация RouterOS сгенерирована. Ниже — команды и пошаговая инструкция для реального роутера.') +
    '</p></div>';

  /* Проверки */
  h += '<div class="res-card"><div class="res-head">🔎 Проверка работоспособности модели</div><div class="res-body"><ul class="check-list">';
  ch.errors.forEach(function (m) { h += '<li class="err"><span class="ci">✗</span><span>' + esc(m) + '</span></li>'; });
  ch.warnings.forEach(function (m) { h += '<li class="warn"><span class="ci">⚠</span><span>' + esc(m) + '</span></li>'; });
  ch.infos.forEach(function (m) { h += '<li class="ok"><span class="ci">✓</span><span>' + esc(m) + '</span></li>'; });
  h += '</ul></div></div>';

  if (errCount) { resultsEl.innerHTML = h; resultsEl.scrollIntoView({ behavior: 'smooth' }); return; }

  /* План */
  h += '<div class="res-card"><div class="res-head">🗺 План адресации и топологии</div><div class="res-body">' +
    planTable(res.plan, inp) + '</div></div>';

  /* Команды */
  h += '<div class="res-card"><div class="res-head">⚙️ Сгенерированная конфигурация RouterOS</div><div class="res-body">';
  res.groups.forEach(function (g) {
    h += '<details class="cmd-group"><summary>' + esc(g.title) + '</summary><div class="cg-body">' +
      codeBlock(g.code, g.title, 'g_' + g.id) + '</div></details>';
  });
  h += '</div></div>';

  /* Инструкция */
  h += '<div class="res-card"><div class="res-head">📋 Инструкция по реализации на реальном роутере</div><div class="res-body">';
  res.impl.forEach(function (st, i) {
    h += '<div class="impl-step"><div class="is-num">' + (i + 1) + '</div><div class="is-body">' +
      '<div class="is-t">' + esc(st.t) + '</div><div class="cg-desc">' + fmt(st.d) + '</div>';
    var grp = st.g ? res.groups.filter(function (g) { return g.id === st.g; })[0] : null;
    if (grp) h += '<details class="cmd-group" open><summary>' + esc(grp.title) + '</summary><div class="cg-body">' +
      codeBlock(grp.code, grp.title, 'i_' + i + '_' + grp.id) + '</div></details>';
    if (st.cmds) h += codeBlock(st.cmds.join('\n'), '', 'icmd_' + i);
    h += '</div></div>';
  });
  h += '</div></div>';

  /* Финальный чек-лист */
  h += '<div class="res-card"><div class="res-head">✅ Чек-лист приёмки</div><div class="res-body"><ul>' +
    '<li>Клиенты LAN получают адреса из указанного пула, шлюз и DNS корректны</li>' +
    '<li>Интернет работает: ping 8.8.8.8 с роутера и с клиента</li>' +
    (inp.guestOn ? '<li>Гостевой Wi-Fi подключается и видит только интернет (не видит LAN)</li>' : '') +
    (inp.failover ? '<li>Проверьте переключение при отказе и восстановлении; время зависит от условий, сессии могут оборваться</li>' : '') +
    inp.pubs.map(function (p) {
      return '<li>Порт ' + esc(p.port) + '/' + esc(p.proto) + ' доступен снаружи и ведёт на ' + esc(p.ip) + ':' + esc(p.dport) + '</li>';
    }).join('') +
    (inp.vpn.type !== 'none' && plan && plan.lan ? '<li>VPN-клиент подключается и пингует адреса ' + esc(plan.lan.first) + '</li>' : '') +
    '<li>Сохранён бэкап: /system backup save</li>' +
    '</ul></div></div>';

  resultsEl.innerHTML = h;
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* привязка кнопок/чекбоксов стенда */
document.getElementById('btn_add_isp').addEventListener('click', function () {
  if (ispRows.children.length >= 4) { flash('Максимум 4 провайдера'); return; }
  addIspRow({ name: 'Провайдер ' + (ispRows.children.length + 1), type: 'dhcp', user: '', pass: '' });
});
document.getElementById('btn_add_pub').addEventListener('click', function () {
  if (pubRows.children.length >= 6) { flash('Максимум 6 публикаций'); return; }
  addPubRow();
});
document.getElementById('btn_run').addEventListener('click', function () {
  try {
    var res = StandEngine.run(collect());
    renderResults(res);
  } catch (e) {
    resultsEl.hidden = false;
    resultsEl.innerHTML = '<div class="res-card"><div class="res-head">Ошибка моделирования</div>' +
      '<div class="res-body"><div class="warn">' + esc(e && e.message ? e.message : String(e)) + '</div></div></div>';
  }
});
document.getElementById('btn_reset').addEventListener('click', function () {
  ispRows.innerHTML = ''; pubRows.innerHTML = '';
  document.getElementById('lan_cidr').value = '192.168.88.0/24';
  document.getElementById('lan_gw').value = '192.168.88.1';
  document.getElementById('lan_pool_start').value = '192.168.88.10';
  document.getElementById('lan_pool_end').value = '192.168.88.250';
  document.getElementById('guest_cidr').value = '192.168.99.0/24';
  document.getElementById('guest_gw').value = '192.168.99.1';
  document.getElementById('guest_pool_start').value = '192.168.99.10';
  document.getElementById('guest_pool_end').value = '192.168.99.250';
  document.getElementById('failover').checked = true;
  document.getElementById('guest_en').checked = true;
  document.getElementById('vpn_type').value = 'none';
  document.getElementById('lan_dhcp').checked = true;
  initRows();
  resultsEl.hidden = true; resultsEl.innerHTML = '';
  flash('Форма сброшена к значениям по умолчанию');
});
document.getElementById('vpn_type').addEventListener('change', function (e) {
  var t = e.target.value;
  document.querySelectorAll('.vpn-opts').forEach(function (box) {
    var need = t === 'none' ? false
      : box.dataset.vpn === 'ipsec-s2s' ? (t === 'ipsec-s2s')
      : box.dataset.vpn === 'common' ? (t !== 'ipsec-s2s')
      : false;
    box.hidden = !need;
  });
});
document.getElementById('failover').addEventListener('change', function (e) {
  ['isp_primary', 'isp_backup', 'failover_time'].forEach(function (id) {
    document.getElementById(id).disabled = !e.target.checked;
  });
});
document.getElementById('guest_en').addEventListener('change', function (e) {
  document.querySelectorAll('#guest-fields input').forEach(function (i) { i.disabled = !e.target.checked; });
  document.getElementById('guest-fields').style.opacity = e.target.checked ? '1' : '.45';
});

function initRows() {
  addIspRow({ name: 'Основной провайдер', type: 'pppoe', user: 'user@isp', pass: 'secret' });
  addIspRow({ name: 'Резервный провайдер', type: 'dhcp' });
  addPubRow({ ip: '192.168.88.10', proto: 'tcp', port: '443', dport: '443', isp: '*0' });
  document.getElementById('vpn_type').dispatchEvent(new Event('change'));
  document.getElementById('failover').dispatchEvent(new Event('change'));
  document.getElementById('guest_en').dispatchEvent(new Event('change'));
}

/* ---------- Проверка обновлений (кнопка «⟳ Обновить») ---------- */
var RELEASES_URL = 'https://github.com/zigorminsk-debug/mikrotik/releases';
var UPD_API = 'https://api.github.com/repos/zigorminsk-debug/mikrotik/releases/latest';

function updModalEl() { return document.getElementById('upd-modal'); }
function openUpd() { updModalEl().hidden = false; }
function closeUpd() { updModalEl().hidden = true; }
document.getElementById('upd_close').addEventListener('click', closeUpd);
updModalEl().addEventListener('click', function (e) { if (e.target === updModalEl()) closeUpd(); });

/* Android runs the request in a native background thread, so a slow or
   offline connection does not freeze the WebView. Older shells still have
   the synchronous bridge for manual checks. */
var updateRequests = Object.create(null), updateRequestId = 0;
window.onNativeUpdateResponse = function(id, body) {
  var finish = updateRequests[id]; if (finish) finish(body);
};
function httpGetJson(url, cb, allowLegacyBridge) {
  try {
    if (window.Android && typeof window.Android.httpGetAsync === 'function') {
      var id = 'u' + (++updateRequestId), timer;
      updateRequests[id] = function(body) {
        if (!updateRequests[id]) return;
        delete updateRequests[id]; clearTimeout(timer);
        var data = null; try { data = body ? JSON.parse(body) : null; } catch (_) {}
        cb(data);
      };
      timer = setTimeout(function(){ if (updateRequests[id]) updateRequests[id](null); }, 15000);
      try { window.Android.httpGetAsync(url, id); } catch (_) { updateRequests[id](null); }
      return;
    }
    if (allowLegacyBridge && window.Android && typeof window.Android.httpGet === 'function') {
      var body = window.Android.httpGet(url);
      cb(body ? JSON.parse(body) : null); return;
    }
  } catch (e) { /* fall back to fetch */ }
  if (typeof fetch === 'function') {
    fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) { cb(j); })
      .catch(function () { cb(null); });
  } else cb(null);
}
function updTitle(t) { document.getElementById('upd-title').textContent = t; }
function updBody(html) { document.getElementById('upd-body').innerHTML = html; }
function updActions(list) {
  var box = document.getElementById('upd-actions');
  box.innerHTML = '';
  list.forEach(function (a) {
    var e2;
    if (a.href) {
      e2 = document.createElement('a');
      e2.className = 'btn ' + (a.primary ? 'primary' : 'ghost');
      e2.href = a.href;
      e2.textContent = a.t;
    } else {
      e2 = document.createElement('button');
      e2.type = 'button';
      e2.className = 'btn ' + (a.primary ? 'primary' : 'ghost');
      e2.textContent = a.t;
      e2.addEventListener('click', a.onClick);
    }
    box.appendChild(e2);
  });
}
function semverArr(s) {
  return String(s || '0').replace(/^v/, '').split('.').map(function (n) { return parseInt(n, 10) || 0; });
}
function semverNewer(a, b) {
  var A = semverArr(a), B = semverArr(b);
  for (var i = 0; i < 3; i++) {
    if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) > (B[i] || 0);
  }
  return false;
}
function currentVersion() {
  return (typeof window !== 'undefined' && window.APP_VERSION) ? String(window.APP_VERSION) : '0.0.0';
}
function pickAsset(assets, preferApk, tag) {
  // Only links belonging to this exact GitHub release may be displayed.
  var prefix = '/zigorminsk-debug/mikrotik/releases/download/' + encodeURIComponent(tag) + '/';
  function valid(a, ext) {
    if (!a || typeof a.name !== 'string' || !ext.test(a.name) || typeof a.browser_download_url !== 'string') return false;
    try {
      var url = new URL(a.browser_download_url);
      return url.protocol === 'https:' && url.hostname === 'github.com' && !url.port && !url.username && !url.password && !url.search && !url.hash && url.pathname === prefix + encodeURIComponent(a.name);
    } catch (_) { return false; }
  }
  var apk = assets.filter(function (a) { return valid(a, /\.apk$/i); })[0];
  var exe = assets.filter(function (a) { return valid(a, /\.exe$/i); })[0];
  return { main: preferApk ? apk : exe, alt: preferApk ? exe : apk };
}
function checkUpdates(silent) {
  if (!silent) {
    openUpd(); updTitle('Проверка обновлений…'); updBody('Соединяемся с GitHub…'); updActions([]);
  }
  httpGetJson(UPD_API, function (data) {
    var cur = currentVersion();
    if (!data || typeof data.tag_name !== 'string' || !/^v?\d+\.\d+\.\d+$/.test(data.tag_name) || !Array.isArray(data.assets)) {
      if (silent) return;
      updTitle('Обновления');
      updBody('<span class="upd-err">⚠ Не удалось проверить обновления — проверьте подключение к интернету.</span><br><br>' +
        'Текущая версия: <span class="ver">' + esc(cur) + '</span>');
      updActions([{ t:'Страница релизов', href:RELEASES_URL, primary:true }, { t:'Повторить', onClick:function(){checkUpdates(false);} }, { t:'Закрыть', onClick:closeUpd }]);
      return;
    }
    var latest = data.tag_name.replace(/^v/, '');
    var preferApk = /Android/i.test(navigator.userAgent || '');
    if (semverNewer(latest, cur)) {
      var pick = pickAsset(data.assets, preferApk, data.tag_name);
      if (silent && !pick.main) return;
      openUpd(); updTitle('Доступна версия ' + latest);
      updBody('<span class="upd-new">Обновление: <span class="ver">' + esc(cur) + '</span> → <span class="ver">' + esc(latest) + '</span></span><br><br>' +
        (pick.main ? 'Файл: <b>' + esc(pick.main.name) + '</b>. Скачайте и откройте установщик. Подтвердите обновление в системе; тихая установка не выполняется.' : 'Для этой платформы в релизе нет подходящего файла. Проверьте страницу релиза.'));
      var acts = [];
      if (pick.main) acts.push({ t: 'Скачать ' + (/\.apk$/i.test(pick.main.name) ? 'APK' : 'установщик'), href: pick.main.browser_download_url, primary: true });
      else acts.push({ t:'Страница релизов', href:RELEASES_URL, primary:true });
      acts.push({ t:'Позже', onClick:closeUpd }); updActions(acts);
    } else {
      if (silent) return;
      if (semverNewer(cur, latest)) {
        updTitle('Установлена более новая сборка');
        updBody('Версия приложения <span class="ver">' + esc(cur) + '</span> новее последнего опубликованного релиза <span class="ver">' + esc(data.tag_name) + '</span>. Проверка не подтверждает наличие обновлений из других сборок.');
      } else {
        updTitle('У вас последняя версия');
        updBody('<span class="upd-ok">✓ Версия <span class="ver">' + esc(cur) + '</span> совпадает с последним релизом ' + esc(data.tag_name) + '.</span>');
      }
      updActions([{ t:'Страница релизов', href:RELEASES_URL }, { t:'Готово', onClick:closeUpd, primary:true }]);
    }
  }, !silent);
}
document.getElementById('btn_update').addEventListener('click', function(){ checkUpdates(false); });
// No popup on startup unless a newer release has a matching, trusted asset.
if (window.Android || window.routerOS) setTimeout(function(){ checkUpdates(true); }, 5000);

/* ---------- масштаб шрифта A−/A+ (сохраняется между запусками) ---------- */
(function initFontScale() {
  var wrap = document.querySelector('.content-wrap');
  var SCALES = [1, 1.15, 1.3, 1.5];
  var idx = 0;
  try {
    var saved = parseInt(localStorage.getItem('mtFontScale'), 10);
    if (!isNaN(saved) && saved >= 0 && saved < SCALES.length) idx = saved;
  } catch (e) {}
  var valEl = document.getElementById('fs_val');
  function apply() {
    var v = SCALES[idx];
    if (wrap) wrap.style.zoom = (v === 1 ? '' : String(v));
    if (valEl) valEl.textContent = Math.round(v * 100) + '%';
    try { localStorage.setItem('mtFontScale', String(idx)); } catch (e) {}
  }
  var minus = document.getElementById('fs_minus');
  var plus = document.getElementById('fs_plus');
  if (minus) minus.addEventListener('click', function () { if (idx > 0) { idx--; apply(); } });
  if (plus) plus.addEventListener('click', function () { if (idx < SCALES.length - 1) { idx++; apply(); } });
  apply();
})();

/* ---------- старт ---------- */
(function showVersion() {
  var sf = document.getElementById('sidebar-foot');
  if (sf && typeof window !== 'undefined' && window.APP_VERSION) {
    sf.textContent = 'RouterOS v6 / v7 · v' + window.APP_VERSION;
  }
})();
buildNav();
initRows();
route();
})();
