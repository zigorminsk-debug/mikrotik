'use strict';
// Produces a tiny typed preview, never executable RouterOS text.
// The Windows UI uses it for a non-executable assessment of a read-only snapshot.
// It is NOT connected to a VM, an importer or a production write path.
const net=require('net');
const required=['interfaces','bridge','bridge-ports','bridge-vlans','addresses'];
// Each of these collected topics is deliberately omitted from this tiny IR.
// Unread/denied is unknown, not evidence of an empty configuration.
const omitted=[['system','Ресурсы системы'],['identity','Системное имя'],['vlan','Интерфейсы VLAN'],['routes','Маршруты IPv4'],['dhcp-client','DHCP-клиенты'],['dhcp-server','DHCP-серверы'],['dhcp-network','Сети DHCP'],['pools','Пулы адресов'],['dns','DNS'],['filter','Фильтрация IPv4'],['nat','NAT IPv4'],['services','Службы управления'],['queues','Простые очереди']];
const limitations=Object.freeze([
 'Это только предварительная модель одного моста, его выбранных Ethernet-портов и одного IPv4-адреса, а не копия устройства.',
 'Все другие настройки, включая firewall, NAT, маршруты, DHCP, VPN, Wi-Fi, секреты, скрипты, задачи и аппаратные функции, не переносятся.',
 'Имена физических портов в CHR заменяются явно выбранными виртуальными; аппаратное ускорение не воспроизводится.',
 'Из неполного снимка нельзя доказать отсутствие скрытых зависимостей и сценариев; свойства вне белого списка не проверяются.',
 'Этот эксперимент не создаёт VM, не исполняет команды и не подтверждает связность или безопасность.'
]);
const validName=name=>typeof name==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,30}$/.test(name);
function validAddress(value){
 if(typeof value!=='string'||value.length>18)return false;
 const m=/^([0-9]+(?:\.[0-9]+){3})\/(\d{1,2})$/.exec(value);
 if(!m||net.isIP(m[1])!==4||m[1].split('.').some(x=>x.length>1&&x[0]==='0')||String(Number(m[2]))!==m[2])return false;
 const n=Number(m[2]);if(n<8||n>30)return false;
 const octets=m[1].split('.').map(Number);if(octets[0]===0||octets[0]===127||octets[0]>=224||(octets[0]===169&&octets[1]===254))return false;
 const ip=octets.reduce((acc,x)=>acc*256+x,0),block=2**(32-n),host=ip%block;
 return host!==0&&host!==block-1;
}
function preview(snapshot,mapping){
 const out={executable:false,complete:false,items:[],skipped:[],limitations:limitations.slice()};
 const reject=reason=>{out.items=[];out.skipped.push(reason);return out;};
 if(!snapshot||!Array.isArray(snapshot.sections)||snapshot.sections.length>40)return reject('Недопустимый снимок.');
 const sections=new Map();
 for(const section of snapshot.sections){
  if(!section||typeof section.id!=='string'||sections.has(section.id))return reject('Снимок содержит повторные или некорректные разделы.');
  sections.set(section.id,section);
 }
 for(const id of required){const x=sections.get(id);if(!x||x.status!=='ok'||!Array.isArray(x.rows)||x.rows.length>2000)return reject('Раздел '+id+' недоступен или не проверен.');}
 const bridges=sections.get('bridge').rows;
 if(bridges.length!==1)return reject('Нужен ровно один считанный мост; несколько или отсутствующие мосты пока не переносятся.');
 const bridge=bridges[0];
 if(!bridge||!validName(bridge.name)||bridge.disabled!=='false'||bridge['vlan-filtering']!=='false'||bridge['protocol-mode']!=='rstp')return reject('Мост должен быть включён, с явно выключенной VLAN-фильтрацией и RSTP; неизвестные значения не допускаются.');
 if(sections.get('bridge-vlans').rows.length!==0)return reject('Таблица VLAN не пуста; такой мост пока не поддерживается.');
 const ports=sections.get('bridge-ports').rows;
 if(ports.length<1||ports.length>4)return reject('Нужно от одного до четырёх считанных портов моста.');
 if(!Array.isArray(mapping)||mapping.length!==ports.length)return reject('Необходимо сопоставить каждый порт с отдельным виртуальным интерфейсом.');
 const matches=new Map(),targets=new Set();
 for(const m of mapping){
  if(!m||!validName(m.source)||typeof m.target!=='string'||!/^ether[2-5]$/.test(m.target)||matches.has(m.source)||targets.has(m.target))return reject('Некорректное или повторное сопоставление портов.');
  matches.set(m.source,m.target);targets.add(m.target);
 }
 const portItems=[],sources=new Set();
 for(const port of ports){
  if(!port||port.bridge!==bridge.name||!validName(port.interface)||sources.has(port.interface)||!matches.has(port.interface)||port.disabled!=='false'||port.pvid!=='1'||port['ingress-filtering']!=='false'||port['frame-types']!=='admit-all')return reject('Неизвестные или неподдерживаемые параметры портов; все порты должны принадлежать единственному мосту.');
  const matchingInterfaces=sections.get('interfaces').rows.filter(iface=>iface&&iface.name===port.interface);
  if(matchingInterfaces.length!==1||matchingInterfaces[0].type!=='ether')return reject('Каждый выбранный порт должен быть единственным считанным Ethernet-интерфейсом.');
  sources.add(port.interface);portItems.push({kind:'port',target:matches.get(port.interface),bridge:'audit-lan'});
 }
 const addresses=sections.get('addresses').rows;
 if(addresses.length!==1)return reject('Поддерживается ровно одна статическая запись IPv4 и никакие дополнительные адреса.');
 const address=addresses[0];
 if(!address||address.interface!==bridge.name||address.disabled!=='false'||address.dynamic!=='false'||!validAddress(address.address))return reject('Адрес моста должен быть включённым, статическим и корректным IPv4 /8–/30; неизвестные значения не допускаются.');
 out.items=[{kind:'bridge',name:'audit-lan',protocol:'rstp',vlanFiltering:false},...portItems,{kind:'ipv4',address:address.address,interface:'audit-lan'}];
 out.skipped.push('Все другие параметры моста, портов и адреса, аппаратная обработка, секреты, скрипты и несчитанные разделы не включены в модель.');
 for(const [id,title] of omitted){
  const section=sections.get(id);
  if(section&&section.status==='ok'&&Array.isArray(section.rows)&&section.rows.length<=2000)out.skipped.push(title+': получено записей '+section.rows.length+'; этот раздел в модель не включён.');
  else out.skipped.push(title+': раздел недоступен или не считывался; его содержание неизвестно и в модель не включено.');
 }
 return out;
}
module.exports={validAddress,preview};
