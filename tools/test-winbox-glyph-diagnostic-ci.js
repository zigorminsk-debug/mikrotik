#!/usr/bin/env node
'use strict';
// Synthetic data checks failure modes only; real WinBox positive and negative
// captures are separately exercised by Windows CI.
const assert=require('assert'),{diagnostic}=require('./winbox-glyph-diagnostic-ci');
const image={width:500,height:200,data:Buffer.alloc(500*200*4,255)};
const sym=(text,x,y)=>({text,confidence:99,bbox:{x0:x,y0:y,x1:x+4,y1:y+8}});
const word=(text,x,y,symbols)=>({text,confidence:90,bbox:{x0:x,y0:y,x1:x+text.length*8,y1:y+8},symbols});
const labels=[word('Network',0,0),word('Interface',0,100)];
const n='198.51.100.0'.split('').map((c,i)=>sym(c,100+i*8,0));
const e='etherl'.split('').map((c,i)=>sym(c,100+i*8,100));
const words=[...labels,word('198.51.100.0',100,0,n),word('etherl',100,100,e)];
assert(diagnostic(words,image)); // Deliberately identical synthetic glyphs.
assert(!diagnostic([...words,word('Interface',0,150)],image));
assert(!diagnostic([...words,word('etherl',100,150,e)],image));
assert(!diagnostic(words,null));
assert(!diagnostic(words,{...image,data:Buffer.alloc(1)}));
const changed=structuredClone(words);changed[3].symbols[5].bbox.x1+=50;assert(!diagnostic(changed,image));
const outside=structuredClone(words);outside[2].symbols[0].bbox.x0=-1;assert(!diagnostic(outside,image));
const poor=structuredClone(words);poor[3].symbols[5].confidence=20;assert(!diagnostic(poor,image));
const mismatch=structuredClone(words);mismatch[3].text='ether1';assert(!diagnostic(mismatch,image));
const noisy=Buffer.from(image.data);for(let y=100;y<108;y++)for(let x=140;x<144;x++)for(let c=0;c<3;c++)noisy[(y*500+x)*4+c]=0;assert(!diagnostic(words,{...image,data:noisy}));
console.log('CI glyph diagnostic: synthetic rejection cases passed; not an authenticity test.');
