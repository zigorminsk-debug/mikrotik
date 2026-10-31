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
let saveChoice = {canceled:true};
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
}
const app=new EventEmitter();Object.assign(app,{isPackaged:true,getPath:()=>'/test-data',requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),quit:()=>{}});
const electron={app,BrowserWindow:Window,shell:{openExternal:async url=>opened.push(url)},
  dialog:{showMessageBox:async(_win,options)=>{dialogs.push(options);return {response:choices.shift()};},showErrorBox:(_title,msg)=>errors.push(msg),showSaveDialog:async()=>saveChoice},
  ipcMain:{handle:(name,fn)=>handlers[name]=fn},clipboard:{writeText(){},readText(){return '';},clear(){}}};
const mockfs={promises:{readdir:async()=>{const e=new Error();e.code='ENOENT';throw e;},access:async()=>{},rm:async()=>{},writeFile:async(file,data)=>writes.push({file,data:Buffer.from(data)})}};
const req=name=>{
  if(name==='electron')return electron;if(name==='fs')return mockfs;
  if(name==='./www/js/lab-sim')return {};
  if(name==='./chr/plan')return {makePlan:()=>plan};
  if(name==='./chr/online')return {validateDualInternet:()=>onlineValid};
  if(name==='./chr/network-warning')return require('../windows/chr/network-warning');
  if(name==='./chr/download')return {ensureImage:async(root,consent)=>{downloads.push({root,consent});return '/image/chr-7.23.8.img';}};
  if(name==='./chr/session')return {ChrSession:Session};
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
  const save=handlers['diagram:save'], png=Uint8Array.from([137,80,78,71,13,10,26,10,1]);
  assert(!(await save({sender:{},senderFrame:{}},'png',png)).ok);
  assert(!(await save(good,'gif',png)).ok); assert(!(await save(good,'exe',png)).ok); assert.equal(writes.length,0);
  assert((await save(good,'png',png)).cancelled); assert.equal(writes.length,0);
  saveChoice={canceled:false,filePath:'/chosen/scheme.png'};
  assert((await save(good,'png',png)).ok); assert.equal(writes[0].file,'/chosen/scheme.png'); assert.deepStrictEqual(writes[0].data,Buffer.from(png));
  saveChoice={canceled:false,filePath:'/chosen/scheme.gif'};
  assert((await save(good,'gif',Uint8Array.from(Buffer.from('GIF89a...')))).ok); assert.equal(writes[1].file,'/chosen/scheme.gif');

  plan={blockers:['unsupported'],groups:[]};const rejected=await call(good,'r',{});assert(!rejected.ok && rejected.message.includes('unsupported'));assert(!downloads.length);
  plan={blockers:[],groups:[{id:'iface',commands:['/interface print']}],expected:{}};
  choices.push(2);const cancelled=await call(good,'r',{});assert(cancelled.cancelled && !downloads.length);
  choices.push(0,1,1);const result=await call(good,'r',{});assert(result.ok);assert(opened.includes('https://mikrotik.com/software/legal'));assert.strictEqual(downloads.length,1);assert.strictEqual(downloads[0].consent,true);
  assert.strictEqual(created[0].opts.internetConsent,false);assert.strictEqual(created[0].plan,plan);assert.strictEqual(created[0].opts.qemu,require('path').join('/resources','qemu','qemu-system-x86_64.exe'));
  const guest=windows[1];assert(guest.url==='http://127.0.0.1:18765/');assert(guest.options.webPreferences.sandbox && !guest.options.webPreferences.nodeIntegration);
  let outcome;guest.requests({url:'https://example.com/'},x=>outcome=x);assert(outcome.cancel);
  guest.requests({url:'http://127.0.0.1:18765/webfig'},x=>outcome=x);assert(!outcome.cancel);
  guest.requests({url:'ws://127.0.0.1:18765/socket'},x=>outcome=x);assert(!outcome.cancel);
  assert(!JSON.stringify(main.events).includes('TEMPORARY_TEST_PASSWORD'));
  guest.destroy();await new Promise(resolve=>setImmediate(resolve));assert(created[0].stopped);assert(!errors.length);
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
  console.log('Windows мост: только главное окно, согласие, изоляция WebFig и остановка проверены.');
})().catch(e=>{console.error(e);process.exitCode=1;});
