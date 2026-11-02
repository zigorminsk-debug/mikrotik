'use strict';
// Planning only; no VM launch, network access, RouterOS commands or IPC.
// The caller must still run the normal CHR preflight and require isolation.
const {validTarget}=require('./ping');
function endpointPlan(engine, state, routerId) {
  if (!state || !Array.isArray(state.devices) || !Array.isArray(state.links) || state.devices.length > 30 || state.links.length > 30) return {blockers:['Недопустимая схема.'], segments:[]};
  const result = engine.run(state);
  if (!result || result.errors.length || result.dual || result.independent || !result.model || result.model.router.id !== routerId) return {blockers:['Для виртуальных клиентов нужна проверенная схема с одним MikroTik.'],segments:[]};
  const router = result.model.router, devices = state.devices;
  if (router.cfg.vlanGuest) return {blockers:['Гостевой VLAN с виртуальными клиентами пока не проверен.'],segments:[]};
  if (!router.cfg.dhcp) return {blockers:['Для запуска тестового Linux-клиента пока нужен выбранный DHCP-сервер LAN; настройки роутера не будут изменены без выбора пользователя.'],segments:[]};
  const endpoints=devices.filter(x=>['pc','server','printer'].includes(x.type));
  if (!endpoints.length || endpoints.length > 4) return {blockers:['Для первого этапа нужны от одного до четырёх виртуальных клиентов.'],segments:[]};
  if (devices.some(x=>x.on===false)) return {blockers:['Выключенные устройства пока нельзя запустить как виртуальные клиенты.'],segments:[]};
  if (endpoints.some(d=>!d.cfg || !['static','dhcp'].includes(d.cfg.mode) || d.cfg.segment==='guest' || d.cfg.nics&&d.cfg.nics.length)) return {blockers:['Виртуальные клиенты пока поддерживают только основную LAN, одну сетевую карту и IPv4.'],segments:[]};
  const ids=new Set(devices.map(d=>d.id));
  if(ids.size!==devices.length || devices.some(d=>typeof d.id!=='string'||!d.id))return {blockers:['Некорректные идентификаторы устройств.'],segments:[]};
  const neighbors=new Map(devices.map(d=>[d.id,[]]));
  for(const l of state.links){if(!l || !neighbors.has(l.a)||!neighbors.has(l.b))return {blockers:['Некорректная линия.'],segments:[]};neighbors.get(l.a).push(l.b);neighbors.get(l.b).push(l.a);}
  const byId=new Map(devices.map(d=>[d.id,d])),segments=[],found=new Set();
  for(const port of router.lanPorts){
    if(!/^ether[2-5]$/.test(port.phys)||port.segment!=='main')return {blockers:['Неподдерживаемый порт или сегмент LAN.'],segments:[]};
    const queue=[port.dev.id],visited=new Set([routerId]);let members=[];
    while(queue.length){const id=queue.shift();if(visited.has(id))continue;visited.add(id);const d=byId.get(id);
      if(!d || !['switch','pc','server','printer'].includes(d.type))return {blockers:['Ветвь LAN содержит неподдерживаемое устройство.'],segments:[]};
      if(d.type!=='switch'){
        if(found.has(id))return {blockers:['Один клиент соединён с несколькими портами MikroTik; такая топология пока не проверена.'],segments:[]};
        const ip=d.cfg.mode==='static' ? engine.parseCidr(d.cfg.ip) : null;
        const dns=ip && result.model.assignments[d.id] && result.model.assignments[d.id].dns;
        if(d.cfg.mode==='static' && (!ip || ip.prefix!==24 || !validTarget(ip.ip) || (d.cfg.gw && !validTarget(d.cfg.gw)) || !validTarget(dns)))return {blockers:['Нужны допустимые IPv4/24, шлюз и DNS клиента; неподдерживаемый DNS не заменяется.'],segments:[]};
        found.add(id);members.push({id:d.id,type:d.type,mode:d.cfg.mode,ip:ip?ip.ip:null,netmask:24,gateway:ip?(d.cfg.gw||''):null,dns:ip?dns:null});
      }
      for(const next of neighbors.get(id))if(!visited.has(next))queue.push(next);
    }
    if(members.length)segments.push({routerPort:port.phys,clients:members});
  }
  if(found.size!==endpoints.length)return {blockers:['Не все клиенты подключены к LAN выбранного MikroTik.'],segments:[]};
  return {blockers:[],segments};
}
module.exports={endpointPlan};
