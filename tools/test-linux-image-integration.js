#!/usr/bin/env node
'use strict';
// CI: real upstream download, SHA verification and re-use of verified cache.
const path=require('path'),fs=require('fs').promises,assert=require('assert');
const {ensureLinuxImage,hashFile,SHA256,IMAGE_BYTES}=require('../windows/chr/linux-image');
(async()=>{
 const root=path.resolve(process.argv[2]||'');if(!process.argv[2])throw Error('Expected CI cache directory');
 await fs.mkdir(root,{recursive:true});await fs.writeFile(path.join(root,'cirros-0.6.3-x86_64-disk.img'),'corrupted fixture');
 const file=await ensureLinuxImage(root,true);assert.equal((await fs.stat(file)).size,IMAGE_BYTES);assert.equal(await hashFile(file),SHA256);
 assert.equal(await ensureLinuxImage(root,true),file);assert.deepStrictEqual((await fs.readdir(root)).sort(),['cirros-0.6.3-x86_64-disk.img']);
 console.log('::notice title=Linux image downloader::CI fetched the pinned upstream image after replacing a corrupt cache, verified SHA-256, and reused the verified file. Image is not bundled or launched by the application.');
})().catch(e=>{console.log('::error title=Linux image downloader::'+String(e.message).replace(/[\r\n%]/g,' '));process.exitCode=1;});
