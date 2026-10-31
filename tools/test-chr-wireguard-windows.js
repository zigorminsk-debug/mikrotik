#!/usr/bin/env node
'use strict';
// Windows CI-only experiment. The application preflight remains blocked.
// Deliberately no inbound WAN forwarding, network access or client private keys.
const assert=require('assert');
const path=require('path');
const fs=require('fs');
const {generateKeyPairSync}=require('crypto');
const {ChrSession}=require('../windows/chr/session');
const {makePlan}=require('../windows/chr/plan');
const {makeReader,verifyWireguard}=require('../windows/chr/verify');
const engine=require('../app/js/lab-sim');
const base=require('./chr-ci-fixture').state;
const [qemu,image,work,supervisor]=process.argv.slice(2);
if(!qemu||!image||!work||!supervisor)throw Error('Missing CI paths');
let session;
const events=[];
(async()=>{
  const state=JSON.parse(JSON.stringify(base));
  const peerPublicKey=generateKeyPairSync('x25519').publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64');
  const cfg=state.devices.find(d=>d.id==='r').cfg;
  Object.assign(cfg,{vpn:true,vpnType:'wireguard',vpnPool:'10.10.10.0/24',vpnPort:'13231',vpnPeer:peerPublicKey});
  assert(makePlan(engine,state,'r').blockers.length,'Normal application must still block VPN');
  // A test-created plan only: no bypass in main-process makePlan/preflight.
  const plan=makePlan(engine,base,'r'); assert.deepStrictEqual(plan.blockers,[]);
  const result=engine.run(state); assert.deepStrictEqual(result.errors,[]);
  plan.groups=result.groups.filter(g=>g.id!=='verify').map(g=>({id:g.id,commands:g.code.split('\n').filter(x=>x&&!x.startsWith('#'))}));
  assert(plan.groups.some(g=>g.id==='vpn'));
  plan.expected.filterRules=plan.groups.filter(g=>g.id==='filter').flatMap(g=>g.commands).map(command=>{
    const props={};for(const m of command.matchAll(/\b([a-z][a-z-]*)=([^\s]+)/g))props[m[1]]=m[2];return props;
  });
  plan.expected.wireguard={port:'13231',address:'10.10.10.1/24',allowedAddress:'10.10.10.2/32',peerPublicKey};
  session=new ChrSession({qemu:path.resolve(qemu),image:path.resolve(image),tempRoot:path.resolve(work),supervisor:path.resolve(supervisor),diagnostic:e=>events.push(e),diagnoseManagement:true});
  const info=await session.start(plan); // Applies generated commands and REST checks, including WireGuard.
  const get=makeReader(Number(new URL(info.url).port),info.user,info.password);
  // Check negative cases against the real CHR; do not print REST payloads.
  await session.console.command('/interface wireguard peers disable [find]');
  await assert.rejects(verifyWireguard(plan.expected.wireguard,get),/peer WireGuard/);
  await session.console.command('/interface wireguard peers enable [find]');
  await verifyWireguard(plan.expected.wireguard,get);
  await session.console.command('/interface wireguard set [find where name="wg-lab"] listen-port=13232');
  await assert.rejects(verifyWireguard(plan.expected.wireguard,get),/интерфейс WireGuard/);
  const dir=session.directory;await session.stop();assert(!fs.existsSync(dir));session=null;
  console.log('::notice title=Isolated Windows CHR WireGuard::Generated settings applied to one disposable CHR and verified via REST. Disabled peer and altered port were detected. No VPN tunnel, inbound forwarding, external network or user GUI tested.');
})().catch(err=>{console.log('::error title=Windows WireGuard CI::'+String(err.message).replace(/[\r\n%]/g,' '));console.log('::notice title=CHR diagnostic::'+JSON.stringify(events));process.exitCode=1;}).finally(async()=>{if(session)await session.stop().catch(()=>{console.log('::error title=Cleanup::Unable to remove disposable session');process.exitCode=1;});});
