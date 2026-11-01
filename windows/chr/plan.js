'use strict';
// Private main-process preflight; never accept RouterOS command strings from
// a renderer. Selected unsupported capabilities block the whole plan.
const allowedGroups = new Set(['iface', 'addr', 'wan', 'dhcp', 'guest-vlan', 'filter', 'nat', 'activate-lan', 'route', 'services', 'queue', 'ipv6']);
function ruleProperties(command) {
  const result = {};
  for (const m of command.matchAll(/\b([a-z][a-z-]*)=([^\s]+)/g)) result[m[1]] = m[2];
  return result;
}
function makePlan(engine, state, routerId, options = {}) {
  if (!state || !Array.isArray(state.devices) || !Array.isArray(state.links) || state.devices.length > 100 || state.links.length > 100) throw new Error('Недопустимый размер или формат схемы');
  const initial = engine.chrPreflight(state, routerId);
  const blockers = initial.blockers.slice();
  const router = state.devices.find(d => d.type === 'router' && d.id === routerId);
  const isps = state.devices.filter(d => d.type === 'isp');
  if (router) {
    const c = router.cfg || {};
    if (c.routerFailover || (c.wanFailover && options.allowDualStaticWan !== true)) blockers.push('Переключение провайдеров и роутеров ещё не проверено в виртуальной CHR; выключите резервирование.');
  }
  const dualExperiment = options.allowDualStaticWan === true && isps.length === 2 && router && router.cfg && router.cfg.wanFailover === true && isps.every(x => x.cfg && x.cfg.kind === 'static');
  const singleDhcp = isps.length === 1 && isps[0].cfg && isps[0].cfg.kind === 'dhcp';
  if (!dualExperiment && (isps.length !== 1 || !isps[0].cfg || !['static','dhcp'].includes(isps[0].cfg.kind))) blockers.push('Пока поддерживаются один изолированный WAN со статическим IPv4 или DHCP; виртуальный провайдер не подключён к интернету.');
  if (singleDhcp && router) {
    // QEMU's restricted DHCP network is 10.0.2.0/24 on the WAN; do not
    // silently let it overlap the user's LAN or guest VLAN.
    const qemuNet = engine.parseCidr('10.0.2.0/24'), c = router.cfg || {};
    if ([c.lan, c.vlanGuest ? c.guestNet : null].some(x => { const n = x && engine.parseCidr(x); return n && n.overlaps(qemuNet); }))
      blockers.push('DHCP WAN использует изолированную сеть QEMU 10.0.2.0/24, которая пересекается с LAN или гостевой сетью.');
  }
  if (state.devices.some(d => d.on === false)) blockers.push('Состояние выключенных устройств ещё не воспроизводится в CHR.');
  if (state.devices.some(d => d.cfg && d.cfg.nics && d.cfg.nics.length)) blockers.push('Дополнительные сетевые карты клиентов ещё не проверены в CHR.');
  if (blockers.length) return { blockers, notices: initial.notices, groups: [] };
  const result = engine.run(state);
  if (result.errors.length || result.dual || result.independent || !result.model) return {blockers: ['Схема не прошла проверку лаборатории.'], notices: initial.notices, groups: []};
  const groups = [];
  for (const group of result.groups) {
    if (group.id === 'verify') continue;
    if (!allowedGroups.has(group.id)) return { blockers: ['Выбранная группа настроек ещё не проверена на CHR.'], notices: initial.notices, groups: [] };
    const commands = group.code.split('\n').filter(x => x && !x.startsWith('#'));
    if (commands.some(x => !x.startsWith('/') || /[\r\n\0]/.test(x) || x.length > 8192)) return { blockers:['Недопустимая команда в проекте CHR.'], notices:initial.notices, groups:[] };
    groups.push({ id: group.id, commands });
  }
  if (!groups.length) return {blockers:['Нет настроек для проверки.'], notices:initial.notices, groups:[]};
  if (groups.reduce((n, group) => n + group.commands.length, 0) > 100) return {blockers:['Слишком много команд для одного запуска CHR (максимум 100); уменьшите число правил.'], notices:initial.notices, groups:[]};
  const r = result.model.router, wan = result.model.primaryIsp;
  const expected = {
    lanAddress: r.gw + '/24', wanAddress: wan.kind === 'static' ? wan.cfg.ip : null, wanPort: wan.phys, wanGateway: wan.kind === 'static' ? wan.cfg.gw : null,
    wans: result.model.isps.map(i => ({kind:i.kind, address:i.kind === 'static' ? i.cfg.ip : null, port:i.phys, gateway:i.kind === 'static' ? i.cfg.gw : null, distance:i.priority === 'primary' ? '1' : '2'})),
    dns: r.dns, dnsCache: r.cfg.dnsCache !== false,
    ipv6Lab: r.cfg.ipv6Lab ? {address:'fd42:7469:6b::1/64',interface:'bridge-lan'} : null,
    logTopics: [r.cfg.logSystem ? 'system' : null, r.cfg.logInterface ? 'interface' : null].filter(Boolean),
    simpleQueue: r.cfg.simpleQueue ? {target:r.cfg.queueTarget + '/32', rate:String(Number(r.cfg.queueRate) * 1000000)} : null,
    staticRoute: r.cfg.staticRoute ? {destination:r.cfg.routeDst, gateway:r.cfg.routeGw, distance:String(r.cfg.routeDistance)} : null,
    dnsStatic: r.cfg.dnsStatic ? {name:r.cfg.dnsStaticName, address:r.cfg.dnsStaticIp} : null,
    identity: r.cfg.identityOn ? r.cfg.systemIdentity : null,
    ntp: r.cfg.ntpClient ? {server:r.cfg.ntpServer, zone:r.cfg.timeZone} : null,
    lanPorts: r.lanPorts.map(p => ({name:p.phys, segment:p.segment})),
    dhcp: !!r.cfg.dhcp, lanPool: r.pool.start + '-' + r.pool.end,
    lanNetwork: r.net.first + '/24', lanGateway: r.gw, lanClientDns: r.clientDns,
    vlan: !!r.cfg.vlanGuest, guestId: String(r.cfg.guestVlan || ''), guestAddress: r.cfg.guestGw + '/24',
    guestNetwork: r.cfg.guestNet, guestGateway: r.cfg.guestGw, guestDns: r.guestDns,
    guestDhcp: !!(r.cfg.vlanGuest && r.cfg.guestDhcp),
    filterRules: groups.filter(g => g.id === 'filter').flatMap(g => g.commands).map(ruleProperties),
    natRules: groups.filter(g => g.id === 'nat').flatMap(g => g.commands).map(ruleProperties)
  };
  if (r.cfg.vlanGuest) { const guest = engine.poolOf(engine.parseCidr(r.cfg.guestNet)); expected.guestPool = guest.start + '-' + guest.end; }
  return { blockers: [], notices: initial.notices, groups, expected };
}
module.exports = { makePlan };
