'use strict';
// CI/research only. Never accept RouterOS command text or a prebuilt plan from
// the renderer. Re-derive a very small, typed IR from the sanitized snapshot.
// There is no VM launcher, network access, IPC, persistence or export here.
const {preview,validAddress}=require('./import-plan');
function compile(snapshot,mapping){
 const plan=preview(snapshot,mapping);
 if(!Array.isArray(plan.items)||!plan.items.length)return {ok:false,commands:[],checks:[],skipped:plan.skipped,limitations:plan.limitations};
 const bridges=plan.items.filter(x=>x.kind==='bridge'),ports=plan.items.filter(x=>x.kind==='port'),addresses=plan.items.filter(x=>x.kind==='ipv4');
 // Defence in depth: even if preview changes, reject everything outside the
 // exact supported schema. No source device names reach the command stream.
 if(bridges.length!==1||ports.length<1||ports.length>4||addresses.length!==1||plan.items.length!==ports.length+2)throw Error('Недопустимый план изолированного импорта.');
 const bridge=bridges[0],address=addresses[0];
 if(bridge.name!=='audit-lan'||bridge.protocol!=='rstp'||bridge.vlanFiltering!==false||address.interface!=='audit-lan'||!validAddress(address.address))throw Error('Недопустимый план изолированного импорта.');
 const used=new Set();
 for(const port of ports){if(typeof port.target!=='string'||!/^ether[2-5]$/.test(port.target)||port.bridge!=='audit-lan'||used.has(port.target))throw Error('Недопустимый план изолированного импорта.');used.add(port.target);}
 const commands=['/interface bridge add name=audit-lan protocol-mode=rstp vlan-filtering=no disabled=no'];
 const checks=[{id:'bridge',query:':if ([:len [/interface bridge find where name=audit-lan and protocol-mode=rstp and vlan-filtering=no and disabled=no]] != 1) do={:error "audit-bridge-mismatch"}'}];
 for(const port of ports){
  commands.push('/interface bridge port add bridge=audit-lan interface='+port.target+' pvid=1 ingress-filtering=no frame-types=admit-all disabled=no');
  checks.push({id:'port:'+port.target,query:':if ([:len [/interface bridge port find where bridge=audit-lan and interface='+port.target+' and pvid=1 and ingress-filtering=no and frame-types=admit-all and disabled=no]] != 1) do={:error "audit-port-mismatch"}'});
 }
 commands.push('/ip address add address='+address.address+' interface=audit-lan disabled=no');
 checks.push({id:'ipv4',query:':if ([:len [/ip address find where address="'+address.address+'" and interface=audit-lan and disabled=no and dynamic=no]] != 1) do={:error "audit-ipv4-mismatch"}'});
 return {ok:true,commands,checks,preview:plan,skipped:plan.skipped,limitations:plan.limitations};
}
module.exports={compile};
