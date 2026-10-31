'use strict';
const assert=require('assert'),c=require('./mac-loopback-frame');
const request=Buffer.alloc(30);request[0]=1;request[1]=0;
const b=c.wrap(request,18000);assert.equal(c.checksum(b.subarray(14,34)),0);assert.equal(b.readUInt16BE(34),18000);assert.equal(b.readUInt16BE(36),20561);assert(b.subarray(42).equals(request));
const response=Buffer.from(b);Buffer.from('021122334455','hex').copy(response,6);response.writeUInt16BE(20561,34);response.writeUInt16BE(18000,36);
const result=c.unwrap(response);assert.equal(result.port,18000);assert(result.data.equals(request));
for(const offset of [6,12,14,23,24,34]){const bad=Buffer.from(response);bad[offset]^=0x55;assert.equal(c.unwrap(bad),null);}
const fragmented=Buffer.from(response);fragmented.writeUInt16BE(0x2000,20);assert.equal(c.unwrap(fragmented),null);
assert.equal(c.unwrap(response.subarray(0,50)),null);assert.throws(()=>c.wrap(Buffer.alloc(2),18000));
console.log('CI-only Ethernet framing: valid frame and malformed inputs checked; no network used.');
