#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const {EventEmitter} = require('events');
const source = fs.readFileSync(require('path').join(__dirname,'../windows/main.js'),'utf8');
const windows = [], handlers = {}, choices = [], downloads = [], opened = [], created = [], errors = [], writes = [], dialogs = [];
let onlineValid = true, physicalCalls = 0;
const physicalNic={name:'Test Ethernet',address:'192.168.88.5'};
let saveChoice = {canceled:true}, openChoice = {canceled:true};
const winboxRuns=[], clipboardWrites=[], labs=[], linuxDownloads=[];
const mockSpawn=(...args)=>{winboxRuns.push(args);const p=new EventEmitter();p.unref=()=>{};setImmediate(()=>p.emit('spawn'));return p;};
let plan = {blockers:[],groups:[{id:'iface',commands:['/interface print']}],expected:{}};
class Window extends EventEmitter {
  constructor(options) {
    super(); this.options=options; this.dead=false; this.webContents=new EventEmitter();
    Object.assign(this.webContents,{mainFrame:{},isDestroyed:()=>this.dead,send:(...args)=>{this.events.push(args);},setWindowOpenHandler:f=>{this.popups=f;},
      session:{setPermissionRequestHandler:f=>{this.permissions=f;},webRequest:{onBeforeRequest:(_filter,f)=>{this.requests=f;}}}});
    this.events=[]; windows.push(this);
  }
  isDestroyed(){return this.dead;} loadFile(){return Promise.resolve();} loadURL(url){this.url=url;return Promise.resolve();}
  setProgressBar(){} isMinimized(){return false;} restore(){} focus(){}
  destroy(){this.dead=true;this.emit('closed');}
}
class Session {
  constructor(opts){this.opts=opts;this.stopped=false;this.exitPromise=new Promise(resolve=>{this.exit=resolve;});created.push(this);}
  async start(p){this.plan=p;return {url:'http://127.0.0.1:18765/',user:'admin',password:'TEMPORARY_TEST_PASSWORD'};}
  async stop(){this.stopped=true;}
  async ping(target){this.pingCalls=(this.pingCalls||[]).concat(target);return {sent:3,received:2};}
  async resolve(name){this.resolveCalls=(this.resolveCalls||[]).concat(name);return {ok:true,address:'192.168.88.20'};}
}
class Lab {
 constructor(opts){this.opts=opts;if(opts.state&&opts.state.blocked)throw Error('Клиент не поддерживается');this.exitPromise=new Promise(r=>{this.exit=r;});labs.push(this);}
 async start(){return {router:{url:'http://127.0.0.1:18765/',user:'admin',password:'TEMPORARY_TEST_PASSWORD'},clients:[{id:'pc',address:'192.168.88.10',type:'pc',mode:'static'}]};}
 async stop(){this.stopped=true;}
 async resolveClient(id,name){this.lookups=(this.lookups||[]).concat([[id,name]]);return {ok:true,address:'192.168.88.20'};}
 async pingClient(id,target){this.calls=(this.calls||[]).concat([[id,target]]);return {sent:3,received:3};}
 async ping(){return {sent:3,received:3};}
 async resolve(){return {ok:false,reason:'dns'};}
}
const app=new EventEmitter();Object.assign(app,{isPackaged:true,getPath:()=>'/test-data',requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),quit:()=>{}});
const electron={app,BrowserWindow:Window,shell:{openExternal:async url=>opened.push(url)},
  dialog:{showMessageBox:async(_win,options)=>{dialogs.push(options);return {response:choices.shift()};},showErrorBox:(_title,msg)=>errors.push(msg),showSaveDialog:async()=>saveChoice,showOpenDialog:async()=>openChoice},
  ipcMain:{handle:(name,fn)=>handlers[name]=fn},clipboard:{writeText(value){clipboardWrites.push(value);},readText(){return '';},clear(){}}};
const mockfs={promises:{realpath:async p=>p,stat:async()=>({isFile:()=>true}),readdir:async()=>{const e=new Error();e.code='ENOENT';throw e;},access:async()=>{},rm:async()=>{},writeFile:async(file,data)=>writes.push({file,data:Buffer.from(data)})}};
const req=name=>{
  if(name==='electron')return electron;if(name==='fs')return mockfs;
  if(name==='./www/js/lab-sim')return {};
  if(name==='./chr/plan')return {makePlan:()=>plan};
  if(name==='./chr/online')return {validateDualInternet:()=>onlineValid};
  if(name==='./chr/network-warning')return require('../windows/chr/network-warning');
  if(name==='./chr/download')return {ensureImage:async(root,consent)=>{downloads.push({root,consent});return '/image/chr-7.23.8.img';}};
  if(name==='./chr/session')return {ChrSession:Session};
  if(name==='./chr/experimental-lab')return {ExperimentalLab:Lab};
  if(name==='./chr/linux-image')return {IMAGE_NAME:'cirros-0.6.3-x86_64-disk.img',ensureLinuxImage:async(root,consent)=>{linuxDownloads.push({root,consent});return '/image/cirros-0.6.3-x86_64-disk.img';}};
  if(name==='./chr/ping')return require('../windows/chr/ping');
  if(name==='./chr/resolve')return require('../windows/chr/resolve');
  if(name==='child_process')return {spawn:mockSpawn};
  if(name==='./physical/open-winbox')return require('../windows/physical/open-winbox');
  if(name==='./physical/mndp')return {interfaces:()=>[physicalNic],discover:async()=>{physicalCalls++;return [{mac:'02:11:22:33:44:55'}];}};
  return require(name);
};
vm.runInNewContext(source,{require:req,process:{platform:'win32',resourcesPath:'/resources'},__dirname:'/app',Buffer,URL,setTimeout,clearTimeout,console});
(async()=>{
  await new Promise(resolve=>setImmediate(resolve)); await new Promise(resolve=>setImmediate(resolve));
  const main=windows[0], call=handlers['chr:launch'];assert(main && call);
  const good={sender:main.webContents,senderFrame:main.webContents.mainFrame};
  const bad=await call({sender:{},senderFrame:{}},'r',{});assert(!bad.ok && !downloads.length);
  const listPhysical=handlers['physical:interfaces'], findPhysical=handlers['physical:discover'];
  assert(!(await listPhysical({sender:{},senderFrame:{}})).ok);
  assert((await listPhysical(good)).ok);
  assert(!(await findPhysical({sender:{},senderFrame:{}},physicalNic.name,physicalNic.address)).ok);
  assert(!(await findPhysical(good,'unlisted','1.2.3.4')).ok);assert.equal(physicalCalls,0);
  choices.push(0);assert((await findPhysical(good,physicalNic.name,physicalNic.address)).cancelled);assert.equal(physicalCalls,0);
  assert(dialogs.at(-1).defaultId===0 && dialogs.at(-1).detail.includes('не сбрасывает'));
  choices.push(1);assert((await findPhysical(good,physicalNic.name,physicalNic.address)).ok);assert.equal(physicalCalls,1);
  const copyMac=handlers['physical:copy-mac'];
  assert(!(await copyMac({sender:{},senderFrame:{}},'02:11:22:33:44:55')).ok);
  for(const badMac of ['00:00:00:00:00:00','FF:FF:FF:FF:FF:FF','01:11:22:33:44:55','02:11:22:33:44:55;bad',{},null]) assert(!(await copyMac(good,badMac)).ok);
  assert.equal(clipboardWrites.length,0);assert((await copyMac(good,'02:aa:22:33:44:55')).ok);assert.equal(clipboardWrites.at(-1),'02:AA:22:33:44:55');
  const openWinbox=handlers['physical:open-winbox'];
  assert(!(await openWinbox({sender:{},senderFrame:{}})).ok);assert.equal(winboxRuns.length,0);
  assert((await openWinbox(good)).cancelled);assert.equal(winboxRuns.length,0);
  openChoice={canceled:false,filePaths:['C:\\Official\\WinBox.exe']};
  choices.push(0);assert((await openWinbox(good)).cancelled);assert.equal(winboxRuns.length,0);
  choices.push(1);assert((await openWinbox(good)).ok);assert.equal(winboxRuns.length,1);assert.equal(winboxRuns[0][1].length,0);
  const save=handlers['diagram:save'], png=Uint8Array.from([137,80,78,71,13,10,26,10,1]);
  assert(!(await save({sender:{},senderFrame:{}},'png',png)).ok);
  assert(!(await save(good,'gif',png)).ok); assert(!(await save(good,'exe',png)).ok); assert.equal(writes.length,0);
  assert((await save(good,'png',png)).cancelled); assert.equal(writes.length,0);
  saveChoice={canceled:false,filePath:'/chosen/scheme.png'};
  assert((await save(good,'png',png)).ok); assert.equal(writes[0].file,'/chosen/scheme.png'); assert.deepStrictEqual(writes[0].data,Buffer.from(png));
  saveChoice={canceled:false,filePath:'/chosen/scheme.gif'};
  assert((await save(good,'gif',Uint8Array.from(Buffer.from('GIF89a...')))).ok); assert.equal(writes[1].file,'/chosen/scheme.gif');

  plan={blockers:['unsupported'],groups:[]};const rejected=await call(good,'r',{});assert(!rejected.ok && rejected.message.includes('unsupported'));assert(!downloads.length);
  plan={blockers:[],groups:[{id:'iface',commands:['/interface print']}],expected:{wans:[{kind:'dhcp'}]}};
  choices.push(2);const cancelled=await call(good,'r',{});assert(cancelled.cancelled && !downloads.length);
  choices.push(0,1,1);const result=await call(good,'r',{});assert(result.ok);assert(opened.includes('https://mikrotik.com/software/legal'));assert.strictEqual(downloads.length,1);assert.strictEqual(downloads[0].consent,true);
  assert(dialogs.some(d=>d.detail && d.detail.includes('WAN получил DHCP-аренду') && d.detail.includes('не подтверждение маршрута')));
  assert.strictEqual(created[0].opts.internetConsent,false);assert.strictEqual(created[0].plan,plan);assert.strictEqual(created[0].opts.qemu,require('path').join('/resources','qemu','qemu-system-x86_64.exe'));
  const guest=windows[1];assert(guest.url==='http://127.0.0.1:18765/');assert(guest.options.webPreferences.sandbox && !guest.options.webPreferences.nodeIntegration);
  let outcome;guest.requests({url:'https://example.com/'},x=>outcome=x);assert(outcome.cancel);
  guest.requests({url:'http://127.0.0.1:18765/webfig'},x=>outcome=x);assert(!outcome.cancel);
  guest.requests({url:'ws://127.0.0.1:18765/socket'},x=>outcome=x);assert(!outcome.cancel);
  const ping=handlers['chr:ping'];assert(ping);
  assert(!(await ping({sender:{},senderFrame:{}},'r',{},'192.168.88.1')).ok);
  assert(!(await ping(good,'r',{},'192.168.88.1;bad')).ok);
  assert(!(await ping(good,'other',{},'192.168.88.1')).ok);
  assert(!(await ping(good,'r',{modified:true},'192.168.88.1')).ok);
  assert(!created[0].pingCalls);
  choices.push(0);assert((await ping(good,'r',{},'192.168.88.1')).cancelled);assert(!created[0].pingCalls);
  assert(dialogs.at(-1).defaultId===0 && dialogs.at(-1).detail.includes('локальную сеть'));
  choices.push(1);const pingResult=await ping(good,'r',{},'192.168.88.1');assert.equal(pingResult.received,2);assert.equal(pingResult.sent,3);assert.equal(created[0].pingCalls[0],'192.168.88.1');
  choices.push(0);assert((await ping(good,'r',{},'lab.example')).cancelled);assert(!created[0].resolveCalls);
  choices.push(1,0);assert((await ping(good,'r',{},'lab.example')).cancelled);assert.equal(created[0].resolveCalls.length,1);assert.equal(created[0].pingCalls.length,1);
  choices.push(1,1);const named=await ping(good,'r',{},'lab.example');assert.equal(named.address,'192.168.88.20');assert.equal(named.received,2);assert.equal(created[0].pingCalls.at(-1),'192.168.88.20');
  assert(dialogs.at(-1).message.includes('192.168.88.20') && dialogs.at(-1).message.includes('lab.example'));
  created[0].resolve=async()=>({ok:false,reason:'dns'});choices.push(1);assert((await ping(good,'r',{},'bad.example')).message.includes('DNS'));assert.equal(created[0].pingCalls.length,2);
  created[0].resolve=async()=>({ok:true,address:'127.0.0.1'});choices.push(1);assert((await ping(good,'r',{},'special.example')).message.includes('специальный'));assert.equal(created[0].pingCalls.length,2);

  assert(!JSON.stringify(main.events).includes('TEMPORARY_TEST_PASSWORD'));
  let finishPing;created[0].ping=()=>new Promise(resolve=>{finishPing=resolve;});choices.push(1);
  const pending=ping(good,'r',{},'192.168.88.1');await new Promise(resolve=>setImmediate(resolve));assert(finishPing);
  assert(!(await ping(good,'r',{},'192.168.88.2')).ok,'parallel ping must be rejected');
  guest.destroy();await new Promise(resolve=>setImmediate(resolve));assert(created[0].stopped);finishPing({sent:3,received:3});
  const afterClose=await pending;assert(!afterClose.ok && afterClose.message.includes('неизвестен'));
  assert(!errors.length);assert(!(await ping(good,'r',{},'192.168.88.1')).ok);
  plan={blockers:[],groups:[{id:'iface',commands:['/interface print']}],expected:{wans:[{},{}]}};
  plan.expected.ntp={server:'192.0.2.123',zone:'Europe/Minsk'}; // Still subject to the same network guard and per-launch consent.
  onlineValid=false; let rejectedOnline=await call(good,'r',{}); assert(!rejectedOnline.ok && rejectedOnline.message.includes('10.0.2.20')); assert.strictEqual(created.length,1);
  onlineValid=true; choices.push(0); let denied=await call(good,'r',{}); assert(denied.cancelled); assert.strictEqual(created.length,1);
  assert(dialogs.at(-1).detail.includes('службам этого компьютера') && dialogs.at(-1).defaultId===0);
  choices.push(1,1,1);const allowed=await call(good,'r',{}); assert(allowed.ok); assert.strictEqual(created.length,2); assert.strictEqual(created[1].opts.internetConsent,true);
  assert(dialogs.some(d=>d.title==='Лицензия RouterOS CHR' && d.detail.includes('компьютеру и локальной сети')));
  assert(dialogs.at(-1).detail.includes('синхронизация времени и доступность сервера не проверялись'));
  assert.deepStrictEqual(created[1].plan.expected.ntp, plan.expected.ntp);
  windows[2].destroy(); await new Promise(resolve=>setImmediate(resolve)); assert(created[1].stopped);
  plan={blockers:[],groups:[{id:'iface',commands:['/interface print']}],expected:{wans:[{kind:'static'}]}};
  assert(!(await call({sender:{},senderFrame:{}},'r',{},true)).ok);assert(!(await call(good,'r',{},'yes')).ok);
  assert(!(await call(good,'r',{blocked:true},true)).ok);assert.equal(linuxDownloads.length,0);
  choices.push(1,2);assert((await call(good,'r',{},true)).cancelled);assert.equal(linuxDownloads.length,0);
  choices.push(1,0,1,1);const live=await call(good,'r',{},true);assert(live.ok);assert.equal(live.clients[0].id,'pc');assert.equal(linuxDownloads.length,1);assert(linuxDownloads[0].consent);assert(opened.includes('https://github.com/cirros-dev/cirros/tree/0.6.3'));
  assert(dialogs.some(d=>d.title==='Изолированные Linux-клиенты'&&d.defaultId===2&&d.detail.includes('подделывать')===false&&d.detail.includes('внедрять')));
  const pingClient=handlers['chr:ping-client'],lab=labs.at(-1);assert(pingClient);
  assert(!(await pingClient({sender:{},senderFrame:{}},'r','pc',{},'192.168.88.20')).ok);
  assert(!(await pingClient(good,'r','pc',{},'example.com;bad')).ok);assert(!(await pingClient(good,'r','invalid',{},'192.168.88.20')).ok);
  assert(!(await pingClient(good,'r','pc',{modified:true},'192.168.88.20')).ok);
  choices.push(0);assert((await pingClient(good,'r','pc',{},'192.168.88.20')).cancelled);assert(!lab.calls);
  choices.push(1);assert.equal((await pingClient(good,'r','pc',{},'192.168.88.20')).received,3);assert.equal(lab.calls[0][1],'192.168.88.20');
  choices.push(0);assert((await pingClient(good,'r','pc',{},'server.lab')).cancelled);assert(!lab.lookups);
  choices.push(1,0);assert((await pingClient(good,'r','pc',{},'server.lab')).cancelled);assert.equal(lab.lookups.length,1);assert.equal(lab.calls.length,1);
  choices.push(1,1);const namedClient=await pingClient(good,'r','pc',{},'server.lab');assert.equal(namedClient.address,'192.168.88.20');assert.equal(lab.calls.length,2);assert(dialogs.at(-1).message.includes('server.lab'));
  lab.resolveClient=async()=>({ok:false,reason:'dns'});choices.push(1);assert((await pingClient(good,'r','pc',{},'missing.lab')).message.includes('DNS'));assert.equal(lab.calls.length,2);
  lab.resolveClient=async()=>({ok:true,address:'127.0.0.1'});choices.push(1);assert((await pingClient(good,'r','pc',{},'bad.lab')).message.includes('специальный'));assert.equal(lab.calls.length,2);
  lab.resolveClient=async()=>({ok:false,reason:'dns-config'});choices.push(1);assert((await pingClient(good,'r','pc',{},'server.lab')).message.includes('изменились'));assert.equal(lab.calls.length,2);
  let finishCleanup;lab.stop=()=>new Promise(resolve=>{lab.stopped=true;finishCleanup=resolve;});
  windows.at(-1).destroy();await new Promise(resolve=>setImmediate(resolve));assert(lab.stopped);assert(!(await pingClient(good,'r','pc',{},'192.168.88.20')).ok);
  assert((await call(good,'r',{},true)).message.includes('очищается'),'launch must wait for disk cleanup');finishCleanup();await new Promise(resolve=>setImmediate(resolve));
  choices.push(1,1,1);assert((await call(good,'r',{},true)).ok);const broken=labs.at(-1);broken.stop=async()=>{throw Error('disk locked');};windows.at(-1).destroy();await new Promise(resolve=>setImmediate(resolve));assert(errors.some(e=>e.includes('временные данные')));assert((await call(good,'r',{},true)).message.includes('очистить'));
  console.log('Windows мост: отдельные согласия CHR/Linux, источник реального ping, изоляция WebFig и остановка проверены на моках.');
})().catch(e=>{console.error(e);process.exitCode=1;});
