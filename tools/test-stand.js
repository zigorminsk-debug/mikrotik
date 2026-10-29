#!/usr/bin/env node
/* Модульные тесты стенда + проверка контента учебника.
   Запуск: node tools/test-stand.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failed = 0, passed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.log('  ✗ FAIL: ' + msg); }
}
function sectionTitle(n) { console.log('\n== ' + n + ' =='); }

const StandEngine = require(path.join(__dirname, '..', 'app', 'js', 'stand.js'));

/* ---------- 1. IP-утилиты ---------- */
sectionTitle('IP-утилиты');
ok(StandEngine.ipToInt('192.168.88.1') === 3232258049, 'ipToInt корректен');
ok(StandEngine.ipToInt('999.1.1.1') === null, 'ipToInt отклоняет неверный октет');
const net = StandEngine.parseCidr('192.168.88.0/24');
ok(!!net && net.first === '192.168.88.0' && net.last === '192.168.88.255', 'parseCidr /24');
ok(net.contains('192.168.88.100') && !net.contains('192.168.89.1'), 'contains подсети');
const net2 = StandEngine.parseCidr('192.168.88.128/25');
ok(net.overlaps(net2), 'overlaps находит пересечение');
const net3 = StandEngine.parseCidr('10.0.0.0/24');
ok(!net.overlaps(net3), 'несмежные подсети не пересекаются');
ok(StandEngine.parseCidr('bad') === null, 'parseCidr отклоняет мусор');

/* ---------- 2. Валидация ---------- */
sectionTitle('Валидация исходных данных');
function baseInput() {
  return {
    lanCidr: '192.168.88.0/24', lanGw: '192.168.88.1',
    lanPoolStart: '192.168.88.10', lanPoolEnd: '192.168.88.250', lanDhcp: true,
    guestOn: true, guestCidr: '192.168.99.0/24', guestGw: '192.168.99.1',
    guestPoolStart: '192.168.99.10', guestPoolEnd: '192.168.99.250',
    ssidWork: 'MyNet', wifiPass: 'Passw0rd!2026', ssidGuest: 'MyNet-Guest',
    isps: [
      { name: 'Провайдер А', type: 'pppoe', user: 'user@isp', pass: 'secret' },
      { name: 'Провайдер Б', type: 'dhcp' }
    ],
    failover: true, foTime: '10', primaryIdx: 0, backupIdx: 1,
    vpnType: 'none', vpnPool: '10.10.10.0/24', vpnUser: 'vpnuser', vpnPass: 'VpnP@ss2026', vpnPort: '13231',
    s2sRemoteGw: '203.0.113.5', s2sPsk: 'S3cret', s2sRemoteSubnet: '10.20.0.0/24',
    pubs: [{ ip: '192.168.88.10', proto: 'tcp', port: '443', dport: '443', isp: '*0' }]
  };
}
function run(v) { return StandEngine.run(v); }

let r = run(baseInput());
ok(r.checks.errors.length === 0, 'базовая задача без ошибок (' + r.checks.errors.join(' | ') + ')');
ok(r.checks.warnings.length === 0, 'базовая задача без предупреждений (' + r.checks.warnings.join(' | ') + ')');

let v = baseInput(); v.guestCidr = '192.168.88.0/24';
r = run(v);
ok(r.checks.errors.some(e => e.includes('пересекаются')), 'пересечение LAN и guest → ошибка');

v = baseInput(); v.failover = true; v.isps = [v.isps[0]];
r = run(v);
ok(r.checks.errors.some(e => e.includes('минимум два провайдера')), 'failover без 2-го провайдера → ошибка');

v = baseInput(); v.backupIdx = 0;
r = run(v);
ok(r.checks.errors.some(e => e.includes('совпадают')), 'primary==backup → ошибка');

v = baseInput(); v.isps[0].user = '';
r = run(v);
ok(r.checks.errors.some(e => e.includes('логин')), 'PPPoE без логина → ошибка');

v = baseInput(); v.lanGw = '192.168.77.1';
r = run(v);
ok(r.checks.errors.some(e => e.includes('не входит в подсеть')), 'шлюз вне подсети → ошибка');

v = baseInput();
v.pubs = [
  { ip: '192.168.88.10', proto: 'tcp', port: '443', dport: '443', isp: '*0' },
  { ip: '192.168.88.20', proto: 'tcp', port: '443', dport: '8443', isp: '0' }
];
r = run(v);
ok(r.checks.errors.some(e => e.includes('занят другой публикацией')), 'конфликт внешних портов → ошибка');

v = baseInput(); v.vpnType = 'wireguard'; v.vpnPool = '192.168.88.0/24';
r = run(v);
ok(r.checks.errors.some(e => e.includes('пул VPN пересекается')), 'VPN-пул внутри LAN → ошибка');

v = baseInput(); v.vpnType = 'ipsec-s2s'; v.s2sRemoteSubnet = '192.168.88.0/24';
r = run(v);
ok(r.checks.errors.some(e => e.includes('site-to-site')), 's2s с локальной подсетью → ошибка');

/* ---------- 3. Генерация конфигурации ---------- */
sectionTitle('Генерация конфигурации');
r = run(baseInput());
ok(!r.checks.errors.length && r.groups.length >= 7, 'групп команд сгенерировано: ' + r.groups.length);
const all = r.groups.map(g => g.code).join('\n');
ok(!/undefined|\[object Object\]|IPF0|comment-not-supported/.test(all), 'нет undefined/мусора в командах');
ok(all.includes('/interface pppoe-client add'), 'есть PPPoE-клиент');
ok(all.includes('add-default-route=no'), 'PPPoE без авто-маршрута (для failover)');
ok(all.includes('action=masquerade'), 'есть masquerade');
ok(!all.includes('check-gateway=ping'), 'PPPoE/DHCP не выдают проверку внешнего узла за готовую');
ok(all.includes('distance=1') && all.includes('distance=2'), 'есть маршруты distance 1/2');
ok(all.includes('chain=dstnat'), 'есть публикация dstnat');
ok(all.includes('to-addresses=192.168.88.10'), 'dstnat указывает внутренний IP');
ok(all.includes('bridge-guest'), 'есть гостевой мост');
ok(all.includes('dhcp-guest'), 'есть DHCP для гостей');
ok(all.includes('/tool netwatch add'), 'есть netwatch');
// PPPoE + статика: опасные метки и неподдерживаемый параметр интервала не генерируются.
v = baseInput();
v.isps = [
  { name: 'Провайдер А', type: 'pppoe', user: 'u', pass: 'p' },
  { name: 'Провайдер Б', type: 'static', ip: '198.51.100.2/30', gw: '198.51.100.1', user: '', pass: '' }
];
r = run(v);
const allM = r.groups.map(g => g.code).join('\n');
ok(!r.checks.errors.length, 'сценарий pppoe+static без ошибок');
ok(!allM.includes('/routing table add name=to-primary'), 'опасные таблицы не генерируются');
ok(!allM.includes('new-connection-mark=conn-backup'), 'сохранность сессий не обещается правилами');
ok(!allM.includes('gateway-ping-interval='), 'неподдерживаемый параметр не применяется к маршруту');
ok(allM.includes('gateway=198.51.100.1 distance=2 check-gateway=ping'), 'статический резерв проверяет шлюз');
r = run(baseInput());
ok(r.groups.map(g => g.code).join('\n').includes('distance=2'),
  'dhcp-резерв работает через distance (без меток — корректно)');
// порядок: forward-правила публикаций должны идти ДО "Интернет → LAN: запрет"
const filter = r.groups.find(g => g.id === 'filter').code;
const ipub = filter.indexOf('F-ПУБЛ');
const idrop = filter.indexOf('Интернет → LAN: запрет');
ok(ipub >= 0 && idrop > ipub, 'правила публикаций выше общего запрета');
const iDropIn = filter.indexOf('5. Чужой DHCP');
const iLanIn = filter.indexOf('6. LAN → роутер');
ok(iDropIn >= 0 && iLanIn > iDropIn, 'анти-rogue-DHCP выше разрешения LAN');

v = baseInput(); v.failover = false;
r = run(v);
const all2 = r.groups.map(g => g.code).join('\n');
ok(!all2.includes('routing-mark=to-primary'), 'без failover → без меток');
ok(!all2.includes('check-gateway=ping'), 'PPPoE-маршрут не обещает проверку внешнего узла');

for (const vpn of ['wireguard', 'ikev2', 'l2tp-ipsec', 'ipsec-s2s', 'pptp', 'l2tp', 'sstp', 'ovpn']) {
  v = baseInput(); v.vpnType = vpn; v.failover = false;
  r = run(v);
  const code = r.groups.find(g => g.id === 'vpn');
  ok(!!code && !r.checks.errors.length, 'VPN ' + vpn + ' генерируется без ошибок');
  if (code) ok(!/undefined/.test(code.code), 'VPN ' + vpn + ': нет undefined');
  if (code && vpn !== 'wireguard') ok(code.code.includes('не генерируется') && !code.code.includes('/interface l2tp-server server set'), 'VPN ' + vpn + ': вместо устаревшего шаблона показано ограничение');
}

/* статический провайдер */
v = baseInput();
v.isps = [{ name: 'Стат', type: 'static', ip: '198.51.100.2/30', gw: '198.51.100.1', dns: '198.51.100.1', user: '', pass: '' }];
v.failover = false;
r = run(v);
const c3 = r.groups.map(g => g.code).join('\n');
ok(!r.checks.errors.length && c3.includes('address=198.51.100.2/30') && c3.includes('gateway=198.51.100.1'), 'статический IP провайдера');

/* LTE */
v = baseInput();
v.isps = [
  { name: 'LTE', type: 'lte', apn: 'internet', lteif: 'lte1', user: '', pass: '' },
  { name: 'АDSL', type: 'pppoe', user: 'a', pass: 'b' }
];
r = run(v);
const c4 = r.groups.map(g => g.code).join('\n');
ok(!r.checks.errors.length && c4.includes('/interface lte set'), 'LTE-модем генерируется');
ok(c4.includes('pppoe-out2'), 'второй провайдер получает pppoe-out2');

/* ---------- 4. Инструкция ---------- */
sectionTitle('Инструкция реализации');
r = run(baseInput());
ok(r.impl.length >= 8, 'шагов инструкции: ' + r.impl.length);
const implG = r.impl.map(s => s.g).filter(Boolean);
ok(implG.includes('filter') && implG.includes('route') && implG.includes('nat'), 'ключевые шаги включены');

/* ---------- 5. Контент учебника ---------- */
sectionTitle('Контент учебника');
const ctx = { console, GUIDE: null };
vm.createContext(ctx);
const root = path.join(__dirname, '..', 'app', 'js');
const files = ['guide-core.js', 'sec-intro.js', 'sec-initial.js', 'sec-networks.js',
  'sec-firewall.js', 'sec-failover.js', 'sec-routing.js', 'sec-vpn.js', 'sec-stand.js'];
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const G = ctx.GUIDE;
ok(G && G.sections.length === 9, 'разделов в GUIDE: ' + (G ? G.sections.length : 0));
let steps = 0, blocks = 0, imgs = 0;
const imgMissing = [];
for (const sec of G.sections) {
  ok(!!sec.id && !!sec.title, 'раздел "' + sec.id + '" оформлен');
  for (const st of (sec.steps || [])) {
    steps++;
    for (const b of (st.b || [])) {
      blocks++;
      if (b.k === 'cmd') ok2(b.t && b.t.length > 5, 'cmd блок непустой');
      if (b.k === 'img') {
        imgs++;
        const p = path.join(root, '..', b.src);
        if (!fs.existsSync(p)) imgMissing.push(b.src + ' (' + sec.id + ')');
      }
    }
  }
}
function ok2(c, m) { if (!c) { failed++; console.log('  ✗ FAIL: ' + m); } }
ok(steps >= 45, 'всего шагов в учебнике: ' + steps);
ok(blocks >= 150, 'всего блоков контента: ' + blocks);
ok(imgs >= 10, 'изображений в тексте: ' + imgs);
ok(imgMissing.length === 0, 'все изображения существуют' + (imgMissing.length ? ': ' + imgMissing.join(', ') : ''));

/* все ссылки img в разделах + база скриншотов */
const imgDir = path.join(root, '..', 'assets', 'img');
const svgs = fs.readdirSync(imgDir).filter(f => f.endsWith('.svg'));
ok(svgs.length === 1 && svgs[0] === 'topology.svg', 'в проекте только одна SVG-схема сети');
const official = path.join(imgDir, 'official');
const pngs = fs.readdirSync(official).filter(f => f.endsWith('.png'));
const imageManifest = JSON.parse(fs.readFileSync(path.join(official, 'manifest.json'), 'utf8'));
const crypto = require('crypto');
ok(pngs.length >= 10, 'оригинальных снимков MikroTik: ' + pngs.length);
for (const f of pngs) {
  const b = fs.readFileSync(path.join(official, f));
  const expected = imageManifest[f];
  ok2(!!expected && b.length > 1000 && b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && b.readUInt32BE(16) === expected.width && b.readUInt32BE(20) === expected.height && crypto.createHash('sha256').update(b).digest('hex') === expected.sha256, 'Оригинал PNG без изменений: ' + f);
}
const examples = path.join(imgDir, 'examples');
const exampleManifest = JSON.parse(fs.readFileSync(path.join(examples, 'manifest.json'), 'utf8'));
const examplePngs = fs.readdirSync(examples).filter(f => f.endsWith('.png'));
ok(examplePngs.length >= 4, 'скриншоты DHCP-клиента WinBox 3 и 4: ' + examplePngs.length);
for (const f of examplePngs) {
  const b = fs.readFileSync(path.join(examples, f)), expected = exampleManifest[f];
  ok2(!!expected && b.length > 1000 && b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && b.readUInt32BE(16) === expected.width && b.readUInt32BE(20) === expected.height && crypto.createHash('sha256').update(b).digest('hex') === expected.sha256, 'PNG примера без изменений: ' + f);
}
const own = path.join(imgDir, 'own');
const ownManifest = JSON.parse(fs.readFileSync(path.join(own, 'manifest.json'), 'utf8'));
for (const [f, expected] of Object.entries(ownManifest)) {
  const b = fs.readFileSync(path.join(own, f));
  ok2(b.length > 1000 && b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && b.readUInt32BE(16) === expected.width && b.readUInt32BE(20) === expected.height && crypto.createHash('sha256').update(b).digest('hex') === expected.sha256, 'Собственный снимок CHR без изменений: ' + f);
}
for (const f of svgs) {
  const s = fs.readFileSync(path.join(imgDir, f), 'utf8');
  if (!s.startsWith('<svg') || !s.endsWith('</svg>')) { failed++; console.log('  ✗ FAIL: битый SVG ' + f); }
}
ok(true, 'SVG структурно корректны');

/* ---------- 6. Синхронизация версий ---------- */
sectionTitle('Синхронизация версий');
const gradleSrc = fs.readFileSync(path.join(__dirname, '..', 'android', 'app', 'build.gradle'), 'utf8');
const vnM = /versionName\s+"([^"]+)"/.exec(gradleSrc);
const vcM = /versionCode\s+(\d+)/.exec(gradleSrc);
const winPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'windows', 'package.json'), 'utf8'));
const verSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'js', 'version.js'), 'utf8');
const appV = /APP_VERSION\s*=\s*'([^']+)'/.exec(verSrc);
ok(!!(vnM && vcM && appV), 'версии читаются из всех источников');
ok(!!appV && !!vnM && appV[1] === vnM[1], 'version.js == gradle versionName (' + (appV && appV[1]) + ')');
ok(!!vnM && winPkg.version === vnM[1], 'windows/package.json == gradle (' + (winPkg && winPkg.version) + ')');
ok(!!vcM && Number(vcM[1]) >= 1, 'versionCode задан: ' + (vcM && vcM[1]));
const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
ok(indexSrc.includes('js/version.js'), 'version.js подключён первым в index.html');
ok(indexSrc.includes('id="btn_update"'), 'кнопка «Обновить» есть в разметке');
ok(indexSrc.includes('id="upd-modal"'), 'диалог обновлений есть в разметке');
ok(indexSrc.indexOf('js/version.js') < indexSrc.indexOf('js/app.js'), 'version.js грузится до app.js');

console.log('\n============================');
console.log('Итого: ' + passed + ' ok, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
