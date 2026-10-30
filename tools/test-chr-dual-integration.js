#!/usr/bin/env node
'use strict';
// Windows CI: real main-process handler, plan and ChrSession/RouterOS with
// mocked Electron windows/dialog responses and the downloaded disposable image.
// This does not claim a native dialog or packaged GUI end-to-end test.
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const {EventEmitter}=require('events');
const {ChrSession}=require('../windows/chr/session');
const {makeReader}=require('../windows/chr/verify');
const source=fs.readFileSync(path.join(__dirname,'../windows/main.js'),'utf8');
const [qemu,image,work,supervisor]=process.argv.slice(2);
if (![qemu,image,work,supervisor].every(Boolean)) throw Error('Missing CI paths');
const state=JSON.parse(JSON.stringify(require('./chr-ci-dual-wan-fixture').state));
Object.assign(state.devices.find(d=>d.id==='isp').cfg,{ip:'10.0.2.20/24',gw:'10.0.2.2',dns:'10.0.2.3'});
Object.assign(state.devices.find(d=>d.id==='isp2').cfg,{ip:'10.0.3.20/24',gw:'10.0.3.2',dns:'10.0.3.3'});
Object.assign(state.devices.find(d=>d.id==='r').cfg,{customDns:true,dnsPrimary:'10.0.2.3',dnsSecondary:'10.0.3.3'});
const windows=[],handlers={},dialogs=[],choices=[1,1,1],events=[];let actual, info;
class Window extends EventEmitter {
 constructor(options){super();this.options=options;this.dead=false;this.events=[];this.webContents=new EventEmitter();Object.assign(this.webContents,{mainFrame:{},isDestroyed:()=>this.dead,send:(...a)=>this.events.push(a),setWindowOpenHandler:()=>{},session:{setPermissionRequestHandler:()=>{},webRequest:{onBeforeRequest:()=>{}}}});windows.push(this);}
 isDestroyed(){return this.dead;} loadFile(){return Promise.resolve();} loadURL(url){this.url=url;return Promise.resolve();} setProgressBar(){} destroy(){this.dead=true;this.emit('closed');}
}
class ActualSession extends ChrSession {
 constructor(opts){super({...opts,qemu:path.resolve(qemu),image:path.resolve(image),supervisor:path.resolve(supervisor),tempRoot:path.resolve(work),diagnoseManagement:true,diagnostic:e=>events.push(e)});actual=this;}
 async start(plan){info=await super.start(plan);return info;}
}
const app=new EventEmitter();Object.assign(app,{isPackaged:true,getPath:()=>path.resolve(work),requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),quit:()=>{}});
const electron={app,BrowserWindow:Window,shell:{openExternal:async()=>{}},dialog:{showMessageBox:async(_w,o)=>{dialogs.push(o);return {response:choices.shift()};},showErrorBox:(_t,m)=>{throw Error(m);}},ipcMain:{handle:(n,f)=>handlers[n]=f},clipboard:{writeText(){},readText(){return '';},clear(){}}};
const req=name=>{
 if(name==='electron')return electron;
 if(name==='fs')return {promises:{...fs.promises,access:async()=>{}}};
 if(name==='./www/js/lab-sim')return require('../app/js/lab-sim');
 if(name==='./chr/plan')return require('../windows/chr/plan');
 if(name==='./chr/online')return require('../windows/chr/online');
  if(name==='./chr/network-warning')return require('../windows/chr/network-warning');
 if(name==='./chr/download')return {ensureImage:async(_root,consent)=>{assert(consent);return path.resolve(image);}};
 if(name==='./chr/session')return {ChrSession:ActualSession};
 return require(name);
};
vm.runInNewContext(source,{require:req,process:{platform:'win32',resourcesPath:path.resolve(work)},__dirname:path.resolve(work),Buffer,URL,setTimeout,clearTimeout,console});
(async()=>{
 for (let i=0;i<100 && !windows.length;i++) await new Promise(r=>setTimeout(r,100));
 const main=windows[0];assert(main,'Main Electron window was not created after startup cleanup');const event={sender:main.webContents,senderFrame:main.webContents.mainFrame};
 const result=await handlers['chr:launch'](event,'r',state);assert(result.ok,JSON.stringify(result));
 assert(actual.internetConsent && info && windows[1]);
 assert(dialogs[0].title==='Доступ виртуальной CHR к сети' && dialogs[0].defaultId===0);
 assert(dialogs[1].title==='Лицензия RouterOS CHR' && dialogs[1].detail.includes('компьютеру и локальной сети'));
 assert(dialogs[2].title==='Виртуальная RouterOS готова');
 assert.equal(new URL(windows[1].url).hostname,'127.0.0.1');
 const get=makeReader(Number(new URL(info.url).port),info.user,info.password);
 async function waitActive(gateway){for(let i=0;i<45;i++){const rs=await get('/rest/ip/route');if(rs.some(x=>x['dst-address']==='0.0.0.0/0'&&x.gateway===gateway&&(x.active===true||x.active==='true')))return;await new Promise(r=>setTimeout(r,1000));}throw Error('Route not active: '+gateway);}
 const fetch='/tool fetch url="https://api.github.com/zen" output=none check-certificate=no';
 await waitActive('10.0.2.2'); await actual.console.command(fetch);
 await actual.console.command('/interface ethernet disable [find where name=ether1]'); await waitActive('10.0.3.2'); await actual.console.command(fetch);
 await actual.console.command('/interface ethernet enable [find where name=ether1]'); await waitActive('10.0.2.2'); await actual.console.command(fetch);
 const dir=actual.directory; await actual.stop();assert(!fs.existsSync(dir));
 console.log('::notice title=Main handler dual WAN integration::Real main handler, generated plan, CHR session, selected routes and interface failover verified; Electron dialogs/windows and image download were mocked. Both WANs use one host; test fetch does not validate TLS.');
})().catch(e=>{console.log('::error title=Dual WAN main integration::'+String(e.message).replace(/[\r\n%]/g,' '));console.log('::notice title=Integration diagnostics::'+JSON.stringify(events));process.exitCode=1;}).finally(async()=>{if(actual)await actual.stop().catch(e=>{console.log('::error title=Integration cleanup::'+String(e.message).replace(/[\r\n%]/g,' '));process.exitCode=1;});});
