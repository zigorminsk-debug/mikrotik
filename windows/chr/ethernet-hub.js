'use strict';
// A small isolated Ethernet repeater for future QEMU labs. Not connected to the
// product yet. Both ends must bind loopback; this is not a security boundary
// against other processes running under the same Windows account.
const dgram = require('dgram');
const MAX_FRAME = 9216;
class EthernetHub {
  constructor(socket) {
    this.socket = socket;
    this.peers = new Set();
    this.closed = false;
    this.failure = null;
    socket.on('message', (frame, from) => {
      if (this.closed || from.address !== '127.0.0.1' || !this.peers.has(from.port) || frame.length < 14 || frame.length > MAX_FRAME) return;
      for (const port of this.peers) {
        if (port === from.port) continue;
        // UDP errors can occur while a VM is shutting down. Do not let a
        // synchronous socket failure crash the controlling process.
        try { socket.send(frame, port, '127.0.0.1', () => {}); } catch (_) {}
      }
    });
    socket.on('error', () => { this.failure = new Error('Ошибка изолированной виртуальной сети'); });
  }
  static async create() {
    const socket = dgram.createSocket('udp4');
    try {
      await new Promise((resolve, reject) => { socket.once('error', reject); socket.bind(0, '127.0.0.1', resolve); });
      return new EthernetHub(socket);
    } catch (error) { try { socket.close(); } catch (_) {} throw error; }
  }
  get port() { if (this.closed || this.failure) throw new Error('Виртуальная сеть остановлена'); return this.socket.address().port; }
  addPeer(port) {
    if (this.closed || this.failure || !Number.isInteger(port) || port < 1 || port > 65535 || port === this.port || this.peers.has(port)) throw new Error('Недопустимый порт виртуальной сети');
    this.peers.add(port);
  }
  removePeer(port) { this.peers.delete(port); }
  close() {
    if (this.closed) return Promise.resolve();
    this.closed = true; this.peers.clear();
    return new Promise(resolve => { try { this.socket.close(resolve); } catch (_) { resolve(); } });
  }
}
module.exports = {EthernetHub, MAX_FRAME};
