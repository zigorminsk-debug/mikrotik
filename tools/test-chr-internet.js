#!/usr/bin/env node
'use strict';
// CI-only research: real outbound access from a disposable CHR on an ephemeral
// GitHub runner. Not used by the app, and no incoming WAN port is forwarded.
const path = require('path');
const assert = require('assert');
const engine = require('../app/js/lab-sim');
const {makePlan} = require('../windows/chr/plan');
const {ChrSession} = require('../windows/chr/session');
const {makeReader} = require('../windows/chr/verify');
const state = JSON.parse(JSON.stringify(require('./chr-ci-fixture').state));
Object.assign(state.devices[0].cfg, {ip:'10.0.2.20/24',gw:'10.0.2.2',dns:'10.0.2.3'});
const [qemu,image,work,supervisor] = process.argv.slice(2);
const events = [];
let session;
(async () => {
  assert(qemu && image && work && supervisor);
  const plan = makePlan(engine,state,'r');
  assert.deepStrictEqual(plan.blockers, []);
  session = new ChrSession({qemu:path.resolve(qemu),image:path.resolve(image),tempRoot:path.resolve(work),supervisor:path.resolve(supervisor),testInternet:true,testBackupInternet:true,diagnoseManagement:true,diagnostic:e=>events.push(e)});
  const info = await session.start(plan);
  const get = makeReader(Number(new URL(info.url).port), info.user, info.password);
  const routes = await get('/rest/ip/route');
  console.log('::notice title=CHR default routes::' + JSON.stringify(routes.filter(x=>x['dst-address']==='0.0.0.0/0').map(x=>({gateway:x.gateway,active:x.active,inactive:x.inactive,disabled:x.disabled,immediate:x['immediate-gw']}))));
  const dhcp = await get('/rest/ip/dhcp-client');
  const addresses = await get('/rest/ip/address');
  const wan = addresses.filter(x => x.interface === 'ether1').map(x => ({address:x.address, dynamic:x.dynamic}));
  console.log('::notice title=CHR WAN state::' + JSON.stringify({dhcp:dhcp.map(x=>({interface:x.interface,disabled:x.disabled,status:x.status})), wan}));
  assert(!dhcp.some(x => x.interface === 'ether1' && x.disabled !== 'true' && x.disabled !== true), 'Unexpected enabled DHCP client on static WAN');
  assert(wan.length === 1 && wan[0].address === '10.0.2.20/24', 'Unexpected WAN addresses');
  // The host's internet is shared by both independent QEMU NAT segments. This
  // is NOT two physical providers and must never be presented as production.
  // TLS validation is off only for this public, secret-free CI request.
  const fetch = '/tool fetch url="https://api.github.com/zen" output=none check-certificate=no';
  await session.console.command(fetch);
  console.log('::notice title=CHR primary WAN::Small HTTPS response fetched on the primary test segment.');
  // ether4 is unused in the fixture and is the backup test WAN. The normal
  // application never constructs sessions with testBackupInternet=true.
  for (const command of [
    '/ip address add address=10.0.3.20/24 interface=ether4',
    '/interface list member add list=WAN interface=ether4',
    '/ip route set [find where dst-address="0.0.0.0/0"] check-gateway=none',
    '/ip route add dst-address=0.0.0.0/0 gateway=10.0.3.2 distance=2',
    '/ip dns set servers=10.0.3.3',
  ]) await session.console.command(command);
  async function waitActive(gateway) {
    for (let i=0;i<15;i++) {
      const list=await get('/rest/ip/route');
      if (list.some(x => x['dst-address']==='0.0.0.0/0' && x.gateway===gateway && (x.active==='true' || x.active===true))) return;
      await new Promise(r=>setTimeout(r,1000));
    }
    throw new Error('Expected default route did not become active: '+gateway);
  }
  await waitActive('10.0.2.2');
  await session.console.command('/interface ethernet disable [find where name=ether1]');
  await waitActive('10.0.3.2');
  await session.console.command(fetch);
  console.log('::notice title=CHR backup WAN::After disabling ether1, backup default route became active and fetched the small response.');
  await session.console.command('/interface ethernet enable [find where name=ether1]');
  await waitActive('10.0.2.2');
  await session.console.command(fetch);
  console.log('::notice title=CHR WAN restore::After re-enabling ether1, the primary route became active and fetched the small response.');

})().catch(e => { console.log('::error title=CHR outbound test::' + String(e.message).replace(/[\r\n%]/g,' ')); console.log('::notice title=CHR outbound diagnostics::' + JSON.stringify(events)); process.exitCode=1; }).finally(async () => { if (session) await session.stop(); });
