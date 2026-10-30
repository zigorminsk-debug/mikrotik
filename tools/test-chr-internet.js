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
  session = new ChrSession({qemu:path.resolve(qemu),image:path.resolve(image),tempRoot:path.resolve(work),supervisor:path.resolve(supervisor),testInternet:true,diagnoseManagement:true,diagnostic:e=>events.push(e)});
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
  // This test checks connectivity only, not TLS trust. No secret is sent.
  await session.console.command('/tool fetch url="https://github.com/" output=none check-certificate=no');
  console.log('::notice title=CHR outbound test::HTTPS fetch from guest completed; TLS certificate validation was not tested.');
})().catch(e => { console.log('::error title=CHR outbound test::' + String(e.message).replace(/[\r\n%]/g,' ')); console.log('::notice title=CHR outbound diagnostics::' + JSON.stringify(events)); process.exitCode=1; }).finally(async () => { if (session) await session.stop(); });
