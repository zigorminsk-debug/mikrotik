#!/usr/bin/env node
'use strict';
// CI-only: one product CHR controller plus two Linux guest controllers, built
// from a non-default synthetic scheme using the application planner.
const path=require('path'),fs=require('fs').promises,assert=require('assert');
const {randomBytes}=require('crypto');
const engine=require('../app/js/lab-sim'),{ExperimentalLab}=require('../windows/chr/experimental-lab');
const [qemu,chrImage,linuxImage,tempRoot,supervisor]=process.argv.slice(2).map(x=>x&&path.resolve(x));
if(!qemu||!chrImage||!linuxImage||!tempRoot||!supervisor)throw Error('Expected fixed CI image and supervisor paths');
const mode=process.env.CI_L2_MODE;if(!['direct','hub'].includes(mode))throw Error('CI mode is required');
const state={devices:[
 {id:'isp',type:'isp',name:'ISP',cfg:{kind:'static',priority:'primary',ip:'198.51.100.2/30',gw:'198.51.100.1',dns:'1.1.1.1'}},
 {id:'router',type:'router',name:'Router',cfg:{lan:'192.168.73.0/24',gw:'192.168.73.1',dhcp:true,nat:true,firewall:true,vpn:false}},
 {id:'pc',type:'pc',name:'PC',cfg:{mode:'dhcp',segment:'main'}},
 {id:'server',type:'server',name:'Server',cfg:{mode:'static',ip:'192.168.73.20/24',gw:'192.168.73.1',segment:'main'}}
],links:[{a:'isp',b:'router'}]};
if(mode==='hub'){state.devices.push({id:'switch',type:'switch',name:'Switch',cfg:{}});state.links.push({a:'router',b:'switch'},{a:'switch',b:'pc'},{a:'switch',b:'server'});}
else state.links.push({a:'router',b:'pc'},{a:'router',b:'server'});
let stage='preflight';const opts={engine,state,routerId:'router',qemu,chrImage,linuxImage,tempRoot,supervisor};const lab=new ExperimentalLab(opts);
async function nic(guest,up){
 const token='CI'+randomBytes(16).toString('hex'),a=token.slice(0,16),b=token.slice(16),c=guest.console;
 await c.settle();c.send('sudo ip link set eth0 '+(up?'up':'down')+`; result=$?; printf '%s%s%sEND\\n' '${a}' '${b}' "$result"`);
 const result=await c.expect(new RegExp(token+'[0-9]+END'),30000);assert.equal(result,token+'0END');
}
(async()=>{
 stage='start router and clients from scheme';const info=await lab.start();
 const pc=info.clients.find(x=>x.id==='pc'),server=info.clients.find(x=>x.id==='server');
 assert(pc&&server);assert(/^192\.168\.73\./.test(pc.address));assert.equal(pc.mode,'dhcp');assert.equal(server.address,'192.168.73.20');assert.equal(server.mode,'static');
 stage='PC to server';assert.deepStrictEqual(await lab.pingClient('pc',server.address),{sent:3,received:3});
 stage='server to PC';assert.deepStrictEqual(await lab.pingClient('server',pc.address),{sent:3,received:3});
 stage='router to clients';assert.equal((await lab.router.ping(pc.address)).received,3);assert.equal((await lab.router.ping(server.address)).received,3);
 stage='negative and recovery';await nic(lab.guests.get('server'),false);assert.equal((await lab.pingClient('pc',server.address)).received,0);await nic(lab.guests.get('server'),true);assert.equal((await lab.pingClient('pc',server.address)).received,3);
 stage='close and erase';await lab.stop();assert.deepStrictEqual(await fs.readdir(tempRoot),[]);
 stage='cancel during startup';const cancelled=new ExperimentalLab(opts),starting=cancelled.start().then(()=>{throw Error('Expected startup cancellation');},e=>e);
 await new Promise(ok=>setTimeout(ok,2000));await cancelled.stop();const outcome=await starting;assert(outcome instanceof Error);assert.deepStrictEqual(await fs.readdir(tempRoot),[]);
 console.log('::notice title=Real scheme-based virtual clients::Actual application planner and CHR controller with two real Linux guests in '+mode+' topology, non-default LAN, DHCP and static; bidirectional ICMP, NIC negative/recovery, start cancellation and cleanup passed. Isolated CI only, no UI, VPN, external networking or physical devices.');
})().catch(e=>{console.log('::error title=Scheme-based Linux clients::'+stage+': '+String(e.message).replace(/[\r\n%]/g,' '));process.exitCode=1;}).finally(async()=>{try{await lab.stop();}catch(_){console.log('::error title=Cleanup::Disposable lab cleanup failed');process.exitCode=1;}});
