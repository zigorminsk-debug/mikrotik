#!/usr/bin/env node
'use strict';
const assert = require('assert');
const path = require('path');
const {JSDOM,VirtualConsole} = require('jsdom');
(async function () {
 const errors=[]; const vc=new VirtualConsole(); vc.on('jsdomError', e=>errors.push(e.message));
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.LAB_INSTANT=true;}});
 const w=dom.window; await new Promise(resolve=>w.addEventListener('load',resolve));
 const d=w.document, $=id=>d.getElementById(id);
 w.location.hash='lab'; await new Promise(resolve=>setTimeout(resolve,20));
 assert(!$('lab-view').hidden); assert($('stand-view').hidden);
 $('lab_example').click(); assert.equal(w.Lab.state.devices.length,5); assert.equal(w.Lab.state.links.length,4);
 $('lab_run').click(); assert(!$('lab-results').hidden); assert($('lab-results').textContent.includes('Проверка учебной модели пройдена')); assert(d.querySelector('#lab-results .copy-btn')); assert($('lab-results').textContent.includes('реальные пакеты не отправлялись'));
 const pc=w.Lab.state.devices.find(x=>x.type==='pc'); w.Lab.select(pc.id); $('insp_cfg').click(); assert(!$('lab-modal').hidden); $('lm_mode').value='static'; $('lm_mode').dispatchEvent(new w.Event('change')); $('lm_ip2').value='192.168.88.120/24'; $('lm_gw2').value='192.168.88.1'; $('lm_save').click(); assert($('lab-modal').hidden); assert($('lab-results').hidden);
 $('lab_run').click(); assert($('lab-results').textContent.includes('пул'));
 w.Lab.select(pc.id); $('insp_del').click(); assert.equal(w.Lab.state.devices.length,4); assert.equal(w.Lab.state.links.length,3);
 $('lab_reset').click(); assert.equal(w.Lab.state.devices.length,0); assert.equal(w.Lab.state.links.length,0);
 d.querySelector('[data-dev=router]').click(); $('lab-canvas').dispatchEvent(new w.MouseEvent('click',{bubbles:true,clientX:50,clientY:50})); assert.equal(w.Lab.state.devices.length,1);
 $('lab_run').click(); assert($('lab-results').textContent.includes('провайдера'));
 assert.deepStrictEqual(errors,[]); dom.window.close(); console.log('Лаборатория: DOM-взаимодействия прошли.');
})().catch(e=>{console.error(e);process.exitCode=1;});
