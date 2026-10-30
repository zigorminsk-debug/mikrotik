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
const state = JSON.parse(JSON.stringify(require('./chr-ci-dual-wan-fixture').state));
const internet = process.env.CHR_DUAL_INTERNET === '1';
if (internet) {
  Object.assign(state.devices.find(d=>d.id==='isp').cfg,{ip:'10.0.2.20/24',gw:'10.0.2.2',dns:'10.0.2.3'});
  Object.assign(state.devices.find(d=>d.id==='isp2').cfg,{ip:'10.0.3.20/24',gw:'10.0.3.2',dns:'10.0.3.3'});
  Object.assign(state.devices.find(d=>d.id==='r').cfg,{customDns:true,dnsPrimary:'10.0.2.3',dnsSecondary:'10.0.3.3'});
}
const [qemu,image,work,supervisor] = process.argv.slice(2);
if (!qemu || !image || !work || !supervisor) throw Error('Missing CI paths');
const events = [];
const session = new ChrSession({qemu:path.resolve(qemu),image:path.resolve(image),tempRoot:path.resolve(work),supervisor:path.resolve(supervisor),diagnostic:e=>events.push(e),diagnoseManagement:true,internetConsent:internet});
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
  assert(plan.expected.wans.some(w=>w.address===(internet ? '10.0.3.20/24' : '198.51.101.2/30') && w.gateway===(internet ? '10.0.3.2' : '198.51.101.1') && w.distance==='2'));
  if (internet) {
    async function waitActive(gateway) {
      for (let i=0;i<45;i++) {
        const rs=await get('/rest/ip/route');
        if (rs.some(x=>x['dst-address']==='0.0.0.0/0' && x.gateway===gateway && (x.active===true || x.active==='true'))) return;
        await new Promise(r=>setTimeout(r,1000));
      }
      throw Error('Ожидаемый маршрут не активировался: '+gateway);
    }
    const fetch='/tool fetch url="https://api.github.com/zen" output=none check-certificate=no';
    await waitActive('10.0.2.2'); await session.console.command(fetch);
    console.log('::notice title=Dual WAN primary::Selected configuration fetched a short response; TLS validation is disabled in this test.');
    await session.console.command('/interface ethernet disable [find where name=ether1]');
    await waitActive('10.0.3.2'); await session.console.command(fetch);
    console.log('::notice title=Dual WAN backup::After disabling ether1, the selected backup route became active and fetched a short response.');
    await session.console.command('/interface ethernet enable [find where name=ether1]');
    await waitActive('10.0.2.2'); await session.console.command(fetch);
    console.log('::notice title=Dual WAN restore::After enabling ether1, the primary route became active and fetched a short response.');
  }
  const dir=session.directory; await session.stop(); assert(!fs.existsSync(dir));
  console.log('::notice title=Dual static WAN configuration::Two selected WAN addresses, list members and ordered default routes verified by REST on CHR. ' + (internet ? 'Both virtual WANs use the same runner internet; TLS validation was disabled. No independent providers or clients were tested.' : 'No internet or packet failover was tested.'));
})().catch(e=>{
  console.log('::error title=Dual static WAN verification::'+String(e.message).replace(/[\r\n%]/g,' '));
  console.log('::notice title=Dual static WAN diagnostics::'+JSON.stringify(events));
  process.exitCode=1;
}).finally(()=>session.stop().catch(()=>{process.exitCode=1;}));
