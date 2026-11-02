'use strict';
// Experimental upstream CirrOS downloader, not yet connected to the UI.
// Image is never bundled; users must see upstream source and license notices.
const fs=require('fs'),fsp=fs.promises,path=require('path'),https=require('https');
const {createHash,timingSafeEqual}=require('crypto'),{Transform}=require('stream'),{pipeline}=require('stream/promises');
const IMAGE_NAME='cirros-0.6.3-x86_64-disk.img';
const URL_IMAGE='https://github.com/cirros-dev/cirros/releases/download/0.6.3/'+IMAGE_NAME;
const ASSET_PATH='/github-production-release-asset-2e65be/219785102/6f5bab50-4c03-4330-a8c6-7b6cb1564e3f';
const RELEASE_ASSET_PATH='/github-production-release-asset/219785102/6f5bab50-4c03-4330-a8c6-7b6cb1564e3f';
const SHA256='7d6355852aeb6dbcd191bcda7cd74f1536cfe5cbf8a10495a7283a8396e4b75b';
const IMAGE_BYTES=21692416;
function allowed(url){
 return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443') &&
  ((url.hostname==='github.com'&&url.pathname===new URL(URL_IMAGE).pathname&&!url.search) ||
   (['objects.githubusercontent.com','release-assets.githubusercontent.com'].includes(url.hostname)&&[ASSET_PATH,RELEASE_ASSET_PATH].includes(url.pathname)));
}
async function hashFile(file){const h=createHash('sha256');await pipeline(fs.createReadStream(file),new Transform({transform(chunk,_enc,cb){h.update(chunk);cb();}}));return h.digest('hex');}
function matches(hash){return typeof hash==='string'&&/^[0-9a-f]{64}$/.test(hash)&&timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(SHA256,'hex'));}
async function download(url,destination,redirects=0,request=https.get){
 const parsed=new URL(url);if(!allowed(parsed)||redirects>2)throw Error('Недопустимый адрес образа Linux');
 const response=await new Promise((resolve,reject)=>{const req=request(parsed,{timeout:30000},resolve);req.on('timeout',()=>req.destroy(Error('Тайм-аут загрузки Linux')));req.on('error',reject);});
 if([301,302,303,307,308].includes(response.statusCode)){const target=response.headers.location;response.resume();if(!target)throw Error('Некорректное перенаправление Linux');return download(new URL(target,parsed).href,destination,redirects+1,request);}
 if(response.statusCode!==200){response.resume();throw Error('Сервер не предоставил образ Linux');}
 const length=Number(response.headers['content-length']);if(Number.isFinite(length)&&length>IMAGE_BYTES){response.destroy();throw Error('Образ Linux слишком велик');}
 let size=0;const limit=new Transform({transform(chunk,_enc,cb){size+=chunk.length;cb(size>IMAGE_BYTES?Error('Образ Linux слишком велик'):null,chunk);}});
 await pipeline(response,limit,fs.createWriteStream(destination,{flags:'wx',mode:0o600}));
 if(size!==IMAGE_BYTES)throw Error('Некорректный размер образа Linux');
}
async function ensureLinuxImage(cacheRoot,consent){
 if(consent!==true)throw Error('Загрузка образа Linux требует отдельного подтверждения');
 if(typeof cacheRoot!=='string'||!path.isAbsolute(cacheRoot))throw Error('Недопустимый каталог образа Linux');
 await fsp.mkdir(cacheRoot,{recursive:true,mode:0o700});const result=path.join(cacheRoot,IMAGE_NAME);
 try{const stats=await fsp.lstat(result);if(stats.isFile()&&stats.size===IMAGE_BYTES&&matches(await hashFile(result)))return result;}catch(e){if(e.code!=='ENOENT')throw e;}
 const temp=await fsp.mkdtemp(path.join(cacheRoot,'.linux-'));
 try{
  const image=path.join(temp,IMAGE_NAME);await download(URL_IMAGE,image);
  if(!matches(await hashFile(image)))throw Error('Контрольная сумма образа Linux не совпала');
  await fsp.rm(result,{force:true});await fsp.rename(image,result);return result;
 }finally{await fsp.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
}
module.exports={ensureLinuxImage,download,allowed,hashFile,matches,URL_IMAGE,ASSET_PATH,RELEASE_ASSET_PATH,SHA256,IMAGE_BYTES,IMAGE_NAME};
