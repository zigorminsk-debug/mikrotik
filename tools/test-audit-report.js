#!/usr/bin/env node
'use strict';
const assert=require('assert'),{TOPICS}=require('../windows/audit/rest-readonly'),{TOPIC_DETAILS,FIELDS,describe}=require('../windows/audit/report');
for(const t of TOPICS){assert(TOPIC_DETAILS[t.id]&&TOPIC_DETAILS[t.id].every(Boolean));for(const key of t.fields)assert(FIELDS[key]&&FIELDS[key].every(Boolean),t.id+':'+key);}
const report=describe({sections:[{id:'interfaces',status:'ok',rows:[{name:'<b>ether1</b>',type:'ether'}]},{id:'filter',status:'forbidden'}]});
assert.equal(report.complete,false);assert.equal(report.sections.length,TOPICS.length);
const iface=report.sections.find(x=>x.id==='interfaces').rows[0];assert.equal(iface.find(x=>x.key==='name').value,'<b>ether1</b>');assert.equal(iface.find(x=>x.key==='disabled').present,false);assert.equal(iface.find(x=>x.key==='disabled').value,null);
assert.equal(report.sections.find(x=>x.id==='filter').status,'forbidden');assert.equal(report.sections.find(x=>x.id==='nat').status,'not-read');
assert.throws(()=>describe({sections:[{id:'interfaces',status:'ok',rows:[{name:{x:1}}]}]}));assert.throws(()=>describe({sections:[{id:'unknown',status:'ok',rows:[]}]}));assert.throws(()=>describe({sections:[{id:'filter'},{id:'filter'}]}));
console.log('Audit report research: selected fields explained, missing data remains unknown; text only, no UI or full audit.');
