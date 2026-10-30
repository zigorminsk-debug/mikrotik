#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createHash } = require('crypto');
const { extractImage, hashFile, equalHash, ensureImage } = require('../windows/chr/download');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-download-test-'));
function zip(name, entries) {
  const file = path.join(root, name);
  const script = 'import json,sys,zipfile\nz=zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED)\nfor n,v in json.loads(sys.argv[2]): z.writestr(n,v)\nz.close()';
  const result = spawnSync('python3', ['-c', script, file, JSON.stringify(entries)], {encoding:'utf8'});
  if (result.status !== 0) throw new Error('Could not create test ZIP: ' + result.stderr);
  return file;
}
(async () => {
  await assert.rejects(ensureImage(path.join(root,'cache'), false), /лицензи/);
  const out = path.join(root, 'result.img');
  const good = zip('good.zip', [['chr-7.23.8.img','abcdef']]);
  await extractImage(good, out);
  assert.strictEqual(fs.readFileSync(out, 'utf8'), 'abcdef');
  const expected = createHash('sha256').update('abcdef').digest('hex');
  assert(equalHash(await hashFile(out), expected));
  assert(!equalHash(expected, 'bad')); assert(!equalHash(expected, '0'.repeat(64)));
  await assert.rejects(extractImage(good, out), /извлечь/); // Existing file is never overwritten.
  const evil = zip('evil.zip', [['../escaped.img','bad']]);
  await assert.rejects(extractImage(evil, path.join(root,'evil.img')), /архив|архиве/i);
  assert(!fs.existsSync(path.join(os.tmpdir(), 'escaped.img')));
  const extra = zip('extra.zip', [['chr-7.23.8.img','abcdef'], ['other','x']]);
  await assert.rejects(extractImage(extra, path.join(root,'extra.img')), /архив/i);
  await assert.rejects(extractImage(good, path.join(root,'large.img'), 'chr-7.23.8.img', 2), /архив/i);
  console.log('CHR загрузка: согласие, SHA-256 и безопасное извлечение проверены.');
})().finally(() => fs.rmSync(root, {recursive:true, force:true})).catch(e => { console.error(e); process.exitCode = 1; });
