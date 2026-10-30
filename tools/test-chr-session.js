#!/usr/bin/env node
'use strict';
// Windows CI: disposable VM, loopback WebFig/REST, no physical network.
const path = require('path');
const fs = require('fs');
const http = require('http');
const assert = require('assert');
const { ChrSession } = require('../windows/chr/session');
const [qemu,image,fixture,work] = process.argv.slice(2);
if (!qemu || !image || !fixture || !work) throw Error('Missing CI paths');
const commands = JSON.parse(fs.readFileSync(fixture,'utf8').replace(/^\uFEFF/,''));
const session = new ChrSession({qemu:path.resolve(qemu), image:path.resolve(image), tempRoot:path.resolve(work)});
function get(url, user, password, route) {
  const root = new URL(url);
  return new Promise((resolve, reject) => {
    const request = http.get({hostname:'127.0.0.1',port:root.port,path:route,timeout:5000,headers:{authorization:'Basic ' + Buffer.from(user + ':' + password).toString('base64')}}, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; if (body.length > 500000) request.destroy(); });
      res.on('end', () => { if (res.statusCode !== 200) return reject(Error('CHR HTTP response ' + res.statusCode)); try { resolve(JSON.parse(body)); } catch (_) { reject(Error('Invalid CHR REST response')); } });
    });
    request.on('timeout', () => request.destroy(Error('CHR REST timeout'))); request.on('error', reject);
  });
}
(async () => {
  const info = await session.start([{id:'fixture',commands}]);
  assert.strictEqual(new URL(info.url).hostname,'127.0.0.1');
  const resource = await get(info.url, info.user, info.password, '/rest/system/resource');
  assert(/^7\.23\.8/.test(resource.version)); assert.strictEqual(resource['architecture-name'],'x86_64');
  const addresses = await get(info.url, info.user, info.password, '/rest/ip/address');
  assert(addresses.some(x => x.address === '192.168.88.1/24' && x.interface === 'bridge-lan'));
  assert(addresses.some(x => x.address === '192.168.99.1/24' && x.interface === 'vlan-guest'));
  const dhcp = await get(info.url, info.user, info.password, '/rest/ip/dhcp-server');
  assert(dhcp.some(x => x.name === 'dhcp-lan' && x.disabled === 'false'));
  assert(dhcp.some(x => x.name === 'dhcp-guest' && x.disabled === 'false'));
  const dir = session.directory;
  await session.stop();
  assert(!fs.existsSync(dir));
  console.log('Windows CHR session: isolated QEMU, loopback REST, applied LAN/VLAN/DHCP and cleanup verified.');
})().catch(e => { console.error('CHR session test failed:', e.message); process.exitCode = 1; }).finally(() => session.stop().catch(e => {console.error('Cleanup failed:',e.message);process.exitCode=1;}));
