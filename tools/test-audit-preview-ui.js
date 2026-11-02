#!/usr/bin/env node
'use strict';
const assert=require('assert'),{JSDOM}=require('jsdom'),{createAuditUI}=require('../app/js/physical-audit');
(async()=>{
 const dom=new JSDOM('<main></main>'),container=dom.window.document.querySelector('main');let calls=0,clears=0,mappings=[];
 const bridge={auditIp:async()=>({ok:true,report:{sections:[],warning:'неполный'},portSources:['physical-1','physical-2']}),auditClear:async()=>{clears++;},auditPreview:async m=>{calls++;mappings.push(m);return {ok:true,plan:{items:[{kind:'bridge'},{kind:'port',target:'ether2'},{kind:'ipv4',address:'192.0.2.1/24'}],skipped:['<img src=x onerror=alert(1)>'],limitations:['Не переносится']}};}};
 const ui=createAuditUI(container,bridge);container.querySelector('form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await new Promise(r=>setImmediate(r));
 const getButton=()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Проверить предварительный план');let button=getButton();assert(button);const selects=container.querySelectorAll('select');assert.equal(selects.length,2);button.click();assert.equal(calls,0);assert(container.textContent.includes('Выберите виртуальный порт'));
 selects[0].value=selects[1].value='ether2';button.click();assert.equal(calls,0);assert(container.textContent.includes('отдельный виртуальный порт'));
 selects[1].value='ether3';button.click();await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.deepStrictEqual(mappings[0],[{source:'physical-1',target:'ether2'},{source:'physical-2',target:'ether3'}]);assert(container.textContent.includes('192.0.2.1/24'));assert(container.textContent.includes('<img src=x'));assert(!container.querySelector('img'));
 selects[1].value='ether4';selects[1].dispatchEvent(new dom.window.Event('change'));assert(!container.textContent.includes('192.0.2.1/24'));
 let resolveOld;bridge.auditPreview=()=>new Promise(r=>{resolveOld=r;});button.click();await new Promise(r=>setImmediate(r));selects[1].value='ether5';selects[1].dispatchEvent(new dom.window.Event('change'));resolveOld({ok:true,plan:{items:[{kind:'ipv4',address:'OLD-PLAN'}],skipped:[],limitations:[]}});await new Promise(r=>setImmediate(r));assert(!container.textContent.includes('OLD-PLAN'));assert(!button.disabled);
 ui.dispose();await new Promise(r=>setImmediate(r));assert.equal(clears,1);assert.equal(container.textContent,'');dom.window.close();
 console.log('Audit preview UI: manual unique mappings, explicit limitations, text-only output and disposal; mocked bridge only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
