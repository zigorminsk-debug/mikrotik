#!/usr/bin/env node
'use strict';
const assert=require('assert');
const {EventEmitter}=require('events');
const {interfaces,parse,discover}=require('../windows/physical/mndp');
const nets={Ethernet:[{family:'IPv4',address:'192.168.88.5',netmask:'255.255.255.0',internal:false}],Loop:[{family:'IPv4',address:'127.0.0.1',netmask:'255.0.0.0',internal:true}],Bad:[{family:'IPv4',address:'10.0.0.1',netmask:'255.0.255.0',internal:false}]};
const [nic]=interfaces(nets);assert.deepStrictEqual(nic,{name:'Ethernet',address:'192.168.88.5',netmask:'255.255.255.0',broadcast:'192.168.88.255'});
function tlv(type,data){const h=Buffer.alloc(4);h.writeUInt16BE(type);h.writeUInt16BE(data.length,2);return Buffer.concat([h,data]);}
const mac=Buffer.from([0x02,0x11,0x22,0x33,0x44,0x55]);
const packet=Buffer.concat([Buffer.alloc(4),tlv(1,mac),tlv(5,Buffer.from('Router<script>\x1b')),tlv(7,Buffer.from('7.23.8'))]);
assert.equal(parse(packet).mac,'02:11:22:33:44:55');assert(!parse(packet).identity.includes('\x1b'));
assert.equal(parse(packet.subarray(0,packet.length-1)),null);
assert.equal(parse(Buffer.concat([packet,tlv(1,mac)])),null);
assert.equal(parse(Buffer.concat([Buffer.alloc(4),tlv(1,Buffer.alloc(6))])),null);
assert.equal(parse(Buffer.concat([Buffer.alloc(4),tlv(1,Buffer.from([1,0,0,0,0,0]))])),null);
assert.equal(parse(Buffer.alloc(3000)),null);
const sockets=[];
class FakeSocket extends EventEmitter{
  constructor(){super();this.closed=false;sockets.push(this);}
  bind(port,host,cb){this.bound=[port,host];setImmediate(cb);}
  setBroadcast(value){this.broadcast=value;}
  send(data,port,host,cb){this.sent=[Buffer.from(data),port,host];setImmediate(()=>{cb(null);sockets[0].emit('message',packet,{address:'192.168.88.1'});});}
  close(){this.closed=true;}
}
(async()=>{
 const rows=await discover('Ethernet','192.168.88.5',{networkInterfaces:nets,createSocket:()=>new FakeSocket(),timeout:20});
 assert.equal(rows.length,1);assert.equal(rows[0].sourceAddress,'192.168.88.1');assert.equal(rows[0].mac,'02:11:22:33:44:55');
 assert.deepStrictEqual(sockets[0].bound,[5678,'0.0.0.0']);assert.deepStrictEqual(sockets[1].bound,[0,'192.168.88.5']);
 assert.equal(sockets[1].sent[1],5678);assert.equal(sockets[1].sent[2],'192.168.88.255');assert(sockets.every(s=>s.closed));
 await assert.rejects(discover('Ethernet','10.9.9.9',{networkInterfaces:nets}),/адаптер/);
 console.log('MNDP: выбор интерфейса, ограниченный опрос, недоверенные и повреждённые пакеты проверены.');
})().catch(e=>{console.error(e);process.exitCode=1;});
