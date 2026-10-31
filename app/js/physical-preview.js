/* Черновая сводка схемы: без сети, RouterOS-команд и секретов.
   Это не план изменений, сброса или совместимости физического устройства. */
(function(global) {
'use strict';
var titles = {
  iface:'Мост и LAN-порты', addr:'Адрес LAN и DNS', wan:'Подключение провайдеров',
  dhcp:'DHCP LAN', wifi:'Wi-Fi', 'guest-vlan':'Гостевой VLAN и DHCP',
  route:'Статический маршрут', services:'DNS, время и сервисы', vpn:'VPN',
  filter:'Firewall', nat:'NAT и доступ извне', 'activate-lan':'Активация VLAN и Wi-Fi',
  'secure-management':'Ограничение управления'
};
function build(engine, state, routerId) {
  var out={errors:[], warnings:[], sections:[], ports:[], publications:[], lan:null};
  if (!state || !Array.isArray(state.devices) || !Array.isArray(state.links) || state.devices.length>100 || state.links.length>100) {
    out.errors.push('Недопустимый размер или формат схемы.'); return out;
  }
  var routers=state.devices.filter(function(d){return d && d.type==='router';});
  if (routers.length!==1 || routers[0].id!==routerId) {
    out.errors.push('Эта черновая оценка пока поддерживает одну схему с одним выбранным MikroTik. Два роутера и независимые сети требуют отдельной проверки.'); return out;
  }
  var result;
  try { result=engine.run(state); }
  catch (_) { out.errors.push('Не удалось проверить схему.'); return out; }
  if (!result || !Array.isArray(result.errors) || !Array.isArray(result.warnings)) {out.errors.push('Не удалось проверить схему.');return out;}
  out.errors=result.errors.slice(); out.warnings=result.warnings.slice();
  if (out.errors.length) return out;
  if (result.dual || result.independent || !result.model || !result.model.router) {out.errors.push('Нельзя построить сводку для этой схемы.');return out;}
  var model=result.model, router=model.router;
  out.lan={network:router.net.first+'/24',gateway:router.gw,routerName:router.name};
  model.isps.forEach(function(i){out.ports.push({port:i.phys,peer:i.name,role:'WAN '+i.kind});});
  router.lanPorts.forEach(function(p){out.ports.push({port:p.phys,peer:p.dev.name,role:p.segment==='guest'?'гостевая сеть':'основная LAN'});});
  model.publications.forEach(function(p){out.publications.push({protocol:p.proto,external:p.external,address:p.ip,local:p.local});});
  result.groups.forEach(function(g){
    if (g.id==='verify') return;
    if (Object.prototype.hasOwnProperty.call(titles,g.id)) out.sections.push(titles[g.id]);
    else out.warnings.push('Есть группа схемы без описания в черновой оценке; проверить её вручную.');
  });
  return out;
}
var api={build:build};
global.PhysicalPreview=api;
if (typeof module!=='undefined' && module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
