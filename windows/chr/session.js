'use strict';
// Experimental isolated VM controller. Not wired to Electron IPC or UI yet.
// The main process must independently validate the plan and image beforehand.
const fs = require('fs').promises;
const fsConstants = require('fs').constants;
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { randomBytes } = require('crypto');
const { ChrConsole } = require('./console');

function bind(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(server.address().port); });
  });
}
function closeServer(server) { return new Promise(resolve => { if (!server || !server.listening) return resolve(); server.close(() => resolve()); }); }
async function temporaryPort() {
  const s = net.createServer(); const port = await bind(s); await closeServer(s); return port;
}
class ChrSession {
  constructor({qemu, image, tempRoot}) {
    if (![qemu, image, tempRoot].every(x => typeof x === 'string' && path.isAbsolute(x))) throw new Error('Неверные пути CHR');
    if (path.basename(qemu).toLowerCase() !== 'qemu-system-x86_64.exe' || path.basename(image) !== 'chr-7.23.8.img') throw new Error('Неверные компоненты CHR');
    this.qemu = qemu; this.image = image; this.root = tempRoot;
    this.proc = null; this.server = null; this.console = null; this.socket = null; this.directory = null;
    this.closed = false; this.started = false; this.exitPromise = null; this.acceptTimer = null;
  }
  async start(groups) {
    if (this.started || this.closed) throw new Error('Сессия CHR уже использована');
    this.started = true;
    if (!Array.isArray(groups) || groups.length > 100) throw new Error('Недопустимый план CHR');
    const commands = groups.flatMap(g => Array.isArray(g.commands) ? g.commands : []);
    if (!commands.length || commands.length > 100 || commands.some(s => typeof s !== 'string' || !s.startsWith('/') || /[\r\n\0]/.test(s) || s.length > 8192)) throw new Error('Недопустимые команды CHR');
    try {
      await fs.mkdir(this.root, {recursive:true, mode:0o700});
      this.directory = await fs.mkdtemp(path.join(this.root, 'session-'));
      if (this.closed) throw new Error('Сессия остановлена');
      const disk = path.join(this.directory, 'disk.img');
      await fs.copyFile(this.image, disk, fsConstants.COPYFILE_EXCL);
      if (this.closed) throw new Error('Сессия остановлена');
      const managementPort = await temporaryPort();
      this.server = net.createServer();
      const serialPort = await bind(this.server);
      const args = ['-machine','pc,accel=tcg','-m','256','-smp','2','-display','none','-monitor','none',
        '-serial', `tcp:127.0.0.1:${serialPort}`, '-drive', `file=${disk.replace(/,/g, ',,')},format=raw,if=ide`];
      // Five topology ports remain isolated: no bridge, TAP or host forwarding.
      for (let i = 0; i < 5; i++) args.push('-netdev', `user,id=n${i},restrict=on`, '-device', `e1000,netdev=n${i}`);
      // Dedicated management port; the only host forward binds to loopback.
      args.push('-netdev', `user,id=mgmt,restrict=on,net=172.31.254.0/24,host=172.31.254.2,hostfwd=tcp:127.0.0.1:${managementPort}-172.31.254.15:80`, '-device', 'e1000,netdev=mgmt');
      const accepted = new Promise((resolve, reject) => {
        this.acceptTimer = setTimeout(() => reject(new Error('Тайм-аут запуска консоли CHR')), 60000);
        this.server.once('connection', socket => { clearTimeout(this.acceptTimer); this.acceptTimer = null; resolve(socket); });
        this.server.once('error', () => { clearTimeout(this.acceptTimer); this.acceptTimer = null; reject(new Error('Ошибка консоли CHR')); });
      });
      this.proc = spawn(this.qemu, args, {stdio:'ignore', windowsHide:true});
      this.exitPromise = new Promise(resolve => {
        this.proc.once('error', () => resolve({error:true}));
        this.proc.once('exit', (code, signal) => resolve({code,signal}));
      });
      this.socket = await Promise.race([accepted, this.exitPromise.then(() => { throw new Error('QEMU завершился до запуска CHR'); })]);
      // Stop accepting new console connections. Existing connection stays open.
      this.server.close();
      this.console = new ChrConsole(this.socket);
      const password = 'Lab_' + randomBytes(20).toString('hex');
      await this.console.initialize(password);
      if (this.closed) throw new Error('Сессия остановлена');
      // Administrative access is separate from the simulated topology and
      // remains first in the input chain when the laboratory firewall is added.
      for (const command of [
        '/ip address add address=172.31.254.15/24 interface=ether6',
        '/ip service set www address=172.31.254.2/32 disabled=no',
        '/ip firewall filter add chain=input in-interface=ether6 src-address=172.31.254.2 action=accept comment="Lab management"'
      ]) await this.console.command(command);
      for (const command of commands) await this.console.command(command);
      return { url:`http://127.0.0.1:${managementPort}/`, user:'admin', password };
    } catch (error) {
      await this.stop();
      // Do not leak command output, user data or internal process arguments.
      throw new Error('Не удалось запустить или настроить виртуальную CHR: ' + error.message);
    }
  }
  async stop() {
    this.closed = true;
    if (this.acceptTimer) { clearTimeout(this.acceptTimer); this.acceptTimer = null; }
    if (this.console) this.console.close(); else if (this.socket) this.socket.destroy();
    if (this.server && this.server.listening) this.server.close();
    if (this.proc && this.proc.exitCode === null && this.proc.signalCode === null) this.proc.kill();
    if (this.exitPromise) {
      let timer;
      const result = await Promise.race([this.exitPromise, new Promise(resolve => { timer = setTimeout(() => resolve(null), 10000); })]);
      clearTimeout(timer);
      if (!result) throw new Error('Не удалось остановить QEMU; временный диск сохранён для безопасного удаления после остановки процесса.');
    }
    if (this.directory) await fs.rm(this.directory, {recursive:true, force:true});
  }
}
module.exports = { ChrSession };
