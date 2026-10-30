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
  let s = new ChrSession({qemu,image,tempRoot:work,supervisor});
  await assert.rejects(s.start({expected:{}, groups:[{commands:['/ok\n/bad']}]}), /Недопустим/);
  s = new ChrSession({qemu,image,tempRoot:work,supervisor});
  await assert.rejects(s.start({expected:{}, groups:[{commands:['/ip address print']}]}), /QEMU|CHR/);
  assert.strictEqual(fs.readFileSync(image,'utf8'),'pristine');
  assert.strictEqual(fs.readdirSync(work).length, 0);
  await s.stop();
  console.log('CHR сессия: ошибочный запуск не изменяет исходный образ и удаляет копию.');
})().finally(() => fs.rmSync(root,{recursive:true,force:true})).catch(e => { console.error(e); process.exitCode = 1; });
