#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {ChrSession} = require('../windows/chr/session');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-session-test-'));
(async () => {
  assert.throws(() => new ChrSession({qemu:'relative.exe', image:'x', tempRoot:'y', supervisor:'z'}), /пути/);
  assert.throws(() => new ChrSession({qemu:path.join(root,'other.exe'), image:path.join(root,'chr-7.23.8.img'), tempRoot:root, supervisor:path.join(root,'chr-supervisor.exe')}), /компоненты/);
  const qemu = path.join(root,'qemu-system-x86_64.exe'), image = path.join(root,'chr-7.23.8.img'), work = path.join(root,'sessions'), supervisor = path.join(root,'chr-supervisor.exe');
  fs.writeFileSync(qemu,'not an executable'); fs.writeFileSync(supervisor,'not an executable'); fs.writeFileSync(image,'pristine');
  assert.throws(() => new ChrSession({qemu,image,tempRoot:work,supervisor,testBackupInternet:true}), /основной сетевой тест/);
  const link={name:'ether2',localPort:2001,hubPort:2002};
  assert.throws(()=>new ChrSession({qemu,image,tempRoot:work,supervisor,experimentalIsolatedLinks:[{...link,name:'ether1'}]}),/виртуальное соединение/);
  assert.throws(()=>new ChrSession({qemu,image,tempRoot:work,supervisor,experimentalIsolatedLinks:[link,link]}),/виртуальное соединение/);
  assert.throws(()=>new ChrSession({qemu,image,tempRoot:work,supervisor,experimentalIsolatedLinks:[{...link,localPort:'bad'}]}),/виртуальное соединение/);
  assert.throws(()=>new ChrSession({qemu,image,tempRoot:work,supervisor,internetConsent:true,experimentalIsolatedLinks:[link]}),/Несовместимая/);
  assert.deepStrictEqual(new ChrSession({qemu,image,tempRoot:work,supervisor,experimentalIsolatedLinks:[link]}).isolatedLinks.get('ether2'),{localPort:2001,hubPort:2002});
  let s = new ChrSession({qemu,image,tempRoot:work,supervisor});
  await assert.rejects(s.start({expected:{}, groups:[{commands:['/ok\n/bad']}]}), /Недопустим/);
  s = new ChrSession({qemu,image,tempRoot:work,supervisor});
  await assert.rejects(s.start({expected:{}, groups:[{commands:['/ip address print']}]}), /QEMU|CHR/);
  s = new ChrSession({qemu,image,tempRoot:work,supervisor,internetConsent:true});
  await assert.rejects(s.start({expected:{},groups:[{commands:['/ip address print']}]}), /Неподдерживаемые параметры сетей/);
  assert.throws(() => new ChrSession({qemu,image,tempRoot:work,supervisor,internetConsent:true,testInternet:true}), /Несовместимые режимы/);
  assert.strictEqual(fs.readFileSync(image,'utf8'),'pristine');
  assert.strictEqual(fs.readdirSync(work).length, 0);
  await s.stop();
  s = new ChrSession({qemu,image,tempRoot:work,supervisor});
  let closed=0; s.console={close(){closed++; if(closed>1) throw Error('console closed twice');}};
  await Promise.all([s.stop(),s.stop()]); await s.stop(); assert.equal(closed,1);
  const transient = new ChrSession({qemu,image,tempRoot:work,supervisor});
  let attempts=0;transient.console={close(){if(++attempts===1) throw Error('temporary');}};
  await assert.rejects(transient.stop(),/temporary/); await transient.stop(); assert.equal(attempts,2);
  const probe = new ChrSession({qemu,image,tempRoot:work,supervisor});
  probe.started=true;probe.console={settle:async()=>{},send:()=>{},expect:async()=>{throw Error('console timeout');},close(){}};
  await assert.rejects(probe.resolve('unsafe;command'),/DNS/);assert.equal(probe.probeFailed,false);
  await assert.rejects(probe.resolve('host.example'),/timeout/);assert.equal(probe.probeFailed,true);
  await assert.rejects(probe.ping('192.168.88.1'),/Перезапустите/);
  await assert.rejects(probe.resolve('host.example'),/Перезапустите/);
  await probe.stop();
  for (const phase of ['mkdir','mkdtemp','copyFile']) {
    const tmp=fs.mkdtempSync(path.join(root,'cancel-')), sessions=path.join(tmp,'sessions');
    const chr=new ChrSession({qemu,image,tempRoot:sessions,supervisor});
    const fsp=fs.promises, original=fsp[phase];let release,entered;
    const gate=new Promise(resolve=>{release=resolve;}),arrived=new Promise(resolve=>{entered=resolve;});
    fsp[phase]=async function(...args) {
      if(phase==='copyFile'){entered();await gate;return original.apply(fsp,args);}
      const value=await original.apply(fsp,args);entered();await gate;return value;
    };
    try {
      const starting=chr.start({expected:{},groups:[{commands:['/ip address print']}]});await arrived;
      let done=false;const stopping=chr.stop();assert.strictEqual(chr.stop(),stopping);stopping.then(()=>{done=true;});
      await new Promise(resolve=>setTimeout(resolve,30));assert.equal(done,false,'stop waited during '+phase);
      release();await assert.rejects(starting,/остановлена/);await stopping;
      const files=await fsp.readdir(sessions).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e));assert.deepStrictEqual(files,[]);
    } finally {fsp[phase]=original;release();fs.rmSync(tmp,{recursive:true,force:true});}
  }
  console.log('CHR сессия: ошибочный запуск, очистка при остановке и блокировка после сбоя консоли проверены.');
})().finally(() => fs.rmSync(root,{recursive:true,force:true})).catch(e => { console.error(e); process.exitCode = 1; });
