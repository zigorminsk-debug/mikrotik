'use strict';
// Serial console transport for an isolated, disposable CHR. This module does
// not start a VM, accept IPC calls, download images, or contact any router.
const { randomBytes } = require('crypto');

class ChrConsole {
  constructor(socket, options = {}) {
    this.socket = socket;
    this.timeout = options.timeout || 180000;
    this.buffer = '';
    this.failure = null;
    this.waiting = false;
    this.wake = null;
    this.onData = data => {
      this.buffer += data.toString('utf8');
      if (this.buffer.length > 256 * 1024) this.fail(new Error('Слишком большой ответ консоли CHR'));
      if (this.wake) this.wake();
    };
    this.onError = () => this.fail(new Error('Ошибка соединения с консолью CHR'));
    this.onClose = () => this.fail(new Error('Консоль CHR закрыта'));
    socket.on('data', this.onData);
    socket.on('error', this.onError);
    socket.on('close', this.onClose);
  }
  fail(error) { if (!this.failure) this.failure = error; if (this.wake) this.wake(); }
  async expect(pattern, timeout = this.timeout) {
    if (this.waiting) throw new Error('Параллельное ожидание консоли недопустимо');
    this.waiting = true;
    const end = Date.now() + timeout;
    try {
      for (;;) {
        if (this.failure) throw this.failure;
        const m = pattern.exec(this.buffer);
        if (m) { this.buffer = this.buffer.slice(m.index + m[0].length); return m[0]; }
        const remaining = end - Date.now();
        if (remaining <= 0) throw new Error('Тайм-аут ожидания ответа CHR');
        await new Promise(resolve => {
          const timer = setTimeout(() => { this.wake = null; resolve(); }, remaining);
          this.wake = () => { clearTimeout(timer); this.wake = null; resolve(); };
        });
      }
    } finally { this.waiting = false; this.wake = null; }
  }
  send(line) {
    if (this.failure) throw this.failure;
    if (typeof line !== 'string' || /[\r\n\0]/.test(line)) throw new Error('Недопустимая строка консоли');
    this.socket.write(line + '\n');
  }
  // Discard obsolete redraws before responding to the current prompt. The
  // next state must not be expected until after the response is sent.
  async settle() {
    this.buffer = '';
    const end = Date.now() + 1000;
    while (Date.now() < end) {
      if (this.failure) throw this.failure;
      await new Promise(resolve => setTimeout(resolve, 50));
      this.buffer = '';
    }
  }
  async initialize(password) {
    if (typeof password !== 'string' || !/^[A-Za-z0-9!_-]{16,80}$/.test(password)) throw new Error('Недопустимый временный пароль');
    await this.expect(/login:/i); await this.settle(); this.send('admin');
    await this.expect(/password:/i); await this.settle(); this.send('');
    await this.expect(/do you want to see the software license/i); await this.settle(); this.send('n');
    await this.expect(/(?<!repeat )new password[^\r\n]*>/i); await this.settle(); this.send(password);
    await this.expect(/repeat new password[^\r\n]*>/i); await this.settle(); this.send(password);
    await this.expect(/password changed/i); await this.expect(/\[admin@[^\]]+\]\s*>/i); await this.settle();
  }
  async command(command) {
    if (typeof command !== 'string' || !command.startsWith('/') || /[\r\n\0]/.test(command) || command.length > 8192) throw new Error('Некорректная команда CHR');
    const token = randomBytes(16).toString('hex');
    const ok = 'LABOK' + token, bad = 'LABERR' + token;
    const expression = value => '"' + value.slice(0, 16) + '" . "' + value.slice(16) + '"';
    // Echo contains the two fragments, never the joined marker. Do not return
    // command text or console output, which may contain credentials.
    const wrapped = ':do { ' + command + '; :put (' + expression(ok) + ') } on-error={ :put (' + expression(bad) + ') }';
    await this.settle();
    this.send(wrapped);
    const marker = await this.expect(new RegExp(ok + '|' + bad), 30000);
    if (marker !== ok) throw new Error('CHR отклонила команду; применение остановлено');
  }
  // CI-only diagnostic: return a small, fixed set of non-sensitive states.
  // No arbitrary command or console output is exposed to the renderer.
  async managementDiagnostic() {
    const token = 'LABDIAG' + randomBytes(16).toString('hex');
    const expr = '"' + token.slice(0, 16) + '" . "' + token.slice(16) + '"';
    const line = ':put (' + expr + ' . "L" . [/interface ethernet get [find where name=ether6] running] . "A" . [:len [/ip address find where interface=ether6 and address="172.31.254.15/24" and disabled=no and invalid=no]] . "W" . [/ip service get [find where name=www] disabled] . "END")';
    await this.settle(); this.send(line);
    const result = await this.expect(new RegExp(token + 'L(true|false)A([0-9]+)W(true|false)END'), 30000);
    const m = new RegExp(token + 'L(true|false)A([0-9]+)W(true|false)END').exec(result);
    return {linkRunning:m[1] === 'true', managementAddressCount:Number(m[2]), wwwDisabled:m[3] === 'true'};
  }
  close() {
    this.fail(new Error('Консоль CHR закрыта'));
    this.socket.removeListener('data', this.onData);
    this.socket.removeListener('error', this.onError);
    this.socket.removeListener('close', this.onClose);
    this.socket.destroy();
    this.buffer = '';
  }
}
module.exports = { ChrConsole };
