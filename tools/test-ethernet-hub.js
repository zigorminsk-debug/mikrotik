#!/usr/bin/env node
'use strict';
const assert=require('assert'),dgram=require('dgram');
const {EthernetHub,MAX_FRAME}=require('../windows/chr/ethernet-hub');
const open=()=>new Promise((ok,no)=>{const s=dgram.createSocket('udp4');s.once('error',no);s.bind(0,'127.0.0.1',()=>ok(s));});
const send=(s,hub,data)=>new Promise((ok,no)=>s.send(data,hub.port,'127.0.0.1',e=>e?no(e):ok()));
const collect=(s,a)=>s.on('message',x=>a.push(Buffer.from(x)));
const wait=()=>new Promise(r=>setTimeout(r,60));
(async()=>{let hub,peers=[];try{
 hub=await EthernetHub.create();peers=await Promise.all([open(),open(),open(),open()]);
 const [a,b,c,intruder]=peers,received=[[],[],[],[]];peers.forEach((s,i)=>collect(s,received[i]));
 for(const s of [a,b,c])hub.addPeer(s.address().port);
 assert.throws(()=>hub.addPeer(a.address().port));assert.throws(()=>hub.addPeer(hub.port));assert.throws(()=>hub.addPeer(-1));
 const ethernet=Buffer.alloc(64,0xa1);await send(a,hub,ethernet);await wait();assert.deepStrictEqual(received.map(x=>x.length),[0,1,1,0]);assert.deepStrictEqual(received[1][0],ethernet);
 await send(intruder,hub,ethernet);await send(a,hub,Buffer.alloc(13));await send(a,hub,Buffer.alloc(MAX_FRAME+1));await wait();assert.deepStrictEqual(received.map(x=>x.length),[0,1,1,0]);
 hub.removePeer(c.address().port);await send(b,hub,ethernet);await wait();assert.deepStrictEqual(received.map(x=>x.length),[1,1,1,0]);
 await hub.close();await hub.close();assert.throws(()=>hub.addPeer(1234));assert.throws(()=>hub.port);
 console.log('Изолированный Ethernet repeater: loopback, фильтр участников, размер кадра и закрытие проверены.');
}finally{if(hub)await hub.close();await Promise.all(peers.map(s=>new Promise(r=>s.close(r))));}})().catch(e=>{console.error(e);process.exitCode=1;});
