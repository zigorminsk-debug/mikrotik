#!/usr/bin/env node
'use strict';
// CI-only: recognize a crop of a disposable CHR fixture. Not a production
// selector, proof of image origin, or permission to process user screenshots.
const path = require('path');
function field(words, label, value) {
  const find = text => words.filter(w => w && w.text === text && Number.isFinite(w.confidence) && w.confidence >= 60 && w.bbox &&
    ['x0','x1','y0','y1'].every(k=>Number.isFinite(w.bbox[k])) && w.bbox.x1>w.bbox.x0 && w.bbox.y1>w.bbox.y0);
  const labels = find(label), values = find(value);
  // Also reject a duplicate even if OCR is not confident about one occurrence.
  if (words.filter(w=>w && w.text === label).length !== 1 || words.filter(w=>w && w.text === value).length !== 1 || labels.length !== 1 || values.length !== 1) return false;
  const a=labels[0].bbox,b=values[0].bbox;
  return b.x0>a.x1 && Math.abs((a.y0+a.y1-b.y0-b.y1)/2)<=24;
}
function verify(words) {
  if (!Array.isArray(words)) return [false,false,false];
  return [['Address','192.168.88.1/24'],['Network','192.168.88.0'],['Interface','bridge-lan']].map(([k,v])=>field(words,k,v));
}
if (require.main === module) {
  (async()=>{
    let worker;
    try {
      const image=process.argv[2], langPath=process.env.CI_TESS_LANG;
      if(!image || !path.isAbsolute(image) || !langPath || !path.isAbsolute(langPath)) throw Error('missing CI fixture');
      const {createWorker}=require('./winbox-ocr-deps/node_modules/tesseract.js');
      worker=await createWorker('eng',1,{langPath,cacheMethod:'none'});
      const {data}=await worker.recognize(image);
      const result=verify(data.words);
      console.log('CI_TESS_FIELDS='+result.map(Number).join(','));
      if(!result.every(Boolean))process.exitCode=1;
    } catch (_) { console.log('CI_TESS_FIELDS=error');process.exitCode=1; }
    finally { if(worker)await worker.terminate(); }
  })();
}
module.exports={field,verify};
