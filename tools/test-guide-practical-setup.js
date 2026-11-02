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
 const cert=w.GUIDE.sections.find(s=>s.id==='ros-system').steps.find(x=>x.t.includes('учебный центр'));
 const caActions=cert.b.find(b=>b.k==='ol').items;
 assert(caActions.length>=12,'CA/server procedure must enumerate individual steps');
 for(const name of ['guide-cert-menu-arrow.png','guide-cert-new-arrow.png','guide-cert-fields-arrow.png','guide-cert-usage-arrow.png'])assert(caActions.some(x=>x.shot&&x.shot.src.endsWith(name)),name);
 for(const value of ['lab-ca','lab-server','Key Usage','crl sign','key cert. sign','Common Name','Subject Alt. Name','Days Valid','Export Passphrase'])assert(JSON.stringify(cert).includes(value),value);
 const dhcp=w.GUIDE.sections.find(s=>s.id==='ros-ip').steps.find(x=>x.t.includes('DHCP-сервер для одной LAN'));
 for(const value of ['Bridge → Bridge → New','Bridge → Ports → New','IP → Addresses → New','DHCP Setup','192.168.88.100-192.168.88.199','ipconfig /all'])assert(JSON.stringify(dhcp).includes(value),value);
 const client=w.GUIDE.sections.find(s=>s.id==='ros-ppp').steps.find(x=>x.t.includes('OpenVPN-клиент, маршрут'));
 const profile=client.b.find(b=>b.k==='raw'&&b.t.includes('data-ciphers'));
 assert(profile,'OpenVPN client profile is missing');
 for(const value of ['proto tcp-client','remote-cert-tls server','verify-x509-name vpn.example.org name','auth SHA256','data-ciphers AES-256-CBC','auth-user-pass','route 192.168.88.0 255.255.255.0','cert_export_lab-client-1.key'])assert(profile.t.includes(value),value);
 assert(!profile.t.includes('<key>')&&!profile.t.includes('password '),'do not embed secrets');
 const all=w.GUIDE.sections.find(s=>s.id==='ros-ppp').steps.filter(s=>s.t.includes('OpenVPN')).map(s=>JSON.stringify(s)).join(' ');
 for(const token of ['Require Client Certificate','verify-x509-name','сертификат','парол','маршрут','firewall','ещё требуют сквозной проверки'])assert(all.toLowerCase().includes(token.toLowerCase()),token);
 w.location.hash='ros-ppp';await new Promise(r=>setTimeout(r,15));const lab=w.document.querySelector('.guide-lab');lab.querySelector('button').click();assert(lab.querySelector('input[value="vpn"]').disabled);assert(lab.querySelector('.guide-lab-start').disabled);
 assert(!errors.length,errors.join('; '));dom.window.close();console.log('Практические инструкции: меню, 11 пошаговых сценариев, явные пропуски снимков, блокировка VPN и отсутствие исполняемых команд.');
})().catch(e=>{console.error(e);process.exitCode=1;});
