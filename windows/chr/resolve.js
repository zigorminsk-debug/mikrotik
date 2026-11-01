'use strict';
// Resolve only an explicitly entered hostname inside the running CHR.
// This module never uses host DNS, runs arbitrary shell/RouterOS, or pings.
const {randomBytes}=require('crypto');
const {validTarget}=require('./ping');
function validName(name) {
  return typeof name==='string' && name.length>0 && name.length<=253 && !/^(?:\d+\.){3}\d+$/.test(name) &&
    name.split('.').every(part=>part.length>0 && part.length<=63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(part));
}
async function resolveConsole(console,name) {
  if(!validName(name))throw new Error('Укажите корректное DNS-имя без URL, пробелов и команд.');
  if(!console || typeof console.settle!=='function' || typeof console.send!=='function' || typeof console.expect!=='function')throw new Error('Консоль виртуальной CHR недоступна.');
  const token='LABDNS'+randomBytes(16).toString('hex'),marker='"'+token.slice(0,16)+'" . "'+token.slice(16)+'"';
  const script=':do { :local addr [:resolve domain-name="'+name+'" type=ipv4]; :put ('+marker+' . "R" . $addr . "END") } on-error={:put ('+marker+' . "ERR")}';
  await console.settle();console.send(script);
  const received=await console.expect(new RegExp(token+'(?:R((?:[0-9]{1,3}\\.){3}[0-9]{1,3})END|ERR)'),30000);
  const match=new RegExp(token+'(?:R((?:[0-9]{1,3}\\.){3}[0-9]{1,3})END|ERR)').exec(received);
  if(!match || !match[1]) return {ok:false,reason:'dns'};
  if(!validTarget(match[1]))return {ok:false,reason:'address'};
  return {ok:true,address:match[1]};
}
module.exports={validName,resolveConsole};
