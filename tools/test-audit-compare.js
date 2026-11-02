#!/usr/bin/env node
'use strict';
const assert=require('assert'),{compare}=require('../windows/audit/compare');
const plan={complete:false,executable:false,items:[{kind:'bridge',name:'audit-lan',protocol:'rstp',vlanFiltering:false},{kind:'port',target:'ether2',bridge:'audit-lan'},{kind:'ipv4',address:'192.168.55.1/24',interface:'audit-lan'}]};
const section=(id,rows)=>({id,status:'ok',rows});
function actual(){return {sections:[section('bridge',[{name:'audit-lan',disabled:'false','protocol-mode':'rstp','vlan-filtering':'false'}]),section('bridge-ports',[{bridge:'audit-lan',interface:'ether2',disabled:'false',pvid:'1','ingress-filtering':'false','frame-types':'admit-all'}]),section('addresses',[{interface:'audit-lan',address:'192.168.55.1/24',disabled:'false',dynamic:'false'}]),section('bridge-vlans',[])]};}
let output=compare(plan,actual());assert(output.checks.every(x=>x.status==='match'));assert(output.differences.every(x=>x.status==='none-observed'));assert.equal(output.complete,false);
let x=actual();delete x.sections[0].rows[0].disabled;assert.equal(compare(plan,x).checks[0].status,'unknown');
x=actual();x.sections[1].rows[0].disabled='true';assert.equal(compare(plan,x).checks[1].status,'different');
x=actual();x.sections[2].rows.push({interface:'ether1',address:'10.0.2.15/24'});assert.equal(compare(plan,x).differences.find(y=>y.id==='addresses').status,'additional');
x=actual();x.sections[3].status='forbidden';assert.equal(compare(plan,x).differences.find(y=>y.id==='bridge-vlans').status,'unknown');
x=actual();x.sections[1].rows.push({...x.sections[1].rows[0]});assert.equal(compare(plan,x).checks[1].status,'different');
assert.throws(()=>compare({...plan,items:[...plan.items,{kind:'command',value:'/system/reset'}]},actual()));assert.throws(()=>compare({...plan,items:[...plan.items,{kind:'port',target:'ether2',bridge:'audit-lan'}]},actual()));assert.throws(()=>compare(plan,{sections:[...actual().sections,actual().sections[0]]}));
console.log('Audit comparison research: exact selected fields, missing values, extra entries and duplicate data; no VM launched.');
