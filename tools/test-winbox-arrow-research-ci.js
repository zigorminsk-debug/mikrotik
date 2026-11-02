#!/usr/bin/env node
'use strict';
const assert=require('assert'),{arrowPlan,drawArrow,EXPECTED}=require('./winbox-arrow-research-ci');
const w=(text,x,y)=>({text,confidence:90,bbox:{x0:x,y0:y,x1:x+100,y1:y+40}});
const words=[w('Address',130,307),w('192.168.88.1/24',395,307),w('Network',130,407),w('192.168.88.0',395,407),w('Interface',122,507),w('bridge-lan',395,507)];
const arrows=arrowPlan(words,EXPECTED.static,1040,728);assert.deepStrictEqual(arrows.map(a=>a.label),['Address','Network','Interface']);
assert.throws(()=>arrowPlan(words,EXPECTED.custom,1040,728));
assert.throws(()=>arrowPlan([...words,w('Interface',122,600)],EXPECTED.static,1040,728));
assert.throws(()=>arrowPlan(words,EXPECTED.static,1024,728));
const misposition=structuredClone(words);misposition[4].bbox.x0=500;misposition[4].bbox.x1=600;assert.throws(()=>arrowPlan(misposition,EXPECTED.static,1040,728));
const image={width:1040,height:728,data:Buffer.alloc(1040*728*4,255)};drawArrow(image,arrows[0]);
assert(image.data.some(v=>v!==255));for(let y=0;y<728;y++)for(let x=0;x<1040;x++)if(x>arrows[0].tip||x<arrows[0].start||Math.abs(y-arrows[0].y)>20){const i=(y*1040+x)*4;assert.equal(image.data[i],255);assert.equal(image.data[i+1],255);assert.equal(image.data[i+2],255);}
assert.throws(()=>drawArrow(image,{start:-1,tip:500,y:300}));console.log('CI-only arrow geometry: positive, mismatch, duplicate and bounds controls passed.');
