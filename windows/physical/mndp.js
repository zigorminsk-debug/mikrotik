'use strict';
// Read-only MikroTik neighbour discovery (MNDP); this does not authenticate,
// connect to, reset or change any router. All network data is untrusted.
const os=require('os');
const dgram=require('dgram');
function ipv4(text){
  if(typeof text!=='string'||!/^(\d{1,3}\.){3}\d{1,3}$/.test(text))return null;
  const a=text.split('.');if(a.some(x=>Number(x)>255||(x.length>1&&x[0]==='0')))return null;
  return a.reduce((n,x)=>((n*256)+Number(x))>>>0,0);
}
function format(n){return [n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join('.');}
function interfaces(source=os.networkInterfaces()){
  const out=[];
  for(const name of Object.keys(source).sort())for(const x of source[name]||[]){
    if(x.internal||!(x.family==='IPv4'||x.family===4))continue;
    const ip=ipv4(x.address),mask=ipv4(x.netmask);
    if(ip===null||mask===null||mask===0||mask===0xffffffff)continue;
    const inverse=(~mask)>>>0;
    if((inverse&(inverse+1))!==0||inverse<3)continue; // contiguous /1.../30 only
    out.push({name:String(name).slice(0,200),address:x.address,netmask:x.netmask,broadcast:format((ip|inverse)>>>0)});
    if(out.length>=64)return out;
  }
  return out;
}
function parse(packet){
  if(!Buffer.isBuffer(packet)||packet.length<14||packet.length>2048)return null;
  const fields={}; let pos=4;
  while(pos<packet.length){
    if(pos+4>packet.length)return null;
    const type=packet.readUInt16BE(pos),len=packet.readUInt16BE(pos+2);pos+=4;
    if(pos+len>packet.length)return null;
    if([1,5,7,8,12,16].includes(type)){
      if(Object.hasOwn(fields,type))return null; // ambiguous packet
      fields[type]=packet.subarray(pos,pos+len);
    }
    pos+=len;
  }
  if(!fields[1]||fields[1].length!==6||fields[1].every(x=>x===0)||fields[1][0]&1)return null;
  const text=n=>fields[n]?fields[n].subarray(0,128).toString('utf8').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,' ').trim():'';
  return {mac:Array.from(fields[1],x=>x.toString(16).padStart(2,'0')).join(':').toUpperCase(),identity:text(5),version:text(7),platform:text(8),hardware:text(12),interfaceName:text(16)};
}
async function discover(name,address,options={}){
  const selected=interfaces(options.networkInterfaces||os.networkInterfaces()).find(x=>x.name===name&&x.address===address);
  if(!selected)throw new Error('Сетевой адаптер больше недоступен. Обновите список.');
  const make=options.createSocket||(()=>dgram.createSocket({type:'udp4',reuseAddr:false}));
  const timeout=options.timeout||5000;
  const receiver=make(),sender=make(),found=new Map();
  let timer, socketFailure=null;
  const recordError=()=>{socketFailure=new Error('Ошибка сокета MNDP');};
  receiver.on('error',recordError);sender.on('error',recordError);
  try{
    await new Promise((resolve,reject)=>{receiver.once('error',reject);receiver.bind(5678,'0.0.0.0',()=>{receiver.removeListener('error',reject);resolve();});});
    receiver.on('message',(data,rinfo)=>{
      const entry=parse(data);
      if(entry&&rinfo&&typeof rinfo.address==='string'&&ipv4(rinfo.address)!==null&&found.size<128){
        const key=entry.mac+'|'+rinfo.address;
        found.set(key,{...entry,sourceAddress:rinfo.address});
      }
    });
    await new Promise((resolve,reject)=>{sender.once('error',reject);sender.bind(0,selected.address,()=>{sender.removeListener('error',reject);resolve();});});
    sender.setBroadcast(true);
    await new Promise((resolve,reject)=>sender.send(Buffer.alloc(4),5678,selected.broadcast,err=>err?reject(err):resolve()));
    if(socketFailure)throw socketFailure;
    await new Promise((resolve,reject)=>{
      const onError=()=>reject(new Error('Ошибка приёма MNDP'));
      receiver.once('error',onError);sender.once('error',onError);
      timer=setTimeout(()=>{receiver.removeListener('error',onError);sender.removeListener('error',onError);resolve();},timeout);
    });
    return Array.from(found.values());
  } finally {
    clearTimeout(timer);
    for(const socket of [receiver,sender])try{socket.close();}catch(_){}
  }
}
module.exports={interfaces,parse,discover};
