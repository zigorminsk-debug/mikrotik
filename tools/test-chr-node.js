#!/usr/bin/env node
'use strict';
// Exercises the exact Windows serial module against a real disposable CHR.
const net = require('net');
const fs = require('fs');
const { spawn } = require('child_process');
const { randomBytes } = require('crypto');
const { ChrConsole } = require('../windows/chr/console');
const [qemu, image, fixture] = process.argv.slice(2);
if (!qemu || !image || !fixture) throw Error('QEMU, CHR image and fixture required');
const commands = JSON.parse(fs.readFileSync(fixture, 'utf8').replace(/^\uFEFF/, ''));
const server = net.createServer();
let vm, consoleSession, socket;
function listen() { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); }
function connected() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('QEMU serial connection timeout')), 60000);
    server.once('connection', conn => { clearTimeout(timer); resolve(conn); });
    vm.once('error', error => { clearTimeout(timer); reject(error); });
    vm.once('exit', () => { clearTimeout(timer); reject(Error('QEMU exited before serial connection')); });
  });
}
(async () => {
  await listen();
  const args = ['-machine','pc,accel=tcg','-m','256','-smp','2','-display','none','-monitor','none',
    '-serial', `tcp:127.0.0.1:${server.address().port}`, '-drive', `file=${image},format=raw,if=ide`];
  for (let i = 0; i < 6; i++) args.push('-netdev', `user,id=n${i},restrict=on`, '-device', `e1000,netdev=n${i}`);
  vm = spawn(qemu, args, { stdio: 'ignore', windowsHide: true });
  socket = await connected();
  server.close();
  consoleSession = new ChrConsole(socket);
  await consoleSession.initialize('CI_' + randomBytes(16).toString('hex'));
  for (const command of commands) await consoleSession.command(command);
  console.log(`CHR serial module: ${commands.length} fixture commands acknowledged by RouterOS.`);
})().catch(err => { console.error('CHR serial module test failed:', err.message); process.exitCode = 1; }).finally(() => {
  if (consoleSession) consoleSession.close(); else if (socket) socket.destroy();
  server.close();
  if (vm) vm.kill();
});
