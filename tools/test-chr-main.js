#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const {EventEmitter} = require('events');
const source = fs.readFileSync(require('path').join(__dirname,'../windows/main.js'),'utf8');
const windows = [], handlers = {}, choices = [], downloads = [], opened = [], created = [], errors = [];
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
  dialog:{showMessageBox:async()=>({response:choices.shift()}),showErrorBox:(_title,msg)=>errors.push(msg)},
  ipcMain:{handle:(name,fn)=>handlers[name]=fn},clipboard:{writeText(){},readText(){return '';},clear(){}}};
const mockfs={promises:{readdir:async()=>{const e=new Error();e.code='ENOENT';throw e;},access:async()=>{},rm:async()=>{}}};
const req=name=>{
  if(name==='electron')return electron;if(name==='fs')return mockfs;
  if(name==='./www/js/lab-sim')return {};
  if(name==='./chr/plan')return {makePlan:()=>plan};
  if(name==='./chr/download')return {ensureImage:async(root,consent)=>{downloads.push({root,consent});return '/image/chr-7.23.8.img';}};
  if(name==='./chr/session')return {ChrSession:Session};
  return require(name);
};
vm.runInNewContext(source,{require:req,process:{platform:'win32',resourcesPath:'/resources'},__dirname:'/app',Buffer,URL,setTimeout,clearTimeout,console});
(async()=>{
  await new Promise(resolve=>setImmediate(resolve)); await new Promise(resolve=>setImmediate(resolve));
  const main=windows[0], call=handlers['chr:launch'];assert(main && call);
  const good={sender:main.webContents,senderFrame:main.webContents.mainFrame};
  const bad=await call({sender:{},senderFrame:{}},'r',{});assert(!bad.ok && !downloads.length);
  plan={blockers:['unsupported'],groups:[]};const rejected=await call(good,'r',{});assert(!rejected.ok && rejected.message.includes('unsupported'));assert(!downloads.length);
  plan={blockers:[],groups:[{id:'iface',commands:['/interface print']}],expected:{}};
  choices.push(2);const cancelled=await call(good,'r',{});assert(cancelled.cancelled && !downloads.length);
  choices.push(0,1,1);const result=await call(good,'r',{});assert(result.ok);assert(opened.includes('https://mikrotik.com/software/legal'));assert.strictEqual(downloads.length,1);assert.strictEqual(downloads[0].consent,true);
  assert.strictEqual(created[0].plan,plan);assert.strictEqual(created[0].opts.qemu,'/resources/qemu/qemu-system-x86_64.exe');
  const guest=windows[1];assert(guest.url==='http://127.0.0.1:18765/');assert(guest.options.webPreferences.sandbox && !guest.options.webPreferences.nodeIntegration);
  let outcome;guest.requests({url:'https://example.com/'},x=>outcome=x);assert(outcome.cancel);
  guest.requests({url:'http://127.0.0.1:18765/webfig'},x=>outcome=x);assert(!outcome.cancel);
  guest.requests({url:'ws://127.0.0.1:18765/socket'},x=>outcome=x);assert(!outcome.cancel);
  assert(!JSON.stringify(main.events).includes('TEMPORARY_TEST_PASSWORD'));
  guest.destroy();await new Promise(resolve=>setImmediate(resolve));assert(created[0].stopped);assert(!errors.length);
  console.log('Windows мост: только главное окно, согласие, изоляция WebFig и остановка проверены.');
})().catch(e=>{console.error(e);process.exitCode=1;});
