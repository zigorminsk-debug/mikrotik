#!/usr/bin/env node
'use strict';
// CI only: exercises real UDP sockets against a synthetic loopback packet.
// Does not discover or communicate with a physical router or LAN.
const assert=require('assert');
const dgram=require('dgram');
const {discover}=require('../windows/physical/mndp');
function tlv(type,data){const h=Buffer.alloc(4);h.writeUInt16BE(type);h.writeUInt16BE(data.length,2);return Buffer.concat([h,data]);}
const packet=Buffer.concat([Buffer.alloc(4),tlv(1,Buffer.from([2,17,34,51,68,85])),tlv(5,Buffer.from('Synthetic RouterOS'))]);
const sender=dgram.createSocket('udp4');
let timer;
(async()=>{
 const networkInterfaces={LoopbackTest:[{family:'IPv4',address:'127.0.0.1',netmask:'255.0.0.0',internal:false}]};
 timer=setTimeout(()=>sender.send(packet,5678,'127.0.0.1'),400);
 const result=await discover('LoopbackTest','127.0.0.1',{networkInterfaces,timeout:1500});
 assert(result.some(x=>x.mac==='02:11:22:33:44:55'&&x.identity==='Synthetic RouterOS'));
 console.log('::notice title=Read-only MNDP loopback test::A synthetic packet was received on real Windows UDP sockets. No real router, broadcast network or MAC authentication was tested.');
})().catch(e=>{console.log('::error title=MNDP loopback test::'+String(e.message).replace(/[\r\n%]/g,' '));process.exitCode=1;}).finally(()=>{clearTimeout(timer);try{sender.close();}catch(_){}});
