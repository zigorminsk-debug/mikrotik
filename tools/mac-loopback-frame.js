'use strict';
// CI-only Ethernet wrapping between a QEMU socket NIC and localhost UDP.
// Not a network adapter, not an authenticated transport, never used by the app.
const SRC=Buffer.from('02aabbccddee','hex'),ROUTER=Buffer.from('021122334455','hex');
function checksum(b){let sum=0;for(let i=0;i<b.length;i+=2)sum+=(b[i]<<8)|(b[i+1]||0);while(sum>>>16)sum=(sum&0xffff)+(sum>>>16);return (~sum)&0xffff;}
function wrap(payload,srcPort){
 if(!Buffer.isBuffer(payload)||payload.length<22||payload.length>1400||!Number.isInteger(srcPort)||srcPort<1||srcPort>65535)throw Error('Invalid CI frame');
 const n=14+20+8+payload.length,b=Buffer.alloc(n);
 b.fill(0xff,0,6);SRC.copy(b,6);b.writeUInt16BE(0x0800,12);
 b[14]=0x45;b.writeUInt16BE(n-14,16);b.writeUInt16BE(0x4000,20);b[22]=64;b[23]=17;
 Buffer.from([192,0,2,1]).copy(b,26);Buffer.from([255,255,255,255]).copy(b,30);b.writeUInt16BE(checksum(b.subarray(14,34)),24);
 b.writeUInt16BE(srcPort,34);b.writeUInt16BE(20561,36);b.writeUInt16BE(8+payload.length,38);payload.copy(b,42);return b;
}
function unwrap(frame){
 if(!Buffer.isBuffer(frame)||frame.length<42||!frame.subarray(6,12).equals(ROUTER)||frame.readUInt16BE(12)!==0x0800)return null;
 if((frame[14]>>>4)!==4||frame[23]!==17)return null;
 const ihl=(frame[14]&15)*4,ipLen=frame.readUInt16BE(16),frag=frame.readUInt16BE(20),off=14+ihl;
 if(ihl<20||ipLen<ihl+8||frame.length<14+ipLen||(frag&0x3fff)!==0||checksum(frame.subarray(14,off))!==0||off+8>frame.length)return null;
 const src=frame.readUInt16BE(off),dst=frame.readUInt16BE(off+2),len=frame.readUInt16BE(off+4);
 if(src!==20561||!dst||len<30||len>ipLen-ihl||off+len>frame.length)return null;
 return {port:dst,data:Buffer.from(frame.subarray(off+8,off+len))};
}
module.exports={wrap,unwrap,checksum};
