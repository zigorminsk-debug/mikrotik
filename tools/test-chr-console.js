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
  await assert.rejects(c.command('/bad\n/ip service enable www'), /Некорректная/);
  c.close();
  console.log('CHR console: таймаут, закрытие, эхо и ошибки проверены.');
})().catch(e => { console.error(e); process.exitCode = 1; });
