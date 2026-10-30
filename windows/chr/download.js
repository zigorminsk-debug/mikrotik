'use strict';
// Windows main process only: caller must obtain explicit consent to MikroTik terms.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const https = require('https');
const { createHash, timingSafeEqual } = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const yauzl = require('yauzl');
const URL_CHR = 'https://download.mikrotik.com/routeros/7.23.8/chr-7.23.8.img.zip';
const IMAGE_NAME = 'chr-7.23.8.img';
// Measured from the official HTTPS download on the Windows CI runner.
const ZIP_SHA256 = 'ac01ec7c092f4cab8136212e8ebfd613e0a37844c406317fa228d1ad446ce62c';
const IMAGE_SHA256 = 'bf8dc6cff65105389f29618f86c0d19e58a621465cb4754f0818a6ea50714ce7';
const MAX_ZIP = 100 * 1024 * 1024;
const MAX_IMAGE = 512 * 1024 * 1024;

function equalHash(a, b) {
  return typeof a === 'string' && typeof b === 'string' && /^[0-9a-f]{64}$/.test(a) && /^[0-9a-f]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
async function hashFile(file) {
  const hash = createHash('sha256');
  await pipeline(fs.createReadStream(file), new Transform({ transform(chunk, enc, callback) { hash.update(chunk); callback(); } }));
  return hash.digest('hex');
}
function allowed(url) { return url.protocol === 'https:' && url.hostname === 'download.mikrotik.com' && !url.username && !url.password && (!url.port || url.port === '443'); }
async function download(url, destination, redirects = 0) {
  const parsed = new URL(url);
  if (!allowed(parsed) || redirects > 3) throw new Error('Недопустимый адрес загрузки CHR');
  const response = await new Promise((resolve, reject) => {
    const req = https.get(parsed, { timeout: 30000 }, resolve);
    req.on('timeout', () => req.destroy(new Error('Тайм-аут загрузки CHR')));
    req.on('error', reject);
  });
  if ([301,302,303,307,308].includes(response.statusCode)) {
    const target = response.headers.location; response.resume();
    if (!target) throw new Error('Некорректное перенаправление CHR');
    return download(new URL(target, parsed).href, destination, redirects + 1);
  }
  if (response.statusCode !== 200) { response.resume(); throw new Error('Сервер MikroTik не предоставил образ CHR'); }
  const declared = Number(response.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_ZIP) { response.destroy(); throw new Error('Архив CHR слишком велик'); }
  let size = 0;
  const limiter = new Transform({transform(chunk, enc, cb) { size += chunk.length; cb(size > MAX_ZIP ? new Error('Архив CHR слишком велик') : null, chunk); }});
  await pipeline(response, limiter, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
  if (!size) throw new Error('Пустой архив CHR');
}
function extractImage(zipPath, destination, expectedName = IMAGE_NAME, maxSize = MAX_IMAGE) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(new Error('Не удалось прочитать архив CHR'));
      let found = false, failed = false;
      const fail = err => { if (!failed) { failed = true; zip.close(); reject(err); } };
      zip.on('error', () => fail(new Error('Повреждённый архив CHR')));
      zip.on('entry', entry => {
        if (found || entry.fileName !== expectedName || entry.uncompressedSize < 1 || entry.uncompressedSize > maxSize || entry.compressedSize < 1 || ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000) return fail(new Error('Недопустимое содержимое архива CHR'));
        found = true;
        zip.openReadStream(entry, (err, input) => {
          if (err) return fail(new Error('Не удалось открыть образ CHR'));
          pipeline(input, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 }))
            .then(() => { if (!failed) zip.readEntry(); }).catch(() => fail(new Error('Не удалось извлечь образ CHR')));
        });
      });
      zip.on('end', () => { if (!failed) found ? resolve() : fail(new Error('Образ CHR в архиве не найден')); });
      zip.readEntry();
    });
  });
}
async function ensureImage(cacheRoot, licenseAccepted) {
  if (licenseAccepted !== true) throw new Error('Перед загрузкой необходимо принять условия лицензии MikroTik');
  if (!ZIP_SHA256 || !IMAGE_SHA256) throw new Error('Контрольные суммы CHR ещё не подтверждены');
  await fsp.mkdir(cacheRoot, { recursive: true, mode: 0o700 });
  const result = path.join(cacheRoot, IMAGE_NAME);
  try { if (equalHash(await hashFile(result), IMAGE_SHA256)) return result; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const temp = await fsp.mkdtemp(path.join(cacheRoot, '.chr-'));
  try {
    const zip = path.join(temp, 'download.zip'), image = path.join(temp, IMAGE_NAME);
    await download(URL_CHR, zip);
    if (!equalHash(await hashFile(zip), ZIP_SHA256)) throw new Error('Контрольная сумма архива CHR не совпала');
    await extractImage(zip, image);
    if (!equalHash(await hashFile(image), IMAGE_SHA256)) throw new Error('Контрольная сумма образа CHR не совпала');
    // The cached image is pristine and must never be used as the writable disk.
    await fsp.rm(result, { force: true });
    await fsp.rename(image, result);
    return result;
  } finally { await fsp.rm(temp, { recursive: true, force: true }); }
}
module.exports = { ensureImage, extractImage, equalHash, hashFile };
