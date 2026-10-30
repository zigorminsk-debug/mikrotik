#!/usr/bin/env node
'use strict';
// Synthetic, non-sensitive settings for the Windows CHR CI probe only.
const E = require('../app/js/lab-sim');
const state = { devices: [
  { id: 'isp', type: 'isp', name: 'Test ISP', cfg: { kind: 'static', priority: 'primary', ip: '198.51.100.2/30', gw: '198.51.100.1', dns: '1.1.1.1' } },
  { id: 'r', type: 'router', name: 'Test router', cfg: { lan: '192.168.88.0/24', gw: '192.168.88.1', dhcp: true, nat: true, firewall: true, vpn: false, vlanGuest: true, guestVlan: '20', guestNet: '192.168.99.0/24', guestGw: '192.168.99.1', guestDhcp: true, dnsCache: true, staticRoute:true, routeDst:'10.20.0.0/24', routeGw:'192.168.88.254', routeDistance:'2', dnsStatic:true, dnsStaticName:'lab.example', dnsStaticIp:'192.168.88.20', identityOn:true, systemIdentity:'Lab Router'  } },
  { id: 'pc', type: 'pc', name: 'Test PC', cfg: { mode: 'static', ip:'192.168.88.20/24', gw:'192.168.88.1', segment:'main', external:true, extProto:'tcp', extPort:'8443', localPort:'443' } },
  { id: 'guest', type: 'pc', name: 'Test guest', cfg: { mode: 'dhcp', segment: 'guest' } }
], links: [{a:'isp', b:'r'}, {a:'r', b:'pc'}, {a:'r', b:'guest'}] };
const result = E.run(state);
if (result.errors.length) throw new Error(result.errors.join('; '));
const commands = result.groups.filter(g => g.id !== 'verify').flatMap(g => g.code.split('\n').filter(s => s && !s.startsWith('#')));
if (!commands.length || commands.some(s => /[\r\n\0]/.test(s))) throw new Error('Invalid test commands');
if (require.main === module) process.stdout.write(JSON.stringify(commands));
module.exports = { state, commands };
