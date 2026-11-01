'use strict';
// Isolated VM controller. The main process validates the plan and image first.
const fs = require('fs').promises;
const fsConstants = require('fs').constants;
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { randomBytes } = require('crypto');
const { ChrConsole } = require('./console');
const {pingConsole,validTarget} = require('./ping');
const {resolveConsole,validName} = require('./resolve');
const { makeReader, verifyConfiguration } = require('./verify');
const { validateDualInternet } = require('./online');

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
  constructor({qemu, image, tempRoot, supervisor, diagnostic, diagnoseManagement = false, testInternet = false, testBackupInternet = false, internetConsent = false}) {
    if (![qemu, image, tempRoot, supervisor].every(x => typeof x === 'string' && path.isAbsolute(x))) throw new Error('Неверные пути CHR');
    if (path.basename(qemu).toLowerCase() !== 'qemu-system-x86_64.exe' || path.basename(image) !== 'chr-7.23.8.img' || path.basename(supervisor).toLowerCase() !== 'chr-supervisor.exe') throw new Error('Неверные компоненты CHR');
    this.qemu = qemu; this.image = image; this.root = tempRoot; this.supervisor = supervisor;
    this.diagnostic = typeof diagnostic === 'function' ? diagnostic : () => {};
    this.diagnoseManagement = diagnoseManagement === true;
    this.testInternet = testInternet === true; // CI-only; never passed by the application.
    this.testBackupInternet = testBackupInternet === true;
    this.internetConsent = internetConsent === true;
    if (this.internetConsent && (this.testInternet || this.testBackupInternet)) throw new Error('Несовместимые режимы интернет-сети');
    if (this.testBackupInternet && !this.testInternet) throw new Error('Резервный сетевой тест требует основной сетевой тест');
    this.proc = null; this.server = null; this.console = null; this.socket = null; this.directory = null;
    this.pinging = false; this.probeFailed = false; this.closed = false; this.started = false; this.exitPromise = null; this.acceptTimer = null; this.stopPromise = null;
  }
  async start(plan) {
    if (this.started || this.closed) throw new Error('Сессия CHR уже использована');
    this.started = true;
    if (!plan || !plan.expected || !Array.isArray(plan.groups) || plan.groups.length > 100) throw new Error('Недопустимый план CHR');
    const commands = plan.groups.flatMap(g => Array.isArray(g.commands) ? g.commands : []);
    if (!commands.length || commands.length > 100 || commands.some(s => typeof s !== 'string' || !s.startsWith('/') || /[\r\n\0]/.test(s) || s.length > 8192)) throw new Error('Недопустимые команды CHR');
    if (this.internetConsent && !validateDualInternet(plan.expected)) throw new Error('Неподдерживаемые параметры сетей для CHR');
    try {
      await fs.mkdir(this.root, {recursive:true, mode:0o700});
      this.directory = await fs.mkdtemp(path.join(this.root, 'session-'));
      if (this.closed) throw new Error('Сессия остановлена');
      const disk = path.join(this.directory, 'disk.img');
      await fs.copyFile(this.image, disk, fsConstants.COPYFILE_EXCL);
      if (this.closed) throw new Error('Сессия остановлена');
      const managementPort = await temporaryPort();
      if (this.closed) throw new Error('Сессия остановлена');
      this.server = net.createServer();
      const serialPort = await bind(this.server);
      if (this.closed) throw new Error('Сессия остановлена');
      const args = ['-machine','pc,accel=tcg','-m','256','-smp','1','-display','none','-monitor','none',
        '-serial', `tcp:127.0.0.1:${serialPort}`, '-drive', `file=${disk.replace(/,/g, ',,')},format=raw,if=ide`];
      // Offline by default. The online branch accepts only pinned subnets and
      // requires an explicit main-process consent decision. No WAN forwarding.
      if ((this.testInternet || this.internetConsent) && (plan.expected.wanPort !== 'ether1' || plan.expected.wanAddress !== '10.0.2.20/24' || plan.expected.wanGateway !== '10.0.2.2')) throw new Error('Недопустимые параметры сетевого теста');
      if ((this.testBackupInternet || this.internetConsent) && (!Array.isArray(plan.expected.lanPorts) || plan.expected.lanPorts.some(p => p.name === 'ether4'))) throw new Error('ether4 должен быть свободен для сетевого теста');
      for (let i = 0; i < 5; i++) {
        const netdev = (this.testInternet || this.internetConsent) && i === 0 ? `user,id=n${i},net=10.0.2.0/24,host=10.0.2.2` : (this.testBackupInternet || this.internetConsent) && i === 3 ? `user,id=n${i},net=10.0.3.0/24,host=10.0.3.2` : `user,id=n${i},restrict=on`;
        args.push('-netdev', netdev, '-device', `e1000,netdev=n${i}`);
      }
      // Dedicated management port; the only host forward binds to loopback.
      args.push('-netdev', `user,id=mgmt,restrict=on,net=172.31.254.0/24,host=172.31.254.2,hostfwd=tcp:127.0.0.1:${managementPort}-172.31.254.15:80`, '-device', 'e1000,netdev=mgmt');
      const accepted = new Promise((resolve, reject) => {
        this.acceptTimer = setTimeout(() => reject(new Error('Тайм-аут запуска консоли CHR')), 60000);
        this.server.once('connection', socket => { clearTimeout(this.acceptTimer); this.acceptTimer = null; resolve(socket); });
        this.server.once('error', () => { clearTimeout(this.acceptTimer); this.acceptTimer = null; reject(new Error('Ошибка консоли CHR')); });
      });
      this.proc = spawn(this.supervisor, [disk, this.qemu, ...args], {stdio:['pipe','ignore','ignore'], windowsHide:true});
      this.proc.stdin.on('error', () => {});
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
      const managementCommands = [
        // The disposable CHR has a factory client; remove it before applying a
        // generated DHCP WAN so we never create duplicate clients on a port.
        '/ip dhcp-client remove [find]',
        '/ip address add address=172.31.254.15/24 interface=ether6',
        '/ip service enable www',
        '/ip firewall filter add chain=input in-interface=ether6 action=accept comment="Lab management"'
      ];
      for (let index = 0; index < managementCommands.length; index++) {
        try { await this.console.command(managementCommands[index]); }
        catch (error) { try { this.diagnostic({group:'management', commandIndex:index}); } catch (_) {} throw error; }
      }
      for (const group of plan.groups) {
        if (!Array.isArray(group.commands)) continue;
        for (let index = 0; index < group.commands.length; index++) {
          try { await this.console.command(group.commands[index]); }
          catch (error) { try { this.diagnostic({group:group.id, commandIndex:index}); } catch (_) {} throw error; }
        }
      }
      const get = makeReader(managementPort, 'admin', password, this.diagnostic);
      let verificationError;
      // Under software emulation, WebFig can become reachable after the serial
      // console and configuration. Retry connection failures and the transient DHCP lease wait, never a
      // mismatch in the configured settings themselves.
      for (let attempt = 0; attempt < 15; attempt++) {
        try { await verifyConfiguration(plan.expected, get, this.diagnostic); verificationError = null; break; }
        catch (error) {
          verificationError = error;
          const waitingLease = /ожидание DHCP-аренды WAN/.test(error.message);
          if ((!/Не удалось подключиться к виртуальной CHR/.test(error.message) && !waitingLease) || this.closed) throw error;
          if ((waitingLease && attempt === 14) || (!waitingLease && attempt >= 3)) {
            if (this.diagnoseManagement) {
              try { this.diagnostic({management:await this.console.managementDiagnostic()}); }
              catch (_) { this.diagnostic({management:'diagnostic unavailable'}); }
            }
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      if (verificationError) throw verificationError;
      return { url:`http://127.0.0.1:${managementPort}/`, user:'admin', password };
    } catch (error) {
      await this.stop();
      // Do not leak command output, user data or internal process arguments.
      throw new Error('Не удалось запустить или настроить виртуальную CHR: ' + error.message);
    }
  }
  async resolve(name) {
    if (!this.started || this.closed || !this.console) throw new Error('Виртуальная CHR не запущена.');
    if (!validName(name)) throw new Error('Укажите корректное DNS-имя.');
    if (this.probeFailed) throw new Error('Перезапустите CHR после ошибки проверки.');
    if (this.pinging) throw new Error('Проверка уже выполняется.');
    this.pinging = true;
    try { return await resolveConsole(this.console, name); }
    catch (error) { this.probeFailed = true; throw error; }
    finally { this.pinging = false; }
  }
  async ping(address) {
    if (!this.started || this.closed || !this.console) throw new Error('Виртуальная CHR не запущена.');
    if (!validTarget(address)) throw new Error('Укажите допустимый IPv4-адрес.');
    if (this.probeFailed) throw new Error('Перезапустите CHR после ошибки проверки.');
    if (this.pinging) throw new Error('Проверка уже выполняется.');
    this.pinging = true;
    try { return await pingConsole(this.console, address); }
    catch (error) { this.probeFailed = true; throw error; }
    finally { this.pinging = false; }
  }
  stop() {
    if (!this.stopPromise) {
      this.stopPromise = this.stopOnce();
      // A failed cleanup can be retried; concurrent/successive calls share it.
      this.stopPromise.catch(() => { this.stopPromise = null; });
    }
    return this.stopPromise;
  }
  async stopOnce() {
    this.closed = true;
    if (this.acceptTimer) { clearTimeout(this.acceptTimer); this.acceptTimer = null; }
    if (this.console) this.console.close(); else if (this.socket) this.socket.destroy();
    if (this.server && this.server.listening) this.server.close();
    if (this.proc && this.proc.exitCode === null && this.proc.signalCode === null) this.proc.stdin.end();
    if (this.exitPromise) {
      let timer;
      const result = await Promise.race([this.exitPromise, new Promise(resolve => { timer = setTimeout(() => resolve(null), 10000); })]);
      clearTimeout(timer);
      if (!result) {
        this.proc.kill();
        await this.exitPromise;
      }
    }
    if (this.directory) await fs.rm(this.directory, {recursive:true, force:true, maxRetries:5, retryDelay:200});
  }
}
module.exports = { ChrSession };
