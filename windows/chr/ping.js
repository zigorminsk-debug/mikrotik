'use strict';
// Only a live disposable CHR serial console is used. No host ping process,
// physical device, arbitrary RouterOS command, DNS, or shell is exposed.
const {randomBytes}=require('crypto');
function validTarget(ip) {
  if(typeof ip!=='string'||!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip))return false;
  const parts=ip.split('.');
  if(parts.some(x=>(x.length>1&&x[0]==='0')||Number(x)>255))return false;
  const p=parts.map(Number);
  // Conservative unicast-only subset; reject loopback, multicast, link local,
  // and common network/directed-broadcast addresses, not all valid /31 hosts.
  return p[0]>0&&p[0]<224&&p[0]!==127&&!(p[0]===169&&p[1]===254)&&p[3]!==0&&p[3]!==255;
}
async function pingConsole(console,ip) {
  if(!validTarget(ip))throw new Error('Укажите IPv4-адрес одного узла; имена, широковещательные и специальные адреса не поддерживаются.');
  if(!console || typeof console.settle!=='function' || typeof console.send!=='function' || typeof console.expect!=='function')throw new Error('Консоль виртуальной CHR недоступна.');
  const token='LABPING'+randomBytes(16).toString('hex'), marker='"'+token.slice(0,16)+'" . "'+token.slice(16)+'"';
  // The echoed command never contains a complete marker; read only a numeric
  // count, not the console output, secrets, configuration or arbitrary commands.
  const script=':do { :local n [/ping '+ip+' count=3 interval=1s]; :put ('+marker+' . "R" . $n . "END") } on-error={:put ('+marker+' . "ERR")}';
  await console.settle();console.send(script);
  const received=await console.expect(new RegExp(token+'(?:R([0-3])END|ERR)'),30000);
  const match=new RegExp(token+'(?:R([0-3])END|ERR)').exec(received);
  if(!match||match[1]===undefined)throw new Error('Виртуальная CHR отклонила проверку.');
  return {sent:3,received:Number(match[1])};
}
module.exports={validTarget,pingConsole};
