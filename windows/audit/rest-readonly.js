'use strict';
// Research component only; NOT exposed to the app or production routers yet.
// Only fixed HTTPS GETs and fixed property lists. TLS peer is pinned BEFORE
// sending Basic credentials. Never log input, response bodies, or raw errors.
const tls=require('tls'),http=require('http'),crypto=require('crypto'),net=require('net');
const TOPICS=Object.freeze([
 {id:'system',path:'/rest/system/resource',fields:['version','board-name','architecture-name']},
 {id:'identity',path:'/rest/system/identity',fields:['name']},
 {id:'interfaces',path:'/rest/interface',fields:['name','type','running','disabled','mtu']},
 {id:'bridge',path:'/rest/interface/bridge',fields:['name','disabled','protocol-mode','vlan-filtering']},
 {id:'bridge-ports',path:'/rest/interface/bridge/port',fields:['bridge','interface','disabled','hw','pvid','ingress-filtering','frame-types']},
 {id:'bridge-vlans',path:'/rest/interface/bridge/vlan',fields:['bridge','vlan-ids','tagged','untagged','current-tagged','current-untagged','disabled','dynamic']},
 {id:'vlan',path:'/rest/interface/vlan',fields:['name','interface','vlan-id','disabled']},
 {id:'addresses',path:'/rest/ip/address',fields:['address','network','interface','disabled','dynamic']},
 {id:'routes',path:'/rest/ip/route',fields:['dst-address','gateway','distance','disabled','active','dynamic']},
 {id:'dhcp-client',path:'/rest/ip/dhcp-client',fields:['interface','disabled','add-default-route','use-peer-dns','status','address']},
 {id:'dhcp-server',path:'/rest/ip/dhcp-server',fields:['name','interface','address-pool','disabled']},
 {id:'dhcp-network',path:'/rest/ip/dhcp-server/network',fields:['address','gateway','dns-server']},
 {id:'pools',path:'/rest/ip/pool',fields:['name','ranges','next-pool']},
 {id:'dns',path:'/rest/ip/dns',fields:['servers','allow-remote-requests']},
 {id:'filter',path:'/rest/ip/firewall/filter',fields:['chain','action','disabled','src-address','dst-address','protocol','dst-port','in-interface','out-interface','connection-state']},
 {id:'nat',path:'/rest/ip/firewall/nat',fields:['chain','action','disabled','src-address','dst-address','protocol','dst-port','in-interface','out-interface','to-addresses','to-ports']},
 {id:'services',path:'/rest/ip/service',fields:['name','port','disabled','address','available-from']},
 {id:'queues',path:'/rest/queue/simple',fields:['name','target','max-limit','disabled']}
].map(t=>Object.freeze({...t,fields:Object.freeze(t.fields)})));
const MAX_BYTES=1024*1024,MAX_ROWS=2000,MAX_VALUE=512;
function validIp(host,allowLoopback=false){
 if(typeof host!=='string'||net.isIP(host)!==4||host.length>15)return false;
 const p=host.split('.');if(p.some(x=>x.length>1&&x[0]==='0'))return false;
 const n=p.map(Number);return n[0]>0&&n[0]<224&&(allowLoopback||n[0]!==127)&&!(n[0]===169&&n[1]===254)&&n[3]!==0&&n[3]!==255;
}
function validate(o,allowLoopback){
 if(!o||!validIp(o.host,allowLoopback)||!Number.isInteger(o.port)||o.port<1||o.port>65535)throw Error('Недопустимый адрес или порт.');
 if(typeof o.fingerprint!=='string'||!/^([a-fA-F0-9]{2}:){31}[a-fA-F0-9]{2}$/.test(o.fingerprint))throw Error('Нужен проверенный SHA-256 отпечаток сертификата.');
 if(typeof o.user!=='string'||!o.user||o.user.length>128||/[:\r\n\x00]/.test(o.user)||typeof o.password!=='string'||o.password.length<1||o.password.length>512||/[\r\n\x00]/.test(o.password))throw Error('Недопустимый формат учётных данных.');
}
function sanitize(value,topic){
 const rows=Array.isArray(value)?value:(value&&typeof value==='object'?[value]:null);
 if(!rows||rows.length>MAX_ROWS)throw Error('Некорректный ответ RouterOS.');
 return rows.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Некорректный ответ RouterOS.');
  const out=Object.create(null);
  for(const key of topic.fields){
   if(!Object.prototype.hasOwnProperty.call(row,key))continue;
   const v=row[key];if(typeof v!=='string'&&typeof v!=='number'&&typeof v!=='boolean')throw Error('Неподдерживаемый формат поля.');
   const s=String(v);if(s.length>MAX_VALUE||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s))throw Error('Недопустимое значение поля.');out[key]=s;
  }
  return out;
 });
}
function readTopic(o,topic,timeout=10000){
 // Fixed topic object identity prevents paths/methods from being supplied by UI.
 if(!TOPICS.includes(topic))return Promise.reject(Error('Недопустимый раздел.'));
 return new Promise((resolve,reject)=>{
  let socket,request,agent,done=false;
  const timer=setTimeout(()=>finish(Error('Тайм-аут HTTPS.')),timeout);
  function finish(error,value){if(done)return;done=true;clearTimeout(timer);if(request)request.destroy();if(socket)socket.destroy();if(agent)agent.destroy();if(error)reject(error);else resolve(value);}
  socket=tls.connect({host:o.host,port:o.port,rejectUnauthorized:false,minVersion:'TLSv1.2'},()=>{
   try{
    const peer=socket.getPeerCertificate(true);if(!peer||!Buffer.isBuffer(peer.raw))return finish(Error('Сертификат отсутствует.'));
    const expected=Buffer.from(o.fingerprint.replace(/:/g,''),'hex'),actual=crypto.createHash('sha256').update(peer.raw).digest();
    if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))return finish(Error('Отпечаток сертификата не совпадает; пароль не отправлен.'));
    const cert=new crypto.X509Certificate(peer.raw),now=Date.now();
    if(!Number.isFinite(Date.parse(cert.validFrom))||!Number.isFinite(Date.parse(cert.validTo))||now<Date.parse(cert.validFrom)||now>Date.parse(cert.validTo))return finish(Error('Сертификат ещё не действует или истёк; пароль не отправлен.'));
    agent=new http.Agent({keepAlive:false,maxSockets:1});
    agent.createConnection=(_options,callback)=>{callback(null,socket);};
    const path=topic.path+'?'+new URLSearchParams({'.proplist':topic.fields.join(',')}).toString();
    request=http.request({host:o.host,port:o.port,path,method:'GET',agent,headers:{authorization:'Basic '+Buffer.from(o.user+':'+o.password,'utf8').toString('base64'),accept:'application/json','accept-encoding':'identity',connection:'close'}},response=>{
      if(response.statusCode!==200){response.resume();return finish(null,{status:response.statusCode===401?'auth':response.statusCode===403?'forbidden':response.statusCode===404?'unavailable':'http-error'});}
      if(response.headers['content-encoding']&&response.headers['content-encoding']!=='identity'){response.resume();return finish(Error('Неподдерживаемый формат HTTPS-ответа.'));}
      const chunks=[];let bytes=0;
      response.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_BYTES)return finish(Error('Ответ слишком большой.'));chunks.push(chunk);});
      response.on('error',()=>finish(Error('Ошибка HTTPS-ответа.')));
      response.on('end',()=>{try{const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));finish(null,{status:'ok',rows:sanitize(data,topic)});}catch(_){finish(Error('Некорректный ответ RouterOS.'));}});
    });
    request.on('error',()=>finish(Error('Ошибка HTTPS-соединения.')));request.end();
   }catch(_){finish(Error('Не удалось проверить соединение или ответ.'));}
  });
  socket.on('error',()=>finish(Error('Ошибка TLS-соединения.')));
 });
}
async function collect(options,{allowLoopback=false,topics=TOPICS,timeout=10000}={}){
 validate(options,allowLoopback);
 if(!Array.isArray(topics)||!topics.length||topics.some(t=>!TOPICS.includes(t)))throw Error('Недопустимый перечень разделов.');
 const sections=[];
 for(const t of topics){const result=await readTopic(options,t,timeout);sections.push({id:t.id,...result});if(result.status==='auth')break;}
 return {sections,complete:false}; // Fixed list is intentionally incomplete.
}
module.exports={TOPICS,validIp,validate,sanitize,collect};
