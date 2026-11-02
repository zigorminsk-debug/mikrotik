#!/usr/bin/env node
'use strict';
const assert=require('assert');
const engine=require('../app/js/lab-sim'),{ExperimentalLab,reservePort}=require('../windows/chr/experimental-lab'),{EthernetHub}=require('../windows/chr/ethernet-hub');
const state=()=>({devices:[
{id:'i',type:'isp',name:'ISP',cfg:{kind:'static',priority:'primary',ip:'198.51.100.2/30',gw:'198.51.100.1',dns:'1.1.1.1'}},
{id:'r',type:'router',name:'R',cfg:{lan:'192.168.73.0/24',gw:'192.168.73.1',dhcp:true,nat:true,firewall:true,vpn:false}},
{id:'pc',type:'pc',name:'PC',cfg:{mode:'dhcp',segment:'main'}}],links:[{a:'i',b:'r'},{a:'r',b:'pc'}]});
const opts={engine,state:state(),routerId:'r',qemu:'ignored',chrImage:'ignored',linuxImage:'ignored',tempRoot:'ignored',supervisor:'ignored'};
(async()=>{
 const invalid=state();invalid.devices[1].cfg.dhcp=false;assert.throws(()=>new ExperimentalLab({...opts,state:invalid}),/схем/i);
 const printer=state();printer.devices[2].type='printer';assert.throws(()=>new ExperimentalLab({...opts,state:printer}),/принтер/i);
 const collision=state();collision.devices[2].cfg={mode:'static',segment:'main',ip:'192.168.73.100/24',gw:'192.168.73.1'};assert.throws(()=>new ExperimentalLab({...opts,state:collision}),/схем|DHCP/i);
 const used=new Set(),a=await reservePort(used),b=await reservePort(used);assert(a!==b&&used.has(a)&&used.has(b));
 const stopped=new ExperimentalLab(opts);await stopped.stop();await assert.rejects(stopped.start(),/уже использована/);
 // Cancel while the hub is being created: stop must wait for the newly
 // returned hub and close it instead of losing it during asynchronous startup.
 const original=EthernetHub.create;let entered,release,closed=0;
 const ready=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});
 EthernetHub.create=async()=>{entered();await gate;return {port:2000,close:async()=>{closed++;}};};
 try {
  const lab=new ExperimentalLab({...opts,state:state()}),starting=lab.start();await ready;let done=false;
  const stopping=lab.stop();assert.strictEqual(lab.stop(),stopping);stopping.then(()=>{done=true;});
  await new Promise(r=>setTimeout(r,30));assert.equal(done,false);release();await assert.rejects(starting,/остановлена/);await stopping;assert.equal(closed,1);
 } finally {EthernetHub.create=original;release();}
 console.log('Эксперимент схемы: preflight, UDP-порты и отмена во время создания коммутатора проверены; реальные VM и сеть — отдельный CI.');
})().catch(e=>{console.error(e);process.exitCode=1;});
