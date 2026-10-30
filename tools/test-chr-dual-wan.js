#!/usr/bin/env node
'use strict';
// Windows CI: verify both selected WAN configurations in a real, isolated CHR.
// This does not enable internet and does not claim working provider failover.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const {ChrSession} = require('../windows/chr/session');
const {makePlan} = require('../windows/chr/plan');
const {makeReader} = require('../windows/chr/verify');
const engine = require('../app/js/lab-sim');
const {state} = require('./chr-ci-dual-wan-fixture');
const [qemu,image,work,supervisor] = process.argv.slice(2);
if (!qemu || !image || !work || !supervisor) throw Error('Missing CI paths');
const events = [];
const session = new ChrSession({qemu:path.resolve(qemu),image:path.resolve(image),tempRoot:path.resolve(work),supervisor:path.resolve(supervisor),diagnostic:e=>events.push(e),diagnoseManagement:true});
(async () => {
  assert(makePlan(engine,state,'r').blockers.length, 'Experiment must remain inaccessible from the app');
  const plan = makePlan(engine,state,'r',{testDualStaticWan:true});
  assert.deepStrictEqual(plan.blockers, []);
  assert.equal(plan.expected.wans.length,2);
  const info = await session.start(plan); // Includes full REST verification.
  const get = makeReader(Number(new URL(info.url).port),info.user,info.password);
  const addresses = await get('/rest/ip/address'), routes = await get('/rest/ip/route'), members = await get('/rest/interface/list/member');
  for (const w of plan.expected.wans) {
    assert(addresses.some(a=>a.interface===w.port && a.address===w.address));
    assert(members.some(m=>m.list==='WAN' && m.interface===w.port));
    assert(routes.some(r=>r['dst-address']==='0.0.0.0/0' && r.gateway===w.gateway && String(r.distance)===w.distance && r['check-gateway']==='ping'));
  }
  assert(plan.expected.wans.some(w=>w.address==='198.51.101.2/30' && w.gateway==='198.51.101.1' && w.distance==='2'));
  const dir=session.directory; await session.stop(); assert(!fs.existsSync(dir));
  console.log('::notice title=Dual static WAN configuration::Two selected WAN addresses, interface list members and ordered default routes verified by REST on isolated CHR. No internet or packet failover was tested.');
})().catch(e=>{
  console.log('::error title=Dual static WAN verification::'+String(e.message).replace(/[\r\n%]/g,' '));
  console.log('::notice title=Dual static WAN diagnostics::'+JSON.stringify(events));
  process.exitCode=1;
}).finally(()=>session.stop().catch(()=>{process.exitCode=1;}));
