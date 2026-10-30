#!/usr/bin/env node
'use strict';
// Windows CI: disposable VM, loopback WebFig/REST, no physical network.
const path = require('path');
const fs = require('fs');
const http = require('http');
const assert = require('assert');
const { ChrSession } = require('../windows/chr/session');
const { makePlan } = require('../windows/chr/plan');
const engine = require('../app/js/lab-sim');
const testState = require('./chr-ci-fixture').state;
const [qemu,image,fixture,work,supervisor] = process.argv.slice(2);
if (!qemu || !image || !fixture || !work || !supervisor) throw Error('Missing CI paths');
const commands = JSON.parse(fs.readFileSync(fixture,'utf8').replace(/^\uFEFF/,''));
const events = [];
const session = new ChrSession({qemu:path.resolve(qemu), image:path.resolve(image), tempRoot:path.resolve(work), supervisor:path.resolve(supervisor), diagnostic:event => events.push(event)});
function get(url, user, password, route) {
  const root = new URL(url);
  return new Promise((resolve, reject) => {
    const request = http.get({hostname:'127.0.0.1',port:root.port,path:route,timeout:15000,headers:{authorization:'Basic ' + Buffer.from(user + ':' + password).toString('base64')}}, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; if (body.length > 500000) request.destroy(); });
      res.on('end', () => { if (res.statusCode !== 200) return reject(Error('CHR HTTP response ' + res.statusCode)); try { resolve(JSON.parse(body)); } catch (_) { reject(Error('Invalid CHR REST response')); } });
    });
    request.on('timeout', () => request.destroy(Error('CHR REST timeout'))); request.on('error', reject);
  });
}
(async () => {
  const plan = makePlan(engine, testState, 'r');
  assert.deepStrictEqual(plan.blockers, []);
  assert.deepStrictEqual(plan.groups.flatMap(g => g.commands), commands);
  const info = await session.start(plan);
  assert.strictEqual(new URL(info.url).hostname,'127.0.0.1');
  const resource = await get(info.url, info.user, info.password, '/rest/system/resource');
  assert(/^7\.23\.8/.test(resource.version)); assert.strictEqual(resource['architecture-name'],'x86_64');
  const addresses = await get(info.url, info.user, info.password, '/rest/ip/address');
  assert(addresses.some(x => x.address === '192.168.88.1/24' && x.interface === 'bridge-lan'));
  assert(addresses.some(x => x.address === '192.168.99.1/24' && x.interface === 'vlan-guest'));
  assert(addresses.some(x => x.address === '198.51.100.2/30' && x.interface === 'ether1'));
  const bridges = await get(info.url, info.user, info.password, '/rest/interface/bridge');
  assert(bridges.some(x => x.name === 'bridge-lan' && x['vlan-filtering'] === 'true'));
  const nat = await get(info.url, info.user, info.password, '/rest/ip/firewall/nat');
  assert(nat.some(x => x.chain === 'srcnat' && x.action === 'masquerade'));
  const firewall = await get(info.url, info.user, info.password, '/rest/ip/firewall/filter');
  assert(firewall.some(x => x.chain === 'input' && x.action === 'drop'));
  const dhcp = await get(info.url, info.user, info.password, '/rest/ip/dhcp-server');
  assert(dhcp.some(x => x.name === 'dhcp-lan' && x.disabled === 'false'));
  assert(dhcp.some(x => x.name === 'dhcp-guest' && x.disabled === 'false'));
  const dir = session.directory;
  await session.stop();
  assert(!fs.existsSync(dir));
  console.log('Windows CHR session: isolated QEMU, loopback REST, applied LAN/VLAN/DHCP and cleanup verified.');
})().catch(e => { const msg=String(e.message).replace(/[\r\n%]/g, ' '); console.error('CHR session test failed:', msg); console.log('::error title=CHR session test::' + msg); console.log('::notice title=CHR network diagnostics::' + JSON.stringify(events)); process.exitCode = 1; }).finally(() => session.stop().catch(e => {console.error('Cleanup failed:',e.message);process.exitCode=1;}));
