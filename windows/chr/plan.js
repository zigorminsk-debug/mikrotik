'use strict';
// Private main-process preflight; never accept RouterOS command strings from
// a renderer. Not wired to IPC and not a claim that the VM runtime is ready.
const allowedGroups = new Set(['iface', 'addr', 'wan', 'dhcp', 'guest-vlan', 'filter', 'nat', 'activate-lan']);
function makePlan(engine, state, routerId) {
  if (!state || !Array.isArray(state.devices) || !Array.isArray(state.links) || state.devices.length > 100 || state.links.length > 100) throw new Error('Недопустимый размер или формат схемы');
  const initial = engine.chrPreflight(state, routerId);
  const blockers = initial.blockers.slice();
  const router = state.devices.find(d => d.type === 'router' && d.id === routerId);
  const isps = state.devices.filter(d => d.type === 'isp');
  if (router) {
    const c = router.cfg || {};
    if (c.wanFailover || c.routerFailover) blockers.push('Переключение провайдеров и роутеров ещё не проверено в виртуальной CHR; выключите резервирование.');
    if (c.staticRoute || c.dnsStatic || c.identityOn) blockers.push('Статический маршрут, локальная DNS-запись и имя системы ещё не проверены в виртуальной CHR.');
  }
  if (isps.length !== 1 || !isps[0].cfg || isps[0].cfg.kind !== 'static') blockers.push('Пока проверен только один провайдер со статическим IPv4; виртуальный провайдер не подключён к интернету.');
  if (state.devices.some(d => d.on === false)) blockers.push('Состояние выключенных устройств ещё не воспроизводится в CHR.');
  if (state.devices.some(d => d.cfg && (d.cfg.external || (d.cfg.nics && d.cfg.nics.length)))) blockers.push('Публикация портов и дополнительные сетевые карты клиентов ещё не проверены в CHR.');
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
  return { blockers: [], notices: initial.notices, groups };
}
module.exports = { makePlan };
