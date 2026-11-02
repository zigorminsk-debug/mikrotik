#!/usr/bin/env node
'use strict';
const assert=require('assert'),path=require('path'),{JSDOM,VirtualConsole}=require('jsdom');
(async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};}});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));
 const targets={
  'ros-ip':['Практика: DHCP-сервер для одной LAN','Практика: закрепить адрес для DHCP-клиента','Практика: DHCP-клиент на WAN','Практика: DNS для локальной сети'],
  'ros-system':['Практика: учебный центр и сертификат сервера','Практика: сертификат клиента и безопасная передача'],
  'ros-ppp':['Практика: OpenVPN-сервер для одного клиента','Практика: OpenVPN-клиент, маршрут и проверка'],
  'ros-wifi':['Практика: отдельная тестовая точка Wi-Fi'],
  'ros-files':['Практика: резервная копия и безопасное хранение'],
  'ros-tools':['Практика: проверка связи через Ping']
 };
 for(const [id,titles] of Object.entries(targets)){
  const sec=w.GUIDE.sections.find(s=>s.id===id&&!s.hiddenNav);assert(sec,id);
  for(const title of titles){const step=sec.steps.find(x=>x.t===title);assert(step,title);const ol=step.b.find(x=>x.k==='ol');assert(ol&&ol.items.length>=4,title);assert(step.b.some(x=>x.k==='note'&&x.t.includes('снимки каждого действия')),title);assert(!step.b.some(x=>x.k==='cmd'),title+' must not contain executable commands');}
  w.location.hash=id;await new Promise(r=>setTimeout(r,15));const text=w.document.querySelector('main').textContent;for(const title of titles)assert(text.includes(title),id+' missing rendered '+title);assert(w.document.querySelector('.guide-lab'),id+' missing lab action');
 }
 const all=w.GUIDE.sections.find(s=>s.id==='ros-ppp').steps.filter(s=>s.t.includes('OpenVPN')).map(s=>JSON.stringify(s)).join(' ');
 for(const token of ['Require Client Certificate','verify-x509-name','сертификат','парол','маршрут','firewall','не проверены'])assert(all.toLowerCase().includes(token.toLowerCase()),token);
 w.location.hash='ros-ppp';await new Promise(r=>setTimeout(r,15));const lab=w.document.querySelector('.guide-lab');lab.querySelector('button').click();assert(lab.querySelector('input[value="vpn"]').disabled);assert(lab.querySelector('.guide-lab-start').disabled);
 assert(!errors.length,errors.join('; '));dom.window.close();console.log('Практические инструкции: меню, 11 пошаговых сценариев, явные пропуски снимков, блокировка VPN и отсутствие исполняемых команд.');
})().catch(e=>{console.error(e);process.exitCode=1;});
