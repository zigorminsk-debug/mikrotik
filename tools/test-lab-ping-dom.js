#!/usr/bin/env node
'use strict';
const assert=require('assert'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
(async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));let calls=[],clientCalls=[],clientLaunches=[],closedHandler;
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;w.routerOS={onClosed:fn=>{closedHandler=fn;},launch:async()=>({ok:true}),launchClients:async(...args)=>{clientLaunches.push(args);const client=args[1].devices.find(d=>d.type==='pc');return {ok:true,clients:[{id:client.id,address:'192.168.88.10',type:'pc',mode:'static'}]};},pingClient:async(...args)=>{clientCalls.push(args);return {ok:true,sent:3,received:3,address:args[3]};},ping:async(...args)=>{calls.push(args);return {ok:true,sent:3,received:0};}};}});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));w.location.hash='lab';await new Promise(r=>setTimeout(r,20));const doc=w.document,$=id=>doc.getElementById(id);
 $('lab_example_chr_isolated').click();w.Lab.run({instant:true});assert(!$('lab-results').hidden);
 assert($('lab-results').textContent.includes('Linux VM'));assert($('lab-results').textContent.includes('VPN пока не запускаются'));
 assert(doc.querySelector('.lab-ping-availability').textContent.includes('на Android реальный ping'));assert($('lab-ping-preset'));const options=[...$('lab-ping-preset').options];assert(options.some(o=>o.textContent.includes('адрес CHR')));$('lab-ping-preset').value=options.find(o=>o.textContent.includes('адрес CHR')).value;$('lab-ping-preset').dispatchEvent(new w.Event('change'));assert.equal($('lab-ping-target').value,$('lab-ping-preset').value);
 assert($('lab-ping-run')&&!$('lab-ping-run').disabled);$('lab-ping-target').value='invalid;bad';$('lab-ping-run').click();assert.equal(calls.length,0);assert($('lab-ping-result').textContent.includes('IPv4'));
 $('lab-ping-target').value='192.168.88.1';$('lab-ping-run').click();await new Promise(r=>setTimeout(r,30));assert.equal(calls.length,1);assert.equal(calls[0][2],'192.168.88.1');assert($('lab-ping-result').textContent.includes('получено 0'));assert($('lab-ping-result').textContent.includes('не запущены'));
 $('lab-ping-target').value='lab.example';$('lab-ping-run').click();await new Promise(r=>setTimeout(r,30));assert.equal(calls.at(-1)[2],'lab.example');
 w.routerOS.ping=async()=>({ok:true,sent:3,received:3,address:'192.168.88.20'});$('lab-ping-run').click();await new Promise(r=>setTimeout(r,30));assert($('lab-ping-result').textContent.includes('получены ответы'.toLowerCase())||$('lab-ping-result').textContent.includes('Получены ответы'));
 w.routerOS.ping=async()=>({ok:false,cancelled:true});$('lab-ping-run').click();await new Promise(r=>setTimeout(r,30));assert($('lab-ping-result').textContent.includes('отменена'));
 w.routerOS.ping=async()=>({ok:true,sent:300,received:300});$('lab-ping-run').click();await new Promise(r=>setTimeout(r,30));assert($('lab-ping-result').textContent.includes('неизвестен'));
 const launchClients=doc.querySelector('.lab-checked-launch[data-clients="true"]');assert(launchClients);launchClients.click();await new Promise(r=>setTimeout(r,30));assert.equal(clientLaunches.length,1);assert($('lab-ping-result').textContent.includes('Выберите запущенную VM'));
 const client=w.Lab.state.devices.find(d=>d.type==='pc'),source=$('lab-ping-source');source.value=client.id;assert(source.selectedOptions[0].textContent.includes('Linux VM'));assert([...$('lab-ping-preset').options].some(o=>o.value==='192.168.88.10'&&o.textContent.includes('при запуске')));
 $('lab-ping-target').value='example.com';$('lab-ping-run').click();await new Promise(r=>setTimeout(r,30));assert.equal(clientCalls.length,1);assert.equal(clientCalls[0][3],'example.com');
 $('lab-ping-target').value='192.168.88.1';$('lab-ping-run').click();await new Promise(r=>setTimeout(r,30));assert.equal(clientCalls.length,2);assert.equal(clientCalls[1][1],client.id);assert.equal(clientCalls[1][3],'192.168.88.1');assert($('lab-ping-result').textContent.includes('Виртуальный Linux-клиент'));
 w.Lab.run({instant:true});assert([...$('lab-ping-source').options].some(o=>o.dataset.kind==='client'),'client source should survive rechecking the unchanged scheme');
 assert(closedHandler);closedHandler();assert(![...$('lab-ping-source').options].some(o=>o.dataset.kind==='client'));assert($('lab-ping-result').textContent.includes('Лаборатория закрыта'));
 assert(!errors.length,errors.join('; '));dom.window.close();console.log('Ping UI: CHR, виртуальные Linux-клиенты, источники, адреса и честные результаты проверены на моках.');
})().catch(e=>{console.error(e);process.exitCode=1;});
