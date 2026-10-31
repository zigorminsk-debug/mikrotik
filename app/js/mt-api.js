/* =====================================================================
   MikroTik RouterOS API — реализация протокола (API 8728 / API-SSL 8729).
   Только протокол: кодирование/разбор слов предложений, логин
   (plain-text и challenge-ответ по RFC 1321 MD5), перевод CLI-строки
   в слова API. Сеть и нативные мосты — в mt-transport.js.
   Ссылка: wiki.mikrotik.com/wiki/Manual:API
   ===================================================================== */
(function (global) {
  'use strict';

  /* ---------- строки <-> байты (UTF-8) ---------- */
  function strToBytes(s) {
    var latin = unescape(encodeURIComponent(String(s)));
    var b = [];
    for (var i = 0; i < latin.length; i++) b.push(latin.charCodeAt(i) & 0xFF);
    return b;
  }
  function bytesToStr(bytes) {
    // декодер UTF-8 без кидков на произвольные байты
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      if (b < 0x80) { s += String.fromCharCode(b); }
      else if (b > 0xBF && b < 0xF0 && i + 1 < bytes.length && (bytes[i + 1] & 0xC0) === 0x80) {
        s += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i + 1] & 0x3F)); i++;
      } else { s += String.fromCharCode(b); }
    }
    return s;
  }
  function hexToBytes(h) {
    var b = [];
    h = String(h).replace(/[^0-9A-Fa-f]/g, '');
    for (var i = 0; i + 1 < h.length; i += 2) b.push(parseInt(h.substr(i, 2), 16));
    return b;
  }

  /* ---------- MD5 (RFC 1321, без зависимостей) ---------- */
  function add32(x, y) { return (x + y) | 0; }
  function rol32(x, cnt) { return (x << cnt) | (x >>> (32 - cnt)); }
  function cmn(q, a, b, x, s, t) {
    return add32(rol32(add32(add32(a, q), add32(x, t)), s), b);
  }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
  function md5HexBytes(bytes) {
    var l = bytes.length * 8;
    var n = (((l + 64) >>> 9) << 4) + 16;
    var X = [];
    for (var i = 0; i < n; i++) X[i] = 0;
    for (var i = 0; i < bytes.length; i++) X[i >> 2] |= bytes[i] << ((i % 4) * 8);
    X[l >> 5] |= 0x80 << ((l % 32));
    X[n - 2] = l;
    X[n - 1] = 0;
    var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (var i = 0; i < X.length; i += 16) {
      var olda = a, oldb = b, oldc = c, oldd = d;
      a = ff(a, b, c, d, X[i + 0], 7, 0xd76aa478);
      d = ff(d, a, b, c, X[i + 1], 12, 0xe8c7b756);
      c = ff(c, d, a, b, X[i + 2], 17, 0x242070db);
      b = ff(b, c, d, a, X[i + 3], 22, 0xc1bdceee);
      a = ff(a, b, c, d, X[i + 4], 7, 0xf57c0faf);
      d = ff(d, a, b, c, X[i + 5], 12, 0x4787c62a);
      c = ff(c, d, a, b, X[i + 6], 17, 0xa8304613);
      b = ff(b, c, d, a, X[i + 7], 22, 0xfd469501);
      a = ff(a, b, c, d, X[i + 8], 7, 0x698098d8);
      d = ff(d, a, b, c, X[i + 9], 12, 0x8b44f7af);
      c = ff(c, d, a, b, X[i + 10], 17, 0xffff5bb1);
      b = ff(b, c, d, a, X[i + 11], 22, 0x895cd7be);
      a = ff(a, b, c, d, X[i + 12], 7, 0x6b901122);
      d = ff(d, a, b, c, X[i + 13], 12, 0xfd987193);
      c = ff(c, d, a, b, X[i + 14], 17, 0xa679438e);
      b = ff(b, c, d, a, X[i + 15], 22, 0x49b40821);
      a = gg(a, b, c, d, X[i + 1], 5, 0xf61e2562);
      d = gg(d, a, b, c, X[i + 6], 9, 0xc040b340);
      c = gg(c, d, a, b, X[i + 11], 14, 0x265e5a51);
      b = gg(b, c, d, a, X[i + 0], 20, 0xe9b6c7aa);
      a = gg(a, b, c, d, X[i + 5], 5, 0xd62f105d);
      d = gg(d, a, b, c, X[i + 10], 9, 0x02441453);
      c = gg(c, d, a, b, X[i + 15], 14, 0xd8a1e681);
      b = gg(b, c, d, a, X[i + 4], 20, 0xe7d3fbc8);
      a = gg(a, b, c, d, X[i + 9], 5, 0x21e1cde6);
      d = gg(d, a, b, c, X[i + 14], 9, 0xc33707d6);
      c = gg(c, d, a, b, X[i + 3], 14, 0xf4d50d87);
      b = gg(b, c, d, a, X[i + 8], 20, 0x455a14ed);
      a = gg(a, b, c, d, X[i + 13], 5, 0xa9e3e905);
      d = gg(d, a, b, c, X[i + 2], 9, 0xfcefa3f8);
      c = gg(c, d, a, b, X[i + 7], 14, 0x676f02d9);
      b = gg(b, c, d, a, X[i + 12], 20, 0x8d2a4c8a);
      a = hh(a, b, c, d, X[i + 5], 4, 0xfffa3942);
      d = hh(d, a, b, c, X[i + 8], 11, 0x8771f681);
      c = hh(c, d, a, b, X[i + 11], 16, 0x6d9d6122);
      b = hh(b, c, d, a, X[i + 14], 23, 0xfde5380c);
      a = hh(a, b, c, d, X[i + 1], 4, 0xa4beea44);
      d = hh(d, a, b, c, X[i + 4], 11, 0x4bdecfa9);
      c = hh(c, d, a, b, X[i + 7], 16, 0xf6bb4b60);
      b = hh(b, c, d, a, X[i + 10], 23, 0xbebfbc70);
      a = hh(a, b, c, d, X[i + 13], 4, 0x289b7ec6);
      d = hh(d, a, b, c, X[i + 0], 11, 0xeaa127fa);
      c = hh(c, d, a, b, X[i + 3], 16, 0xd4ef3085);
      b = hh(b, c, d, a, X[i + 6], 23, 0x04881d05);
      a = hh(a, b, c, d, X[i + 9], 4, 0xd9d4d039);
      d = hh(d, a, b, c, X[i + 12], 11, 0xe6db99e5);
      c = hh(c, d, a, b, X[i + 15], 16, 0x1fa27cf8);
      b = hh(b, c, d, a, X[i + 2], 23, 0xc4ac5665);
      a = ii(a, b, c, d, X[i + 0], 6, 0xf4292244);
      d = ii(d, a, b, c, X[i + 7], 10, 0x432aff97);
      c = ii(c, d, a, b, X[i + 14], 15, 0xab9423a7);
      b = ii(b, c, d, a, X[i + 5], 21, 0xfc93a039);
      a = ii(a, b, c, d, X[i + 12], 6, 0x655b59c3);
      d = ii(d, a, b, c, X[i + 3], 10, 0x8f0ccc92);
      c = ii(c, d, a, b, X[i + 10], 15, 0xffeff47d);
      b = ii(b, c, d, a, X[i + 1], 21, 0x85845dd1);
      a = ii(a, b, c, d, X[i + 8], 6, 0x6fa87e4f);
      d = ii(d, a, b, c, X[i + 15], 10, 0xfe2ce6e0);
      c = ii(c, d, a, b, X[i + 6], 15, 0xa3014314);
      b = ii(b, c, d, a, X[i + 13], 21, 0x4e0811a1);
      a = ii(a, b, c, d, X[i + 4], 6, 0xf7537e82);
      d = ii(d, a, b, c, X[i + 11], 10, 0xbd3af235);
      c = ii(c, d, a, b, X[i + 2], 15, 0x2ad7d2bb);
      b = ii(b, c, d, a, X[i + 9], 21, 0xeb86d391);
      a = add32(a, olda); b = add32(b, oldb); c = add32(c, oldc); d = add32(d, oldd);
    }
    var hex = '';
    for (var i = 0; i < 4; i++) {
      var v = i === 0 ? a : i === 1 ? b : i === 2 ? c : d;
      for (var j = 0; j < 4; j++) {
        var n = (v >>> (j * 8)) & 0xFF;
        hex += (n < 16 ? '0' : '') + n.toString(16);
      }
    }
    return hex;
  }
  function md5Hex(s) {
    return md5HexBytes(strToBytes(s));
  }
  function md5Bytes(s) {
    var h = md5Hex(s), b = [];
    for (var i = 0; i + 1 < h.length; i += 2) b.push(parseInt(h.substr(i, 2), 16));
    return b;
  }

  /* ---------- кодирование слов предложения ---------- */
  function encodeWords(words) {
    var out = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var b = (w instanceof Uint8Array) ? Array.prototype.slice.call(w) : strToBytes(String(w));
      var len = b.length;
      if (len < 255) out.push(len);
      else { out.push(0xFF); out.push((len >>> 24) & 0xFF, (len >>> 16) & 0xFF, (len >>> 8) & 0xFF, len & 0xFF); }
      out = out.concat(b);
    }
    return new Uint8Array(out);
  }

  /* ---------- потоковый разбор байт на слова ---------- */
  var WordReader = function (onWord) {
    this.buf = [];
    this.onWord = onWord || function () {};
  };
  WordReader.prototype.feed = function (bytes) {
    var arr = (bytes instanceof Uint8Array) ? Array.prototype.slice.call(bytes) : Array.prototype.slice.call(bytes || []);
    this.buf = this.buf.concat(arr);
    while (this.buf.length > 0) {
      var len = this.buf[0];
      if (len === 0xFF) {
        if (this.buf.length < 5) return;
        len = ((this.buf[1] & 0xFF) << 24) | ((this.buf[2] & 0xFF) << 16)
          | ((this.buf[3] & 0xFF) << 8) | (this.buf[4] & 0xFF);
        if (this.buf.length < 5 + len) return;
        this.onWord(bytesToStr(this.buf.slice(5, 5 + len)));
        this.buf = this.buf.slice(5 + len);
      } else {
        if (this.buf.length < 1 + len) return;
        this.onWord(bytesToStr(this.buf.slice(1, 1 + len)));
        this.buf = this.buf.slice(1 + len);
      }
    }
  };

  /* ---------- логин ---------- */
  function loginPassword(user, pass) {
    return ['/login', '=name=' + String(user), '=password=' + String(pass)];
  }
  function loginResponse(user, challengeHex, pass) {
    var digest = md5HexBytes(hexToBytes(challengeHex).concat(strToBytes(String(pass))));
    var response = new Uint8Array(digest.length / 2 + 1);
    response[0] = 0x00;
    for (var i = 0; i < digest.length / 2; i++) response[i + 1] = parseInt(digest.substr(i * 2, 2), 16);
    return ['/login', '=name=' + String(user), response];
  }

  /* ---------- разбор ответа ---------- */
  function attrOf(word) {
    if (word.charAt(0) === '=') {
      var eq = word.indexOf('=', 1); // отделяем имя от значения (слово вида =имя=значение)
      if (eq < 0) eq = word.length;
      return { name: word.slice(1, eq), value: word.slice(eq + 1) };
    }
    return null;
  }
  function parseReply(words) {
    var status = null, attrs = [], message = '';
    words.forEach(function (w) {
      if (w.charAt(0) === '!') status = w.slice(1);
      else { var a = attrOf(w); if (a) { attrs.push(a); if (a.name === 'message') message = a.value; } }
    });
    return { status: status || 'done', attrs: attrs, message: message };
  }

  /* ---------- CLI-строка RouterOS -> слова API ---------- */
  function tokenizeCli(line) {
    var tokens = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (inQ) { if (ch === '"') inQ = false; else cur += ch; }
      else {
        if (ch === '"') inQ = true;
        else if (ch === ' ' || ch === '\t') { if (cur) { tokens.push(cur); cur = ''; } }
        else cur += ch;
      }
    }
    if (cur) tokens.push(cur);
    return tokens;
  }
  function cliToWords(line) {
    line = String(line).trim();
    if (!line) return null;
    var tokens = tokenizeCli(line);
    // путь обрывается на '[' или на первом токене с '=' (атрибуты команды)
    var split = tokens.length;
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i] === '[' || tokens[i].indexOf('=') >= 0) { split = i; break; }
    }
    var path = tokens.slice(0, split).join('/');
    var words = [path];
    for (var i = split; i < tokens.length; i++) {
      var t = tokens[i];
      words.push(t.indexOf('=') >= 0 ? '=' + t : t);
    }
    return words;
  }

  var MtApi = {
    strToBytes: strToBytes,
    bytesToStr: bytesToStr,
    hexToBytes: hexToBytes,
    md5Hex: md5Hex,
    md5HexBytes: md5HexBytes,
    md5Bytes: md5Bytes,
    encodeWords: encodeWords,
    encodeSentence: encodeWords,
    WordReader: WordReader,
    loginPassword: loginPassword,
    loginResponse: loginResponse,
    parseReply: parseReply,
    cliToWords: cliToWords,
    tokenizeCli: tokenizeCli
  };

  global.MtApi = MtApi;
  if (typeof module !== 'undefined' && module.exports) module.exports = MtApi;
})(this);
