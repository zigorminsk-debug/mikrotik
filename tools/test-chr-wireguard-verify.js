#!/usr/bin/env node
'use strict';
const assert = require('assert');
const {verifyWireguard} = require('../windows/chr/verify');
const publicKey = 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=';
const expected={port:'13231',address:'10.10.10.1/24',allowedAddress:'10.10.10.2/32',peerPublicKey:publicKey};
const rows={
  '/rest/interface/wireguard':[{name:'wg-lab','listen-port':'13231',disabled:'false','public-key':publicKey,'private-key':'DO_NOT_LOG'}],
  '/rest/ip/address':[{interface:'wg-lab',address:expected.address,disabled:'false'}],
  '/rest/interface/wireguard/peers':[{interface:'wg-lab','public-key':publicKey,'allowed-address':expected.allowedAddress,disabled:'false'}]
};
const get=async key => { assert(key in rows); return rows[key]; };
(async()=>{
  await verifyWireguard(expected,get);
  async function rejects(path,index,key,value,reason){const obj=rows[path][index],old=obj[key];obj[key]=value;await assert.rejects(verifyWireguard(expected,get),reason);obj[key]=old;}
  await rejects('/rest/interface/wireguard',0,'disabled','true',/интерфейс WireGuard/);
  await rejects('/rest/interface/wireguard',0,'listen-port','13232',/интерфейс WireGuard/);
  await rejects('/rest/ip/address',0,'address','10.10.10.2/24',/адрес WireGuard/);
  await rejects('/rest/ip/address',0,'disabled','true',/адрес WireGuard/);
  await rejects('/rest/interface/wireguard/peers',0,'disabled','true',/peer WireGuard/);
  await rejects('/rest/interface/wireguard/peers',0,'public-key','wrong',/peer WireGuard/);
  await rejects('/rest/interface/wireguard/peers',0,'allowed-address','0.0.0.0/0',/peer WireGuard/);
  rows['/rest/interface/wireguard/peers'].push({...rows['/rest/interface/wireguard/peers'][0],disabled:'true'});
  await assert.rejects(verifyWireguard(expected,get),/peer WireGuard/);
  rows['/rest/interface/wireguard/peers'].pop();
  rows['/rest/ip/address'].push({interface:'wg-lab',address:'192.0.2.1/24',disabled:'false'});
  await assert.rejects(verifyWireguard(expected,get),/адрес WireGuard/);
  console.log('CHR WireGuard: параметры интерфейса и peer проверяются, неверные и лишние записи отклоняются.');
})().catch(err=>{console.error(err.message);process.exitCode=1;});
