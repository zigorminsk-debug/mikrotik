/* Копирует общее веб-ядро (../app) в windows/www перед запуском/сборкой. */
'use strict';
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', '..', 'app');
const dst = path.join(__dirname, '..', 'www');

if (!fs.existsSync(src)) {
  console.error('Не найдено веб-ядро: ' + src);
  process.exit(1);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });

let n = 0;
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p); else n++;
  }
})(dst);
console.log('Скопировано ' + n + ' файлов: app → windows/www');
