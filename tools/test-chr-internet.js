#!/usr/bin/env node
'use strict';
// CI-only research: real outbound access from a disposable CHR on an ephemeral
// GitHub runner. Not used by the app, and no incoming WAN port is forwarded.
const path = require('path');
const assert = require('assert');
const {randomBytes} = require('crypto');
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
  // github.com may return headers larger than RouterOS fetch supports. Use
  // a small public endpoint to distinguish HTTP parsing failure from no WAN.
  await session.console.command('/tool fetch url="https://api.github.com/zen" output=none check-certificate=no');
  console.log('::notice title=CHR small outbound fetch::Small HTTPS response fetched; TLS trust and failover are not tested.');
  // CI only, fixed public URL and no credentials: report the RouterOS error
  // without exposing the general-purpose console to the app or renderer.
  const token = 'NETDIAG' + randomBytes(12).toString('hex');
  const marker = '"' + token.slice(0,16) + '" . "' + token.slice(16) + '"';
  const command = ':onerror e in={ /tool fetch url="https://github.com/" output=none check-certificate=no; :put (' + marker + ' . "OKEND") } do={ :put (' + marker + ' . "ERR" . $e . "END") }';
  await session.console.settle(); session.console.send(command);
  let reply;
  try { reply = await session.console.expect(new RegExp(token + '(?:OK|ERR)[^\\r\\n]*?END'), 60000); }
  catch (error) {
    // Only the fixed public-URL command above has run since settle(); no
    // credentials or arbitrary customer commands are printed by this test.
    const raw = session.console.buffer.slice(-2500).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/[\x00-\x1f\x7f%]/g, ' ');
    console.log('::notice title=CHR fixed fetch console::' + raw);
    throw error;
  }
  const diagnostic = reply.slice(token.length, -3).replace(/[\x00-\x1f\x7f%]/g, ' ').slice(0,300);
  console.log('::notice title=CHR outbound result::' + diagnostic);
  assert.strictEqual(diagnostic, 'OK', 'Outbound request from CHR failed; see diagnostic annotation');
  console.log('::notice title=CHR outbound test::HTTPS fetch from guest completed; TLS certificate validation was not tested.');
})().catch(e => { console.log('::error title=CHR outbound test::' + String(e.message).replace(/[\r\n%]/g,' ')); console.log('::notice title=CHR outbound diagnostics::' + JSON.stringify(events)); process.exitCode=1; }).finally(async () => { if (session) await session.stop(); });
