#!/usr/bin/env node
'use strict';
// CI-ONLY diagnostic. Never included in the app and never a capture/verification
// decision: on one fixed WinBox fixture, compare the last glyph of OCR's
// "etherl" with three independently read '1' glyphs in the Network field.
// A raster comparison cannot prove image origin, identity or confidentiality.
const fs=require('fs');
const path=require('path');
const {field}=require('./winbox-tesseract-ci');
function box(symbol, image) {
  const b=symbol && symbol.bbox;
  return !!(b && ['x0','x1','y0','y1'].every(k=>Number.isInteger(b[k])) && b.x0>=0 && b.y0>=0 && b.x1<=image.width && b.y1<=image.height && b.x1>b.x0 && b.y1>b.y0);
}
function distance(image,a,b) {
  let sum=0;
  const gray=(x,y)=>{const i=(Math.floor(y)*image.width+Math.floor(x))*4;return (.2126*image.data[i]+.7152*image.data[i+1]+.0722*image.data[i+2])/255;};
  for(let y=0;y<40;y++)for(let x=0;x<30;x++){
    const sample=(r)=>gray(r.x0+(x+.5)*(r.x1-r.x0)/30,r.y0+(y+.5)*(r.y1-r.y0)/40);
    sum+=Math.abs(sample(a)-sample(b));
  }
  return sum/1200;
}
function diagnostic(words,image) {
  if(!Array.isArray(words)||!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1||!image.data||image.data.length!==image.width*image.height*4) return false;
  // Require exact location of both uniquely recognised field labels and the
  // fixed expected network. This does not check arbitrary RouterOS output.
  if(!field(words,'Network','198.51.100.0')||!field(words,'Interface','etherl'))return false;
  const n=words.find(w=>w.text==='198.51.100.0'),i=words.find(w=>w.text==='etherl');
  if(!Array.isArray(n.symbols)||!Array.isArray(i.symbols)||i.symbols.map(s=>s.text).join('')!=='etherl'||n.symbols.map(s=>s.text).join('')!=='198.51.100.0')return false;
  const ones=n.symbols.filter(s=>s.text==='1'),candidate=i.symbols[5];
  if(ones.length!==3 || ![...ones,candidate].every(s=>Number.isFinite(s.confidence)&&s.confidence>=90&&box(s,image)))return false;
  const c=candidate.bbox;
  const pass=ones.filter(s=>{
    const b=s.bbox,w=(c.x1-c.x0)/(b.x1-b.x0),h=(c.y1-c.y0)/(b.y1-b.y0);
    return w>=.8&&w<=1.2&&h>=.8&&h<=1.2&&distance(image,c,b)<.09;
  }).length;
  return pass>=2;
}
if(require.main===module)(async()=>{
 let worker;
 try{
  const input=process.argv[2],langPath=process.env.CI_TESS_LANG;
  if(!input||!path.isAbsolute(input)||!langPath||!path.isAbsolute(langPath))throw Error('Missing fixture');
  const {createWorker}=require('./winbox-ocr-deps/node_modules/tesseract.js');
  const {PNG}=require('./winbox-ocr-deps/node_modules/pngjs');
  const image=PNG.sync.read(fs.readFileSync(input));
  if(image.width>2000||image.height>1000)throw Error('Wrong fixture size');
  worker=await createWorker('eng',1,{langPath,cacheMethod:'none'});
  const {data}=await worker.recognize(input);
  console.log('CI_GLYPH_DIAGNOSTIC='+Number(diagnostic(data.words,image)));
 } catch(_){console.log('CI_GLYPH_DIAGNOSTIC=error');process.exitCode=1;}
 finally{if(worker)await worker.terminate();}
})();
module.exports={diagnostic,distance};
