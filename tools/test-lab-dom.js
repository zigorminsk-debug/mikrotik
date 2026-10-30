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
 $('lab_run').click(); assert(!$('lab-results').hidden); assert($('lab-results').textContent.includes('Проверка учебной модели пройдена')); assert(d.querySelector('#lab-results .copy-btn')); assert($('lab-results').textContent.includes('реальные пакеты не отправлялись')); assert($('lab-winbox')); assert($('lab-winbox').textContent.includes('Подготовка')); assert($('lab-winbox').querySelector('img[src*=winbox-login]')); assert($('lab-winbox').textContent.includes('192.168.88.1/24'));const ppStep=Array.from(d.querySelectorAll('#lab-winbox .lab-winbox-step')).find(el=>el.querySelector('img[src$="pppoe-dial.png"]'));assert(ppStep);const ppItems=ppStep.querySelectorAll('ol > li');assert(ppItems[0].querySelector('img[src$="pppoe-general.png"]'));assert(ppItems[1].querySelector('img[src$="pppoe-dial.png"]'));assert(ppItems[2].textContent.includes('отдельный скриншот пока не добавлен'));assert(ppItems[ppItems.length-1].querySelector('img[src$="interface-list-member.png"]'));
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
 d.querySelector('[data-id="'+rt+'"] .lab-gear').click(); assert($('lm_lan') && $('lm_gw') && $('lm_dhcp') && $('lm_nat') && $('lm_fw') && $('lm_vpn') && $('lm_wan_failover')); assert($('lm_open_chr')); $('lm_open_chr').click(); assert(!$('lm_err').hidden && $('lm_err').textContent.includes('Windows')); $('lm_wan_failover').checked=true;
 let launched=null; w.routerOS={launch:(id,state)=>{launched={id,state};return Promise.resolve({ok:true});}};
 $('lm_open_chr').click(); await Promise.resolve(); assert($('lab-modal').hidden); assert(launched && launched.id===rt); assert(launched.state.devices.find(x=>x.id===rt).cfg.wanFailover); delete w.routerOS;
 d.querySelector('[data-id="'+clients[0]+'"] .lab-gear').click(); assert($('lm_mode') && $('lm_ip2') && $('lm_ep_dns')); $('lm_save').click();
 $('lab_run').click(); assert($('lab-results').textContent.includes('Проверка учебной модели пройдена')); assert($('lab-results').textContent.includes('резервный')); assert($('lab-log-lines').textContent.includes('условно')); assert(d.querySelectorAll('.lab-flow-out').length); assert(d.querySelectorAll('.lab-flow-back').length);
 // Отключение и возврат провайдера сразу меняют подсвеченный путь.
 d.querySelector('[data-id="'+isp1+'"] .lab-power').click(); assert($('lab-flow-status').textContent.includes(w.Lab.state.devices.find(x=>x.id===isp2).name));
 d.querySelector('[data-id="'+isp1+'"] .lab-power').click(); assert($('lab-flow-status').textContent.includes(w.Lab.state.devices.find(x=>x.id===isp1).name));
 // Переключение основного и резервного через форму провайдера.
 d.querySelector('[data-id="'+isp2+'"] .lab-gear').click(); $('lm_priority').value='primary';$('lm_save').click();
 assert.equal(w.Lab.state.devices.find(x=>x.id===isp1).cfg.priority,'backup');assert.equal(w.Lab.state.devices.find(x=>x.id===isp2).cfg.priority,'primary');
 w.Lab.setMode('select'); d.querySelector('[data-id="'+clients[1]+'"] .lab-ico').click(); assert(!$('lab-modal').hidden); $('lm_cancel').click();

 // Доступ извне редактируется прямо в окне MikroTik и сохраняется в сервере.
 d.querySelector('[data-id="'+rt+'"] .lab-gear').click();
 assert(d.getElementById('lm_pub_2_on')); $('lm_pub_2_on').checked=true; $('lm_pub_2_on').dispatchEvent(new w.Event('change')); assert(!$('lm_pub_2_box').hidden);
 $('lm_pub_2_external').value='8443'; $('lm_pub_2_local').value='443'; $('lm_pub_2_proto').value='tcp'; $('lm_pub_2_count').value='2'; $('lm_pub_2_count').dispatchEvent(new w.Event('change')); assert(!$('lm_pub_2_extra_1_box').hidden); $('lm_pub_2_extra_1_proto').value='udp'; $('lm_pub_2_extra_1_external').value='5353'; $('lm_pub_2_extra_1_local').value='53'; $('lm_save').click();
 assert($('lab-modal').hidden); assert.equal(w.Lab.state.devices.find(x=>x.id===clients[2]).cfg.extPort,'8443');
 d.querySelector('[data-id="'+clients[2]+'"] .lab-gear').click(); assert($('lm_external').checked); assert.equal($('lm_ext_port').value,'8443'); assert.equal($('lm_local_port').value,'443'); assert.equal($('lm_ext_count').value,'2'); assert.equal($('lm_ext_extra_1_external').value,'5353'); $('lm_cancel').click();
 d.querySelector('[data-id="'+rt+'"] .lab-gear').click(); $('lm_pub_2_external').value='99999'; $('lm_save').click(); assert(!$('lm_err').hidden); assert.equal(w.Lab.state.devices.find(x=>x.id===clients[2]).cfg.extPort,'8443'); $('lm_cancel').click();
 // Включение VPN и публикация сервера с сохранением портов.
 d.querySelector('[data-id="'+rt+'"] .lab-gear').click(); $('lm_vpn').checked=true; $('lm_vpn').dispatchEvent(new w.Event('change')); assert(!$('lm_vpn_box').hidden); $('lm_vpn_type').value='l2tp-ipsec'; $('lm_vpn_type').dispatchEvent(new w.Event('change')); assert(!$('lm_vpn_l2tp').hidden && $('lm_vpn_wg').hidden); $('lm_vpn_user').value='vpnuser'; $('lm_vpn_pass').value='password123'; $('lm_vpn_psk').value='longsecret'; $('lm_save').click();
 d.querySelector('[data-id="'+clients[2]+'"] .lab-gear').click(); $('lm_external').checked=true; $('lm_external').dispatchEvent(new w.Event('change')); $('lm_ext_count').value='2'; $('lm_ext_count').dispatchEvent(new w.Event('change')); $('lm_ext_port').value='8443'; $('lm_local_port').value='443'; $('lm_save').click();
 $('lab_run').click(); assert($('lab-results').textContent.includes('use-ipsec=required')); assert($('lab-results').textContent.includes('dst-port=8443'));
 // Кнопка удаления в окне устройства: отмена сохраняет, подтверждение убирает линии.
 d.querySelector('[data-id="'+clients[1]+'"] .lab-gear').click(); $('lm_delete').click(); assert(!$('lab-confirm').hidden); $('lab-confirm-cancel').click(); assert(!$('lab-modal').hidden); assert(w.Lab.state.devices.some(x=>x.id===clients[1]));
 $('lm_delete').click(); $('lab-confirm-ok').click(); assert($('lab-modal').hidden); assert(!w.Lab.state.devices.some(x=>x.id===clients[1])); assert(!w.Lab.state.links.some(x=>x.a===clients[1]||x.b===clients[1])); assert($('lab-results').hidden);
 // Режим удаления: нажатие на линию предлагает подтверждение, отмена и удаление.
 w.Lab.setMode('delete'); const linkCount=w.Lab.state.links.length; d.querySelector('.lab-link-hit').dispatchEvent(new w.MouseEvent('click',{bubbles:true})); assert(!$('lab-confirm').hidden); $('lab-confirm-cancel').click(); assert.equal(w.Lab.state.links.length,linkCount);
 d.querySelector('.lab-link-hit').dispatchEvent(new w.MouseEvent('click',{bubbles:true})); $('lab-confirm-ok').click(); assert.equal(w.Lab.state.links.length,linkCount-1);
 const n=w.Lab.state.devices.length; d.querySelector('[data-id="'+clients[0]+'"] .lab-ico').click(); assert(!$('lab-confirm').hidden); $('lab-confirm-ok').click(); assert.equal(w.Lab.state.devices.length,n-1);
 // Встроенный пример с резервом сразу проходит проверку модели.
 $('lab_example_backup').click(); assert.equal(w.Lab.state.devices.filter(x=>x.type==='router').length,2); $('lab_run').click(); assert($('lab-results').textContent.includes('Проверка учебной модели пройдена'));
 // Два роутера: переключение на резерв при OFF и возврат на основной.
 $('lab_reset').click(); const main=w.Lab.place('router',100,100), back=w.Lab.place('router',300,100), a=w.Lab.place('isp',40,20), b=w.Lab.place('isp',360,20), common=w.Lab.place('switch',200,230), host=w.Lab.place('pc',200,360);
 w.Lab.link(main,a); w.Lab.link(back,b); w.Lab.link(main,common); w.Lab.link(back,common); w.Lab.link(common,host);
 $('lab_run').click(); assert($('lab-results').textContent.includes('план')); assert($('lab-flow-status').textContent.includes(w.Lab.state.devices.find(x=>x.id===main).name));
 d.querySelector('[data-id="'+main+'"] .lab-power').click(); assert($('lab-flow-status').textContent.includes(w.Lab.state.devices.find(x=>x.id===back).name));
 d.querySelector('[data-id="'+main+'"] .lab-power').click(); assert($('lab-flow-status').textContent.includes(w.Lab.state.devices.find(x=>x.id===main).name));
 // При включённом резервном интернете в двухроутерной схеме WAN тоже переключает путь.
 d.querySelector('[data-id="'+main+'"] .lab-gear').click(); $('lm_wan_failover').checked=true; $('lm_save').click(); $('lab_run').click(); d.querySelector('[data-id="'+a+'"] .lab-power').click(); assert($('lab-flow-status').textContent.includes(w.Lab.state.devices.find(x=>x.id===back).name));
 d.querySelector('[data-id="'+common+'"] .lab-power').click(); assert($('lab-flow-status').textContent.includes('Нет активного пути')); assert(!d.querySelector('.lab-flow-out'));
 // Настройка доступа извне непосредственно через линию ПК — MikroTik.
 $('lab_reset').click(); const directRouter=w.Lab.place('router',100,100), directIsp=w.Lab.place('isp',100,0), directPc=w.Lab.place('pc',100,220); w.Lab.link(directRouter,directIsp); const link=w.Lab.link(directRouter,directPc); w.Lab.selectLink(link); assert($('insp_ext')); $('insp_ext').click(); assert($('lm_external')); $('lm_cancel').click();
 // Настройки LAN/VLAN/Wi-Fi в MikroTik и выбор гостевого сегмента у устройства.
 $('lab_reset').click(); const vr=w.Lab.place('router',100,100), vi=w.Lab.place('isp',100,0), vs=w.Lab.place('switch',200,220), vp=w.Lab.place('pc',100,350), vg=w.Lab.place('server',320,220);
 w.Lab.link(vr,vi); w.Lab.link(vr,vs); w.Lab.link(vs,vp); w.Lab.link(vr,vg);
 d.querySelector('[data-id="'+vr+'"] .lab-gear').click();
 assert($('lm_guest_vlan') && $('lm_wifi_ap') && $('lm_network_guide'));
 $('lm_guest_vlan').checked=true; $('lm_guest_vlan').dispatchEvent(new w.Event('change')); assert(!$('lm_guest_vlan_box').hidden);
 $('lm_wifi_ap').checked=true; $('lm_wifi_ap').dispatchEvent(new w.Event('change')); $('lm_wifi_country').value='Belarus'; $('lm_wifi_pass').value='StrongPassword'; $('lm_wifi_guest').checked=true; $('lm_wifi_guest').dispatchEvent(new w.Event('change')); $('lm_wifi_guest_pass').value='GuestPassword'; $('lm_wifi_guest_isolation').checked=true; $('lm_secure_management').checked=true; $('lm_save').click(); assert($('lab-modal').hidden);
 d.querySelector('[data-id="'+vg+'"] .lab-gear').click(); $('lm_segment').value='guest'; $('lm_mode').value='dhcp'; $('lm_mode').dispatchEvent(new w.Event('change')); $('lm_save').click();
 $('lab_run').click(); assert($('lab-results').textContent.includes('Проверка учебной модели пройдена')); assert($('lab-results').textContent.includes('192.168.99.100/24')); assert($('lab-results').textContent.includes('wifi-guest')); assert($('lab-results').textContent.includes('vlan-filtering=yes'));assert($('lab-results').textContent.includes('datapath.client-isolation=yes'));assert($('lab-results').textContent.includes('allowed-interface-list=none'));
 // Ссылка на учебник закрывает окно настроек.
 d.querySelector('[data-id="'+vr+'"] .lab-gear').click(); $('lm_network_guide').click(); assert($('lab-modal').hidden); w.location.hash='networks'; await new Promise(resolve=>setTimeout(resolve,20)); assert(!$('content').hidden);
 // Новые службы, статический маршрут и управляемый сбой контрольного узла.
 $('lab_reset').click(); const nr=w.Lab.place('router',200,100), ni=w.Lab.place('isp',50,0), nb=w.Lab.place('isp',350,0), np=w.Lab.place('pc',200,240);
 w.Lab.link(nr,ni);w.Lab.link(nr,nb);w.Lab.link(nr,np);
 d.querySelector('[data-id="'+ni+'"] .lab-gear').click();$('lm_kind').value='static';$('lm_kind').dispatchEvent(new w.Event('change'));$('lm_ip').value='198.51.100.2/30';$('lm_gw2').value='198.51.100.1';$('lm_dns').value='1.1.1.1';$('lm_save').click();assert($('lab-modal').hidden);
 d.querySelector('[data-id="'+nb+'"] .lab-gear').click();$('lm_kind').value='dhcp';$('lm_kind').dispatchEvent(new w.Event('change'));$('lm_save').click();assert($('lab-modal').hidden);
 d.querySelector('[data-id="'+nr+'"] .lab-gear').click();$('lm_wan_failover').checked=true;
 for(const [id,box] of [['lm_wan_monitor','lm_monitor_box'],['lm_static_route','lm_route_box'],['lm_custom_dns','lm_dns_box'],['lm_dns_static','lm_dns_static_box'],['lm_ntp','lm_ntp_box'],['lm_identity','lm_identity_box']]) {$(id).checked=true;$(id).dispatchEvent(new w.Event('change'));assert(!$(box).hidden);}
 $('lm_cloud').checked=true;$('lm_timezone').value='Europe/Minsk';$('lm_save').click();assert($('lab-modal').hidden);
 $('lab_run').click();assert($('lab-results').textContent.includes('Проверка учебной модели пройдена'));
 const dhcpStep=Array.from(d.querySelectorAll('#lab-winbox .lab-winbox-step')).find(el=>el.querySelector('img[src$="dhcp-client-create-winbox3.png"]'));assert(dhcpStep);assert.equal(dhcpStep.querySelectorAll('figure.shot').length,5);assert(dhcpStep.textContent.includes('Use Peer DNS включён'));assert(dhcpStep.querySelector('a[href*="mikrotik.wiki"]'));assert(dhcpStep.querySelector('a[href*="help.mikrotik.com"]'));dhcpStep.querySelector('.shot-zoom').click();assert(!$('shot-viewer').hidden);assert(full.getAttribute('src').includes('dhcp-client-create-winbox3'));$('shot-close').click();
 assert($('lab-results').textContent.includes('target-scope=11'));assert($('lab-results').textContent.includes('dst-address=10.20.0.0/24'));assert($('lab-results').textContent.includes('server.lan'));assert($('lab-results').textContent.includes('Europe/Minsk'));assert($('lab-results').textContent.includes('ddns-enabled=yes'));
 w.Lab.select(nr);assert($('insp_probe'));$('insp_probe').click();assert($('lab-flow-status').textContent.includes(w.Lab.state.devices.find(x=>x.id===nb).name));$('insp_probe').click();assert($('lab-flow-status').textContent.includes(w.Lab.state.devices.find(x=>x.id===ni).name));
 d.querySelector('[data-id="'+nr+'"] .lab-gear').click();$('lm_dns_static').checked=false;$('lm_dns_cache').checked=false;$('lm_save').click();$('lab_run').click();assert($('lab-results').textContent.includes('allow-remote-requests=no'));assert($('lab-results').textContent.includes('dns-server=1.1.1.1'));
 d.querySelector('[data-id="'+nr+'"] .lab-gear').click();$('lm_routing_guide').click();assert($('lab-modal').hidden);w.location.hash='routing';await new Promise(resolve=>setTimeout(resolve,20));assert(!$('content').hidden);
 // Несколько физических карт: отдельные настройки и назначение каждого кабеля.
 $('lab_reset').click();const mr=w.Lab.place('router',250,100), mi=w.Lab.place('isp',80,10), mp=w.Lab.place('pc',250,280), ms=w.Lab.place('server',430,280), mx=w.Lab.place('switch',440,180);
 w.Lab.link(mr,mi);
 d.querySelector('[data-id="'+mr+'"] .lab-gear').click();$('lm_guest_vlan').checked=true;$('lm_guest_vlan').dispatchEvent(new w.Event('change'));$('lm_save').click();
 d.querySelector('[data-id="'+mp+'"] .lab-gear').click();$('lm_nic_count').value='2';$('lm_nic_count').dispatchEvent(new w.Event('change'));assert(!$('lm_nic_box_2').hidden);$('lm_nic_segment_2').value='guest';$('lm_save').click();
 d.querySelector('[data-id="'+ms+'"] .lab-gear').click();$('lm_nic_count').value='2';$('lm_nic_count').dispatchEvent(new w.Event('change'));$('lm_save').click();
 const ml1=w.Lab.link(mr,mp), ml2=w.Lab.link(mr,mp);assert(ml1&&ml2&&ml1!==ml2);assert(!w.Lab.link(mr,mp));w.Lab.link(mr,mx);const ml3=w.Lab.link(mx,ms),ml4=w.Lab.link(mx,ms);assert(ml3&&ml4);
 assert.equal(w.Lab.state.links.find(x=>x.id===ml1).nicId,'nic1');assert.equal(w.Lab.state.links.find(x=>x.id===ml2).nicId,'nic2');
 $('lab_run').click();assert($('lab-results').textContent.includes('Проверка учебной модели пройдена'));assert($('lab-results').textContent.includes('сетевая карта 2'));assert($('lab-results').textContent.includes('192.168.99.100/24'));assert.equal(w.LabEngine.activeRoutes(w.Lab.state).filter(x=>x.endpoint===mp).length,2);
 const edgeEls=d.querySelectorAll('.lab-link');assert(edgeEls.length>=5);assert.notEqual(edgeEls[1].getAttribute('x1'),edgeEls[2].getAttribute('x1'));
 w.Lab.selectLink(ml2);assert($('insp_nic'));assert.equal($('insp_nic').value,'nic2');assert($('insp_nic').querySelector('option[value="nic1"]').disabled);
 d.querySelector('[data-id="'+mp+'"] .lab-gear').click();$('lm_nic_count').value='1';$('lm_nic_count').dispatchEvent(new w.Event('change'));$('lm_save').click();assert(!$('lab-modal').hidden);assert($('lm_err').textContent.includes('Сначала удалите'));$('lm_cancel').click();
 // Две независимые сети и сервер с картой на каждый роутер.
 $('lab_reset').click();const ir1=w.Lab.place('router',150,100), ir2=w.Lab.place('router',450,100), ii1=w.Lab.place('isp',80,0), ii2=w.Lab.place('isp',520,0), isw=w.Lab.place('switch',150,200), ipc=w.Lab.place('pc',90,300), ih=w.Lab.place('server',350,300);
 d.querySelector('[data-id="'+ir2+'"] .lab-gear').click();$('lm_lan').value='192.168.99.0/24';$('lm_gw').value='192.168.99.1';$('lm_save').click();assert($('lab-modal').hidden);
 d.querySelector('[data-id="'+ih+'"] .lab-gear').click();$('lm_nic_count').value='2';$('lm_nic_count').dispatchEvent(new w.Event('change'));$('lm_save').click();assert($('lab-modal').hidden);
 w.Lab.link(ir1,ii1);w.Lab.link(ir2,ii2);w.Lab.link(ir1,isw);w.Lab.link(isw,ipc);w.Lab.link(isw,ih);w.Lab.link(ir2,ih);
 $('lab_run').click();assert($('lab-results').textContent.includes('Проверка учебной модели пройдена'));assert($('lab-results').textContent.includes('Две независимые сети'));assert($('lab-results').textContent.includes('192.168.99.100/24'));assert($('lab-results').textContent.includes('гипервизор'));assert($('lab-flow-status').textContent.includes(w.Lab.state.devices.find(x=>x.id===ir1).name));assert($('lab-flow-status').textContent.includes(w.Lab.state.devices.find(x=>x.id===ir2).name));
 d.querySelector('[data-id="'+ii2+'"] .lab-power').click();assert(!$('lab-flow-status').textContent.includes(w.Lab.state.devices.find(x=>x.id===ir2).name));assert($('lab-flow-status').textContent.includes(w.Lab.state.devices.find(x=>x.id===ir1).name));
 // DHCP-инструкция учебника содержит реальные снимки и ссылку на их источник.
 w.location.hash='initial';await new Promise(resolve=>setTimeout(resolve,20));assert(d.querySelector('#content img[src$="dhcp-client-create-winbox3.png"]'));assert(d.querySelector('#content a[href*="mikrotik.wiki"]'));assert(d.querySelector('#content img[src$="interface-list-member.png"]'));
 // Обычный раздел учебника использует тот же просмотр, не только лаборатория.
 w.location.hash='firewall'; await new Promise(resolve=>setTimeout(resolve,20));
 const guideImg=d.querySelector('#content figure.shot img'); assert(guideImg && guideImg.getAttribute('src').includes('official/'));
 guideImg.click(); assert(!$('shot-viewer').hidden); $('shot-close').click();
 assert.deepStrictEqual(errors,[]); dom.window.close(); console.log('Лаборатория: DOM-взаимодействия прошли.');
})().catch(e=>{console.error(e);process.exitCode=1;});
