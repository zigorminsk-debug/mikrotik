#!/usr/bin/env node
'use strict';
// Disposable CI fixture only. Keys are generated for two transient CHRs and
// never printed in CI logs or used on a real device.
const {generateKeyPairSync}=require('crypto');
const engine=require('../app/js/lab-sim');
const keys=generateKeyPairSync('x25519');
const pub=keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
const priv=keys.privateKey.export({format:'der',type:'pkcs8'}).subarray(-32).toString('base64');
const state={devices:[
 {id:'i',type:'isp',name:'Synthetic ISP',cfg:{kind:'static',priority:'primary',ip:'198.51.100.2/30',gw:'198.51.100.1',dns:'1.1.1.1'}},
 {id:'r',type:'router',name:'Synthetic server',cfg:{lan:'192.168.88.0/24',gw:'192.168.88.1',dhcp:true,nat:true,firewall:true,vpn:true,vpnType:'wireguard',vpnPort:'13231',vpnPool:'10.10.10.0/24',vpnPeer:pub,routerFailover:false,wanFailover:false}},
 {id:'p',type:'pc',name:'Synthetic PC',cfg:{mode:'dhcp'}}
],links:[{a:'i',b:'r'},{a:'r',b:'p'}]};
const result=engine.run(state);
if(result.errors.length) throw Error(result.errors.join('; '));
const groups=result.groups.filter(g=>g.id!=='verify').map(g=>({id:g.id,commands:g.code.split('\n').filter(x=>x && !x.startsWith('#'))}));
if (!groups.some(g=>g.id==='vpn')) throw Error('WireGuard group missing');
process.stdout.write(JSON.stringify({groups,clientPrivate:priv,clientPublic:pub}));
