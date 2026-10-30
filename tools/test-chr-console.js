#!/usr/bin/env node
'use strict';
const assert = require('assert');
const { EventEmitter } = require('events');
const { ChrConsole } = require('../windows/chr/console');
class Fake extends EventEmitter {
  constructor() { super(); this.writes = []; }
  write(line) { this.writes.push(line); }
  destroy() { this.emit('close'); }
  input(s) { this.emit('data', Buffer.from(s)); }
}
(async () => {
  let s = new Fake(), c = new ChrConsole(s, {timeout: 80});
  let p = c.expect(/ready>/); s.input('redraw>rea'); s.input('dy>'); assert.strictEqual(await p, 'ready>');
  p = c.expect(/never/); await assert.rejects(p, /Тайм-аут/);
  assert.throws(() => c.send('line\nnext'), /Недопустимая/);
  p = c.expect(/after/); c.close(); await assert.rejects(p, /закрыта/);
  s = new Fake(); c = new ChrConsole(s, {timeout: 200});
  c.settle = async () => { c.buffer = ''; };
  const replies = { 'admin': 'Password:', '': 'Do you want to see the software license?', 'n': 'new password>', 'Test_Password_123456': 'repeat new password>' };
  let passwordCount = 0;
  s.write = line => {
    s.writes.push(line);
    const value = line.trim();
    let reply = replies[value];
    if (value === 'Test_Password_123456' && ++passwordCount === 2) reply = 'Password changed\r\n[admin@CHR] >';
    setImmediate(() => s.input(reply));
  };
  const login = c.initialize('Test_Password_123456'); s.input('Login:'); await login;
  assert.strictEqual(passwordCount, 2); assert.deepStrictEqual(s.writes.map(x => x.trim()), ['admin','','n','Test_Password_123456','Test_Password_123456']);
  c.close();
  s = new Fake(); c = new ChrConsole(s, {timeout: 80});
  // Simulate echo followed by the evaluated marker. Echo must not satisfy it.
  c.settle = async () => { c.buffer = ''; };
  let run = c.command('/system identity print');
  await new Promise(resolve => setImmediate(resolve));
  const text = s.writes[0];
  const fragments = [...text.matchAll(/"([A-Z0-9a-f]+)"/g)].map(x => x[1]);
  assert.strictEqual(fragments.length, 4);
  s.input(text); // Echo alone does not contain either complete token.
  let finished = false; run.then(() => { finished = true; });
  await new Promise(resolve => setImmediate(resolve)); assert.strictEqual(finished, false);
  s.input(fragments[0] + fragments[1] + '\r\n'); await run;
  run = c.command('/ip address add address=192.0.2.1/24 interface=ether1');
  await new Promise(resolve => setImmediate(resolve));
  const f = [...s.writes[1].matchAll(/"([A-Z0-9a-f]+)"/g)].map(x => x[1]);
  s.input(f[2] + f[3]); await assert.rejects(run, /отклонила/);
  let probe = c.managementDiagnostic();
  await new Promise(resolve => setImmediate(resolve));
  const probeText = s.writes[2];
  const pieces = [...probeText.matchAll(/"([A-Za-z0-9]+)"/g)].map(x => x[1]);
  s.input(probeText); // echo cannot match the joined diagnostic marker
  s.input(pieces[0] + pieces[1] + 'LtrueA1WfalseEND');
  assert.deepStrictEqual(await probe, {linkRunning:true, managementAddressCount:1, wwwDisabled:false});
  await assert.rejects(c.command('/bad\n/ip service enable www'), /Некорректная/);
  c.close();
  console.log('CHR console: таймаут, закрытие, эхо и ошибки проверены.');
})().catch(e => { console.error(e); process.exitCode = 1; });
