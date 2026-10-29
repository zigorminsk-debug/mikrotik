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
 $('lab_run').click(); assert(!$('lab-results').hidden); assert($('lab-results').textContent.includes('Проверка учебной модели пройдена')); assert(d.querySelector('#lab-results .copy-btn')); assert($('lab-results').textContent.includes('реальные пакеты не отправлялись')); assert($('lab-winbox')); assert($('lab-winbox').textContent.includes('Подготовка')); assert($('lab-winbox').querySelector('img[src*=winbox-login]')); assert($('lab-winbox').textContent.includes('192.168.88.1/24'));
 // Изображение в учебнике: на узком и широком экране режим «Целиком»
 // ограничивает и ширину, и высоту; увеличение и возврат работают офлайн.
 const stage=$('shot-stage'), full=$('shot-full');
 Object.defineProperty(stage,'clientWidth',{configurable:true,value:320});
 Object.defineProperty(stage,'clientHeight',{configurable:true,value:240});
 Object.defineProperty(full,'naturalWidth',{configurable:true,value:1239});
 Object.defineProperty(full,'naturalHeight',{configurable:true,value:634});
 const shot=d.querySelector('#lab-winbox .shot-zoom'); assert(shot); shot.click(); assert(!$('shot-viewer').hidden); assert(full.getAttribute('src'));
 let width=parseFloat(full.style.width); assert(width<=296 && width*634/1239<=216.1);
 $('shot-in').click(); assert(parseFloat(full.style.width)>width); $('shot-fit').click(); assert.equal(parseFloat(full.style.width),width);
 $('shot-close').click(); assert($('shot-viewer').hidden); assert(!full.getAttribute('src'));
 Object.defineProperty(stage,'clientWidth',{configurable:true,value:1200});
 Object.defineProperty(stage,'clientHeight',{configurable:true,value:700});
 shot.click(); width=parseFloat(full.style.width); assert(width<=1176 && width*634/1239<=676.1);
 d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})); assert($('shot-viewer').hidden);
 const pc=w.Lab.state.devices.find(x=>x.type==='pc'); w.Lab.select(pc.id); $('insp_cfg').click(); assert(!$('lab-modal').hidden); $('lm_mode').value='static'; $('lm_mode').dispatchEvent(new w.Event('change')); $('lm_ip2').value='192.168.88.120/24'; $('lm_gw2').value='192.168.88.1'; $('lm_save').click(); assert($('lab-modal').hidden); assert($('lab-results').hidden);
 $('lab_run').click(); assert($('lab-results').textContent.includes('пул'));
 w.Lab.select(pc.id); $('insp_del').click(); assert(!$('lab-confirm').hidden); $('lab-confirm-ok').click(); assert.equal(w.Lab.state.devices.length,4); assert.equal(w.Lab.state.links.length,3);
 $('lab_reset').click(); assert.equal(w.Lab.state.devices.length,0); assert.equal(w.Lab.state.links.length,0);
 d.querySelector('[data-dev=router]').click(); $('lab-canvas').dispatchEvent(new w.MouseEvent('click',{bubbles:true,clientX:50,clientY:50})); assert.equal(w.Lab.state.devices.length,1);
 $('lab_run').click(); assert($('lab-results').textContent.includes('провайдеров'));

 // Схема из обращения: по два устройства каждого типа и два канала.
 $('lab_reset').click();
 const rt=w.Lab.place('router',200,100), isp1=w.Lab.place('isp',10,10), isp2=w.Lab.place('isp',300,10), sw=w.Lab.place('switch',200,220);
 const clients=['pc','pc','server','server','printer','printer'].map((type,i)=>w.Lab.place(type,30+i*90,340));
 w.Lab.link(rt,isp1);w.Lab.link(rt,isp2);w.Lab.link(rt,sw);clients.forEach(id=>w.Lab.link(sw,id));
 const ips=clients.map(id=>w.Lab.state.devices.find(x=>x.id===id).cfg.ip);
 assert.equal(new Set(ips).size,6); assert(ips.every(ip=>!ip.includes('.100/')));
 // Настройки открываются через шестерёнку даже в режиме создания линии.
 w.Lab.setMode('link'); d.querySelector('[data-id="'+isp2+'"] .lab-gear').click();
 assert(!$('lab-modal').hidden); assert($('lm_kind')); assert($('lm_priority')); $('lm_kind').value='static'; $('lm_kind').dispatchEvent(new w.Event('change')); assert(!$('lm_g_static').hidden);
 $('lm_ip').value='203.0.113.2/30';$('lm_gw2').value='203.0.113.1';$('lm_dns').value='1.1.1.1';$('lm_save').click();
 assert.equal(w.Lab.state.devices.find(x=>x.id===isp2).cfg.kind,'static');
 d.querySelector('[data-id="'+rt+'"] .lab-gear').click(); assert($('lm_lan') && $('lm_gw') && $('lm_dhcp') && $('lm_nat') && $('lm_fw') && $('lm_vpn')); $('lm_save').click();
 d.querySelector('[data-id="'+clients[0]+'"] .lab-gear').click(); assert($('lm_mode') && $('lm_ip2') && $('lm_ep_dns')); $('lm_save').click();
 $('lab_run').click(); assert($('lab-results').textContent.includes('Проверка учебной модели пройдена')); assert($('lab-results').textContent.includes('резервный')); assert($('lab-log-lines').textContent.includes('условно'));
 // Переключение основного и резервного через форму провайдера.
 d.querySelector('[data-id="'+isp2+'"] .lab-gear').click(); $('lm_priority').value='primary';$('lm_save').click();
 assert.equal(w.Lab.state.devices.find(x=>x.id===isp1).cfg.priority,'backup');assert.equal(w.Lab.state.devices.find(x=>x.id===isp2).cfg.priority,'primary');
 w.Lab.setMode('select'); d.querySelector('[data-id="'+clients[1]+'"] .lab-ico').click(); assert(!$('lab-modal').hidden); $('lm_cancel').click();

 // Кнопка удаления в окне устройства: отмена сохраняет, подтверждение убирает линии.
 d.querySelector('[data-id="'+clients[1]+'"] .lab-gear').click(); $('lm_delete').click(); assert(!$('lab-confirm').hidden); $('lab-confirm-cancel').click(); assert(!$('lab-modal').hidden); assert(w.Lab.state.devices.some(x=>x.id===clients[1]));
 $('lm_delete').click(); $('lab-confirm-ok').click(); assert($('lab-modal').hidden); assert(!w.Lab.state.devices.some(x=>x.id===clients[1])); assert(!w.Lab.state.links.some(x=>x.a===clients[1]||x.b===clients[1])); assert($('lab-results').hidden);
 // Режим удаления: нажатие на линию предлагает подтверждение, отмена и удаление.
 w.Lab.setMode('delete'); const linkCount=w.Lab.state.links.length; d.querySelector('.lab-link-hit').dispatchEvent(new w.MouseEvent('click',{bubbles:true})); assert(!$('lab-confirm').hidden); $('lab-confirm-cancel').click(); assert.equal(w.Lab.state.links.length,linkCount);
 d.querySelector('.lab-link-hit').dispatchEvent(new w.MouseEvent('click',{bubbles:true})); $('lab-confirm-ok').click(); assert.equal(w.Lab.state.links.length,linkCount-1);
 const n=w.Lab.state.devices.length; d.querySelector('[data-id="'+clients[0]+'"] .lab-ico').click(); assert(!$('lab-confirm').hidden); $('lab-confirm-ok').click(); assert.equal(w.Lab.state.devices.length,n-1);
 // Обычный раздел учебника использует тот же просмотр, не только лаборатория.
 w.location.hash='firewall'; await new Promise(resolve=>setTimeout(resolve,20));
 const guideImg=d.querySelector('#content figure.shot img'); assert(guideImg && guideImg.getAttribute('src').includes('official/'));
 guideImg.click(); assert(!$('shot-viewer').hidden); $('shot-close').click();
 assert.deepStrictEqual(errors,[]); dom.window.close(); console.log('Лаборатория: DOM-взаимодействия прошли.');
})().catch(e=>{console.error(e);process.exitCode=1;});
