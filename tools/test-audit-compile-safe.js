#!/usr/bin/env node
'use strict';
const assert=require('assert'),{compile}=require('../windows/audit/compile-safe'),{fixture}=require('./audit-safe-fixture');
function build(){const {snapshot,mapping}=fixture();return compile(snapshot,mapping);}
const result=build();assert(result.ok);assert.equal(result.commands.length,4);assert.equal(result.checks.length,4);assert.equal(result.preview.complete,false);assert.equal(result.preview.executable,false);assert(result.skipped.length&&result.limitations.length);
assert(result.commands.every(c=>c.startsWith('/')));assert(!result.commands.join('\n').includes('physical-'));assert(!result.commands.join('\n').match(/(?:script|scheduler|fetch|execute|system\/reset)/i));assert(result.checks.every(c=>c.query.startsWith(':if ')));
const attacks=[
 x=>{x.snapshot.sections[4].rows[0].address='192.0.2.1/24; /system reset-configuration';},
 x=>{x.snapshot.sections[1].rows[0].name='bridge"; /system reset-configuration';},
 x=>{x.mapping[0].target='ether2;:execute';},
 x=>{x.mapping[1].target='ether2';},
 x=>{x.mapping[0].target='ether6';},
 x=>{x.snapshot.sections[2].rows[0].interface='ether2;:execute';},
 x=>{x.snapshot.sections[1].rows[0]['vlan-filtering']='true';},
 x=>{x.snapshot.sections[4].rows[0].dynamic='true';},
 x=>{delete x.snapshot.sections[4].rows[0].disabled;},
 x=>{x.snapshot.sections[3].rows.push({bridge:'bridge-physical'});},
 x=>{x.snapshot.sections[0].status='forbidden';}
];
for(const attack of attacks){const x=fixture();attack(x);const r=compile(x.snapshot,x.mapping);assert.equal(r.ok,false);assert.deepStrictEqual(r.commands,[]);assert.deepStrictEqual(r.checks,[]);assert(r.skipped.length);}
const deterministic=build();assert.deepStrictEqual(result.commands,deterministic.commands);assert.deepStrictEqual(result.checks,deterministic.checks);
console.log('Audit safe compiler: only fixed bridge/port/IPv4 templates, explicit mapping and fail-closed adversarial cases; no VM run or production router.');
