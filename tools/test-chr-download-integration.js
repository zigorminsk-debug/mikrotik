#!/usr/bin/env node
'use strict';
// Windows CI, synthetic consent: verify download, hashes, extraction, and cache.
const fs = require('fs').promises;
const path = require('path');
const {ensureImage} = require('../windows/chr/download');
const root = process.argv[2];
if (!root) throw Error('Cache directory required');
(async () => {
  const image = await ensureImage(root, true);
  if (path.basename(image) !== 'chr-7.23.8.img' || !(await fs.stat(image)).size) throw Error('Invalid CHR image');
  if (await ensureImage(root, true) !== image) throw Error('Cache mismatch');
  console.log('Official CHR: download, SHA-256, extraction and cache verified.');
})().catch(e => { console.error('CHR download test failed:', e.message); process.exitCode = 1; });
