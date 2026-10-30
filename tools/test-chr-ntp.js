#!/usr/bin/env node
'use strict';
// Windows CI only. Two isolated disposable CHRs; never contacts a physical router.
// This checks configuration, NOT real NTP reachability or clock synchronization.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { ChrSession } = require('../windows/chr/session');
const { makePlan } = require('../windows/chr/plan');
const { makeReader } = require('../windows/chr/verify');
const engine = require('../app/js/lab-sim');
const base = require('./chr-ci-fixture').state;
const [qemu,image,work,supervisor] = process.argv.slice(2);
if (!qemu || !image || !work || !supervisor) throw Error('Missing CI paths');
const events = [];
let session;
(async () => {
  for (const server of ['192.0.2.123', 'pool.ntp.org']) {
    const state = JSON.parse(JSON.stringify(base));
    Object.assign(state.devices.find(d=>d.id==='r').cfg, {ntpClient:true, ntpServer:server, timeZone:'Europe/Minsk'});
    const plan = makePlan(engine,state,'r');
    assert.deepStrictEqual(plan.blockers,[]);
    session = new ChrSession({qemu:path.resolve(qemu),image:path.resolve(image),tempRoot:path.resolve(work),supervisor:path.resolve(supervisor),diagnostic:e=>events.push(e),diagnoseManagement:true});
    const info = await session.start(plan); // Applies commands and verifies via REST.
    const get = makeReader(Number(new URL(info.url).port),info.user,info.password);
    const [clock,ntp,servers] = await Promise.all([get('/rest/system/clock'),get('/rest/system/ntp/client'),get('/rest/system/ntp/client/servers')]);
    assert.equal(clock['time-zone-name'],'Europe/Minsk');
    assert.equal(String(clock['time-zone-autodetect']),'false');
    assert.equal(String(ntp.enabled),'true');
    assert.equal(servers.length,1); assert.equal(servers[0].address,server);
    const dir=session.directory; await session.stop(); assert(!fs.existsSync(dir)); session=null;
    console.log('::notice title=Isolated CHR NTP settings::Selected '+(server.includes(':') ? 'address' : server)+' and time zone were applied and verified on RouterOS 7.23.8. No NTP synchronization or external access tested.');
  }
})().catch(e=>{console.log('::error title=Isolated CHR NTP test::'+String(e.message).replace(/[\r\n%]/g,' '));console.log('::notice title=CHR diagnostic::'+JSON.stringify(events));process.exitCode=1;}).finally(async()=>{if(session) await session.stop().catch(e=>{console.error('Cleanup failed:',e.message);process.exitCode=1;});});
