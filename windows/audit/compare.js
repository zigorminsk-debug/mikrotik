'use strict';
// Research only. Compares a non-executable preview to selected read-back data;
// it does not start CHR or imply real connectivity, isolation or equivalence.
const {validAddress}=require('./import-plan');
const WARNING='Сравнены только выбранные значения. Остальные разделы, скрытые поля, оборудование, секреты, скрипты и трафик не проверены; совпадение не означает полной копии.';
function compare(plan,observed){
 if(!plan||plan.executable!==false||plan.complete!==false||!Array.isArray(plan.items)||plan.items.length<3||plan.items.length>6)throw Error('Недопустимый предварительный план.');
 const bridges=plan.items.filter(x=>x&&x.kind==='bridge'),ports=plan.items.filter(x=>x&&x.kind==='port'),addresses=plan.items.filter(x=>x&&x.kind==='ipv4');
 if(bridges.length!==1||ports.length<1||ports.length>4||addresses.length!==1||bridges.length+ports.length+addresses.length!==plan.items.length)throw Error('Недопустимый состав плана.');
 const bridge=bridges[0],addr=addresses[0];
 if(bridge.name!=='audit-lan'||bridge.protocol!=='rstp'||bridge.vlanFiltering!==false||addr.interface!=='audit-lan'||!validAddress(addr.address))throw Error('Недопустимые значения плана.');
 const targetNames=new Set();for(const p of ports){if(typeof p.target!=='string'||!/^ether[2-5]$/.test(p.target)||p.bridge!=='audit-lan'||targetNames.has(p.target))throw Error('Недопустимые порты плана.');targetNames.add(p.target);}
 if(!observed||!Array.isArray(observed.sections)||observed.sections.length>40)throw Error('Недопустимое состояние VM.');
 const sections=new Map();for(const section of observed.sections){if(!section||typeof section.id!=='string'||sections.has(section.id))throw Error('Недопустимый раздел VM.');sections.set(section.id,section);}
 const data=id=>{const section=sections.get(id);return section&&section.status==='ok'&&Array.isArray(section.rows)&&section.rows.length<=2000?section.rows:null;};
 const differences=[];const checks=[];
 function check(id,rows,selector,expected){
  if(!rows){checks.push({id,status:'unknown'});return;}
  const matches=rows.filter(selector);
  if(matches.length!==1){checks.push({id,status:'different'});return;}
  const row=matches[0];if(!row||typeof row!=='object'||Array.isArray(row)){checks.push({id,status:'unknown'});return;}
  let missing=false,different=false;
  for(const [key,value] of Object.entries(expected)){
   if(!Object.prototype.hasOwnProperty.call(row,key))missing=true;
   else if(typeof row[key]!=='string')missing=true;
   else if(row[key]!==value)different=true;
  }
  checks.push({id,status:different?'different':missing?'unknown':'match'});
 }
 const actualBridges=data('bridge'),actualPorts=data('bridge-ports'),actualAddresses=data('addresses'),actualVlans=data('bridge-vlans');
 check('bridge',actualBridges,r=>r&&r.name==='audit-lan',{disabled:'false','protocol-mode':'rstp','vlan-filtering':'false'});
 for(const p of ports)check('port:'+p.target,actualPorts,r=>r&&r.bridge==='audit-lan'&&r.interface===p.target,{disabled:'false',pvid:'1','ingress-filtering':'false','frame-types':'admit-all'});
 check('ipv4',actualAddresses,r=>r&&r.interface==='audit-lan'&&r.address===addr.address,{disabled:'false',dynamic:'false'});
 for(const [id,rows,isExtra] of [
  ['bridge',actualBridges,r=>!r||r.name!=='audit-lan'],
  ['bridge-ports',actualPorts,r=>!r||r.bridge!=='audit-lan'||!targetNames.has(r.interface)],
  ['addresses',actualAddresses,r=>!r||r.interface!=='audit-lan'||r.address!==addr.address],
  ['bridge-vlans',actualVlans,()=>true]
 ]){
  if(!rows)differences.push({id,status:'unknown',count:null});
  else {const count=rows.filter(isExtra).length;differences.push({id,status:count?'additional':'none-observed',count});}
 }
 return {complete:false,warning:WARNING,checks,differences};
}
module.exports={compare};
