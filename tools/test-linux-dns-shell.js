#!/usr/bin/env node
'use strict';
// Exercise the exact fixed guest shell commands against deterministic output,
// not the host's DNS or networking; actual CirrOS is tested separately in CI.
const assert=require('assert'),fs=require('fs').promises,os=require('os'),path=require('path');
const {execFileSync}=require('child_process');
const {LinuxGuest}=require('../windows/chr/linux-guest');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dns-shell-'));
 try{
  await fs.writeFile(path.join(dir,'nslookup'),'#!/bin/sh\nprintf "%s\\n" "$FAKE_DNS"\n',{mode:0o755});
  await fs.writeFile(path.join(dir,'ip'),'#!/bin/sh\nprintf "%s\\n" "$FAKE_ROUTE"\nexit "${FAKE_EXIT:-0}"\n',{mode:0o755});
  const g=new LinuxGuest({qemu:path.join(dir,'qemu-system-x86_64.exe'),image:path.join(dir,'cirros-0.6.3-x86_64-disk.img'),tempRoot:dir,supervisor:path.join(dir,'chr-supervisor.exe'),localPort:1001,hubPort:1002,mac:'52:54:00:00:00:01'});
  g.started=true;let sent,output,env={...process.env,PATH:dir+path.delimiter+process.env.PATH};
  g.console={settle:async()=>{},send:cmd=>{sent=cmd;output=execFileSync('/bin/sh',['-c',cmd],{encoding:'utf8',env});},expect:async re=>{const match=output.match(re);if(!match)throw Error('Marker missing');return match[0];},close(){}};
  env.FAKE_DNS='Server: 192.168.88.1\nAddress: 192.168.88.1:53\n\nName: server.lab\nAddress: 192.168.88.20\nName: server.lab\nAddress: 192.168.88.21';
  assert.deepStrictEqual(await g.resolve('server.lab'),{ok:true,address:'192.168.88.20'});assert(sent.includes('nslookup'));
  env.FAKE_DNS='Server: 192.168.88.1\nAddress: 192.168.88.1:53\n';assert.deepStrictEqual(await g.resolve('bad.lab'),{ok:false,reason:'dns'});
  env.FAKE_DNS='Name: localhost.lab\nAddress: 127.0.0.1';assert.deepStrictEqual(await g.resolve('localhost.lab'),{ok:false,reason:'address'});
  env.FAKE_ROUTE='default via 192.168.88.1 dev eth0 proto dhcp';assert(await g.hasGateway('192.168.88.1'));assert(!await g.hasGateway('192.168.88.2'));assert(!await g.hasGateway(''));
  env.FAKE_ROUTE='';assert(await g.hasGateway(''));assert(!await g.hasGateway('192.168.88.1'));
  env.FAKE_ROUTE='default via 192.168.88.1 dev eth0\ndefault via 192.168.88.2 dev eth0';assert(!await g.hasGateway('192.168.88.1'));
  env.FAKE_EXIT='1';assert(!await g.hasGateway(''));
  console.log('Linux DNS/route shell: сервер DNS не принимается за ответ, первый A, отсутствие ответа, специальный адрес и проверка маршрута.');
 } finally {await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
