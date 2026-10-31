#!/usr/bin/env node
/* Тесты протокола RouterOS API (app/js/mt-api.js).
   Запуск: node tools/test-mt.js */
'use strict';
const path = require('path');
const assert = require('assert');
const MtApi = require(path.join(__dirname, '..', 'app', 'js', 'mt-api.js'));

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.log('  ✗ FAIL: ' + msg); }
}

console.log('== MD5 (RFC 1321) ==');
ok(MtApi.md5Hex('') === 'd41d8cd98f00b204e9800998ecf8427e', 'md5("")');
ok(MtApi.md5Hex('hello') === '5d41402abc4b2a76b9719d911017c592', 'md5("hello")');
ok(MtApi.md5Hex('The quick brown fox jumps over the lazy dog')
   === '9e107d9d372bb6826bd81d3542a419d6', 'md5(frase)');

console.log('== Кодирование слов ==');
function roundTrip(words) {
  const enc = MtApi.encodeWords(words);
  const got = [];
  const reader = new MtApi.WordReader((w) => got.push(w));
  // кормим по одному байту, чтобы проверить потоковый разбор (кусочки неделимы)
  for (let i = 0; i < enc.length; i++) reader.feed(enc.slice(i, i + 1));
  reader.feed(new Uint8Array(0));
  return got;
}
ok(JSON.stringify(roundTrip(['/login', '=name=admin', '=password=sekret']))
   === JSON.stringify(['/login', '=name=admin', '=password=sekret']), 'round-trip слов');
ok(JSON.stringify(roundTrip(['/ip/address/print', '=comment=hello world']))
   === JSON.stringify(['/ip/address/print', '=comment=hello world']), 'round-trip с пробелами');
// слово длиннее 255 байт → длина через 0xFF + 4 байта
const long = 'x'.repeat(300);
ok(JSON.stringify(roundTrip(['/test', long])) === JSON.stringify(['/test', long]), 'длинное слово (>255)');

console.log('== Разбор ответов ==');
const r1 = MtApi.parseReply(['=ret=ABCD1234', '!done']);
ok(r1.status === 'done' && r1.attrs.length === 1 && r1.attrs[0].name === 'ret' && r1.attrs[0].value === 'ABCD1234', 'login challenge');
const r2 = MtApi.parseReply(['=name=MikroTik', '!done']);
ok(r2.status === 'done' && r2.attrs[0].value === 'MikroTik', 'identity print');
const r3 = MtApi.parseReply(['=message=wrong password', '!trap']);
ok(r3.status === 'trap' && r3.message === 'wrong password', 'trap с сообщением');

console.log('== CLI -> слова API ==');
ok(JSON.stringify(MtApi.cliToWords('/ip address print'))
   === JSON.stringify(['/ip/address/print']), 'простая команда');
ok(JSON.stringify(MtApi.cliToWords('/ip address add address=1.2.3.4/24 interface=ether1'))
   === JSON.stringify(['/ip/address/add', '=address=1.2.3.4/24', '=interface=ether1']), 'команда с атрибутами');
ok(JSON.stringify(MtApi.cliToWords('/interface ethernet set [ find default-name=ether1 ] name=wan comment="WAN провайдер A"'))
   === JSON.stringify(['/interface/ethernet/set', '[', 'find', '=default-name=ether1', ']', '=name=wan', '=comment=WAN провайдер A']), 'кэвы и [find]');
ok(MtApi.cliToWords('   ') === null, 'пустая строка → null');

console.log('== Логин: challenge-ответ ==');
const challenge = '0123456789ABCDEF0123456789ABCDEF';
const lr = MtApi.loginResponse('admin', challenge, 'pass');
ok(lr[0] === '/login' && lr[1] === '=name=admin' && lr[2] instanceof Uint8Array, 'форма ответа на challenge');
const respBytes = lr[2];
ok(respBytes[0] === 0x00 && respBytes.length === 17, 'ответ = 0x00 + 16 байт MD5');
// контроль: MD5(challenge-bytes + 'pass')
const crypto = require('crypto');
const expected = crypto.createHash('md5')
  .update(Buffer.from(challenge.replace(/[^0-9A-Fa-f]/g, ''), 'hex'))
  .update('pass', 'utf8')
  .digest();
ok(Buffer.from(respBytes.slice(1)).equals(expected), 'MD5(challenge + пароль) совпадает с Node crypto');

console.log('============================');
console.log('Итого: ' + passed + ' ok, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
