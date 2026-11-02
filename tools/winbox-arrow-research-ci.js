#!/usr/bin/env node
'use strict';
// Disposable CI fixture only. No product use: fixed geometry and OCR cannot
// establish screenshot origin, absence of secrets, or correctness of all
// fields. The caller must create original and crop from the SAME bitmap.
const fs=require('fs'),path=require('path');
const {verify}=require('./winbox-tesseract-ci');
const EXPECTED={
 static:{address:'192.168.88.1/24',network:'192.168.88.0',interface:'bridge-lan'},
 custom:{address:'192.168.73.1/24',network:'192.168.73.0',interface:'bridge-lan'}
};
const crop={x:400,y:280,width:380,height:180,scale:4};
function arrowPlan(words,expected,width,height){
 if(!expected||width!==1040||height!==728||!verify(words,expected).every(Boolean))throw Error('Unconfirmed CI fixture');
 return ['Address','Network','Interface'].map(label=>{
  const b=words.find(w=>w.text===label).bbox;
  if(!['x0','x1','y0','y1'].every(k=>Number.isFinite(b[k])))throw Error('Invalid OCR bounds');
  const left=crop.x+b.x0/crop.scale,y=crop.y+(b.y0+b.y1)/(2*crop.scale),tip=left-5,start=tip-90;
  // Fail instead of placing an arrow in an unexpected window or on a value.
  if(left<425||left>445||y<355||y>420||tip<415||start<300||start>=tip||b.y0<0||b.y1>crop.height*crop.scale)throw Error('Unexpected fixture geometry');
  return {label,start:Math.round(start),tip:Math.round(tip),y:Math.round(y)};
 });
}
function drawArrow(image,arrow){
 const {width,height,data}=image;
 if(!Array.isArray([arrow.start,arrow.tip,arrow.y])||![arrow.start,arrow.tip,arrow.y].every(Number.isInteger)||arrow.start<0||arrow.tip>=width||arrow.start>=arrow.tip||arrow.y<9||arrow.y>=height-9||data.length!==width*height*4)throw Error('Invalid arrow');
 function put(x,y,c){if(x<0||x>=width||y<0||y>=height)return;const i=(y*width+x)*4;data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2];data[i+3]=255;}
 function draw(c,thickness,head){
  for(let x=arrow.start;x<=arrow.tip;x++)for(let d=-thickness;d<=thickness;d++)put(x,arrow.y+d,c);
  for(let x=arrow.tip-head;x<=arrow.tip;x++){const h=Math.ceil((arrow.tip-x)*.65);for(let d=-h;d<=h;d++)put(x,arrow.y+d,c);}
 }
 draw([255,255,255],4,23);draw([216,32,32],2,18);
}
async function main(){
 let worker;
 try{
  const [original,fieldCrop,outdir]=process.argv.slice(2),kind=process.env.CI_SCHEME_KIND,langPath=process.env.CI_TESS_LANG;
  if(![original,fieldCrop,outdir,langPath].every(p=>typeof p==='string'&&path.isAbsolute(p))||!Object.hasOwn(EXPECTED,kind))throw Error('Missing fixture');
  const {PNG}=require('./winbox-ocr-deps/node_modules/pngjs');
  const source=PNG.sync.read(fs.readFileSync(original)),fields=PNG.sync.read(fs.readFileSync(fieldCrop));
  if(fields.width!==crop.width*crop.scale||fields.height!==crop.height*crop.scale)throw Error('Unexpected crop');
  const {createWorker}=require('./winbox-ocr-deps/node_modules/tesseract.js');worker=await createWorker('eng',1,{langPath,cacheMethod:'none'});
  const {data}=await worker.recognize(fieldCrop);const arrows=arrowPlan(data.words,EXPECTED[kind],source.width,source.height);
  fs.mkdirSync(outdir,{recursive:true});
  for(const arrow of arrows){const image=new PNG({width:source.width,height:source.height});source.data.copy(image.data);drawArrow(image,arrow);fs.writeFileSync(path.join(outdir,arrow.label.toLowerCase()+'.png'),PNG.sync.write(image));}
  console.log('CI_ARROW_RESEARCH=3');
 }catch(_){console.log('CI_ARROW_RESEARCH=error');process.exitCode=1;}
 finally{if(worker)await worker.terminate();}
}
if(require.main===module)main();
module.exports={arrowPlan,drawArrow,EXPECTED};
