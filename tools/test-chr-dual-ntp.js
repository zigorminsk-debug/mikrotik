#!/usr/bin/env node
'use strict';
// CI only: disposable Windows runner, locally bound synthetic UDP NTP server,
// real CHR with the two approved QEMU NATs. Never accesses a user's router.
// This tests one local source, not public NTP, client VMs or independent ISPs.
const assert = require('assert');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const {ChrSession} = require('../windows/chr/session');
const {makePlan} = require('../windows/chr/plan');
const {makeReader} = require('../windows/chr/verify');
const engine = require('../app/js/lab-sim');
const state = JSON.parse(JSON.stringify(require('./chr-ci-dual-wan-fixture').state));
Object.assign(state.devices.find(d=>d.id==='isp').cfg,{ip:'10.0.2.20/24',gw:'10.0.2.2',dns:'10.0.2.3'});
Object.assign(state.devices.find(d=>d.id==='isp2').cfg,{ip:'10.0.3.20/24',gw:'10.0.3.2',dns:'10.0.3.3'});
Object.assign(state.devices.find(d=>d.id==='r').cfg,{customDns:true,dnsPrimary:'10.0.2.3',dnsSecondary:'10.0.3.3',ntpClient:true,ntpServer:'10.0.2.2',timeZone:'Europe/Minsk'});
const [qemu,image,work,supervisor] = process.argv.slice(2);
if (![qemu,image,work,supervisor].every(Boolean)) throw Error('Missing CI paths');
const events = [];
const session = new ChrSession({qemu:path.resolve(qemu),image:path.resolve(image),tempRoot:path.resolve(work),supervisor:path.resolve(supervisor),diagnostic:e=>events.push(e),diagnoseManagement:true,internetConsent:true});
const udp = dgram.createSocket('udp4');
let requests = 0, latestStatus = 'not read';
function timestamp(buffer, offset, milliseconds) {
  const unixSeconds=Math.floor(milliseconds/1000), fraction=Math.floor((milliseconds%1000)*0x100000000/1000);
  buffer.writeUInt32BE(unixSeconds+2208988800,offset); buffer.writeUInt32BE(fraction,offset+4);
}
udp.on('message',(packet,peer)=>{
  if (packet.length < 48 || (packet[0]&7)!==3) return;
  requests++;
  const reply=Buffer.alloc(48); reply[0]=0x24; reply[1]=1; reply[2]=6; reply[3]=0xec;
  reply.write('TEST',12,4,'ascii');
  const now=Date.now();timestamp(reply,16,now-1000);packet.copy(reply,24,40,48);timestamp(reply,32,now);timestamp(reply,40,Date.now());
  udp.send(reply,peer.port,peer.address);
});
(async()=>{
  await new Promise((resolve,reject)=>{udp.once('error',reject);udp.bind({port:123,address:'127.0.0.1',exclusive:true},resolve);});
  const plan=makePlan(engine,state,'r',{allowDualStaticWan:true});assert.deepStrictEqual(plan.blockers,[]);
  assert.deepStrictEqual(plan.expected.ntp,{server:'10.0.2.2',zone:'Europe/Minsk'});
  const info=await session.start(plan);
  const get=makeReader(Number(new URL(info.url).port),info.user,info.password);
  // RouterOS NTP may poll slowly; inspect actual status and local request count.
  for(let i=0;i<120;i++){
    const ntp=await get('/rest/system/ntp/client');latestStatus=ntp.status || 'missing';
    if(latestStatus==='synchronized' && requests>0) break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert(requests>0,'No NTP packets reached the synthetic local server');
  assert.equal(latestStatus,'synchronized','CHR did not report NTP synchronization');
  async function active(gateway){for(let i=0;i<45;i++){const routes=await get('/rest/ip/route');if(routes.some(r=>r['dst-address']==='0.0.0.0/0'&&r.gateway===gateway&&(r.active===true||r.active==='true')))return;await new Promise(r=>setTimeout(r,1000));}throw Error('Expected route not active: '+gateway);}
  await active('10.0.2.2');
  await session.console.command('/interface ethernet disable [find where name=ether1]');await active('10.0.3.2');
  await session.console.command('/interface ethernet enable [find where name=ether1]');await active('10.0.2.2');
  const dir=session.directory;await session.stop();assert(!fs.existsSync(dir));
  console.log('::notice title=CHR NTP and WAN failover::Real CHR synchronized with a synthetic NTP server on the Windows runner via the primary QEMU NAT, then switched to and restored the primary route. NTP over backup and public NTP were not tested; both WANs use one host.');
})().catch(e=>{console.log('::error title=CHR NTP experiment::'+String(e.message).replace(/[\r\n%]/g,' '));console.log('::notice title=NTP experiment diagnostics::'+JSON.stringify({requests,latestStatus,events}));process.exitCode=1;}).finally(async()=>{try { udp.close(); } catch (_) {} await session.stop().catch(e=>{console.error('Cleanup failed:',e.message);process.exitCode=1;});});
