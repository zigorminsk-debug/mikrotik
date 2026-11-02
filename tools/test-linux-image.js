#!/usr/bin/env node
'use strict';
const assert=require('assert'),fs=require('fs').promises,os=require('os'),path=require('path'),{Readable}=require('stream'),{EventEmitter}=require('events');
const {ensureLinuxImage,download,allowed,matches,URL_IMAGE,ASSET_PATH,RELEASE_ASSET_PATH,SHA256,IMAGE_BYTES}=require('../windows/chr/linux-image');
function fake(status,headers,bytes){return (_url,_opts,cb)=>{const req=new EventEmitter();req.destroy=()=>{};process.nextTick(()=>{const stream=Readable.from(bytes||[]);stream.statusCode=status;stream.headers=headers||{};cb(stream);});return req;};}
(async()=>{
 assert(allowed(new URL(URL_IMAGE)));for(const host of ['objects.githubusercontent.com','release-assets.githubusercontent.com']){assert(allowed(new URL('https://'+host+ASSET_PATH+'?signature=x')));assert(allowed(new URL('https://'+host+RELEASE_ASSET_PATH+'?signature=x')));}
 for(const url of ['http://github.com/cirros-dev/cirros/releases/download/0.6.3/cirros-0.6.3-x86_64-disk.img','https://evil.example'+ASSET_PATH,'https://objects.githubusercontent.com/other','https://github.com/cirros-dev/cirros/releases/download/0.6.3/cirros-0.6.3-x86_64-disk.img?foo=1'])assert(!allowed(new URL(url)));
 assert(matches(SHA256));assert(!matches('00'.repeat(32)));await assert.rejects(ensureLinuxImage(path.resolve('.'),false),/подтверждения/);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'linux-download-test-'));
 try{
  await assert.rejects(download(URL_IMAGE,path.join(root,'bad-redirect'),0,fake(302,{location:'https://evil.example/unsafe'})),/Недопустимый/);
  await assert.rejects(download(URL_IMAGE,path.join(root,'too-big'),0,fake(200,{'content-length':String(IMAGE_BYTES+1)})),/слишком велик/);
  await assert.rejects(download(URL_IMAGE,path.join(root,'too-short'),0,fake(200,{},[Buffer.from('fixture')])),/размер/);
  await assert.rejects(download(URL_IMAGE,path.join(root,'status'),0,fake(404,{})),/не предоставил/);
  await assert.rejects(download(URL_IMAGE,path.join(root,'redirect-limit'),3,fake(200,{})),/Недопустимый/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
 console.log('Linux image: источники, согласие, перенаправления, размер и контрольные суммы проверены на моках. Реальную загрузку проверяет отдельный CI.');
})().catch(e=>{console.error(e);process.exitCode=1;});
