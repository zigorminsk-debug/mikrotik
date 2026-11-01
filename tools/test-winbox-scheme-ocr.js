#!/usr/bin/env node
'use strict';
// Windows CI research only: selected UI example -> isolated CHR -> original WinBox.
// The temporary runner uses throwaway credentials and a loopback-only management
// forward. Test credentials are provided over stdin, never as arguments or environment.
const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),{spawn}=require('child_process');
const {JSDOM,VirtualConsole}=require('jsdom');
const E=require('../app/js/lab-sim'),{makePlan}=require('../windows/chr/plan');
const [qemu,image,work,supervisor,winbox]=process.argv.slice(2);
if(!qemu||!image||!work||!supervisor||!winbox)throw Error('Missing CI paths');
// CI-only in-memory modification: do not expose a WinBox port or credentials
// through the production API. Both forwards bind only to runner loopback.
const filename=require.resolve('../windows/chr/session'),source=fs.readFileSync(filename,'utf8');
const target='const managementPort = await temporaryPort();';
const from='hostfwd=tcp:127.0.0.1:${managementPort}-172.31.254.15:80';
const ret='return { url:`http://127.0.0.1:${managementPort}/`, user:\'admin\', password };';
for(const text of [target,from,ret])assert.equal(source.split(text).length,2,'CI patch mismatch');
const patched=source.replace(target,target+'\n      const ciWinboxPort = await temporaryPort();')
 .replace(from,from+',hostfwd=tcp:127.0.0.1:${ciWinboxPort}-172.31.254.15:8291')
 .replace("'/ip service enable www',", "'/ip service enable www', '/ip service enable winbox',")
 .replace(ret,"return { url:`http://127.0.0.1:${managementPort}/`, user:'admin', password, ciWinboxPort };");
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(patched,filename);
const {ChrSession}=mod.exports;let session,dom;
(async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 dom=await JSDOM.fromFile(path.join(__dirname,'../app/index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};}});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));w.location.hash='lab';await new Promise(r=>setTimeout(r,50));w.document.getElementById('lab_example_chr_isolated').click();
 const kind=process.env.CI_SCHEME_KIND||'static';if(!['static','dhcp'].includes(kind))throw Error('Invalid CI scheme kind');
 if(kind==='dhcp') {const isp=w.Lab.state.devices.find(d=>d.type==='isp');assert(isp);w.Lab.openSettings(isp.id);const kindSelect=w.document.getElementById('lm_kind');kindSelect.value='dhcp';kindSelect.dispatchEvent(new w.Event('change'));w.document.getElementById('lm_save').click();assert(w.document.getElementById('lab-modal').hidden);}
 const state=JSON.parse(JSON.stringify(w.Lab.state)),router=state.devices.find(d=>d.type==='router');assert(router&&!errors.length);
 const plan=makePlan(E,state,router.id);assert.deepStrictEqual(plan.blockers,[]);if(kind==='static')assert.equal(plan.expected.wanAddress,'198.51.100.2/30');else assert.equal(plan.expected.wans[0].kind,'dhcp');assert.equal(plan.expected.wanPort,'ether1');
 session=new ChrSession({qemu:path.resolve(qemu),image:path.resolve(image),tempRoot:path.resolve(work),supervisor:path.resolve(supervisor)});
 const info=await session.start(plan);assert.equal(new URL(info.url).hostname,'127.0.0.1');assert(Number.isInteger(info.ciWinboxPort));
 await new Promise((resolve,reject)=>{
  const env={...process.env,CI_WINBOX_EXE:path.resolve(winbox),CI_CAPTURE_DHCP:kind==='dhcp'?'1':'0',CI_CAPTURE_PRINT:'0',CI_BACKGROUND_NAV:'1',CI_DETAIL_NAV:'1'};
  const helper='test-winbox-scheme-ocr.ps1';
  const p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,helper)],{env,stdio:['pipe','pipe','ignore'],windowsHide:true});
  p.stdin.on('error',()=>{});p.stdin.end(JSON.stringify({port:info.ciWinboxPort,password:info.password})+'\n');
  let stage='unknown',reason='unspecified',counts='unavailable',partial='unavailable',strip='unavailable',fields='unavailable',tess='unavailable',output='';p.stdout.on('data',data=>{output=(output+String(data)).slice(-4096);const m=output.match(/CI_STAGE=(address-detail-ocr|address-row-ocr|start|window|login-input|workspace|ip-menu|addresses-menu|screenshot|dhcp-client|address-detail|print-window|verified-workspace-no-uia|authentication-unconfirmed)/);if(m)stage=m[1];const r=output.match(/CI_REASON=(negative-target|row-missing-or-ambiguous|row-outside-window|detail-unconfirmed|other)/);if(r)reason=r[1];const c=output.match(/CI_OCR_COUNTS=(\d{1,3},\d{1,3},\d{1,3},\d{1,3})(?:\r?\n)/);if(c)counts=c[1];const q=output.match(/CI_OCR_PARTIAL=(\d{1,3},\d{1,3},\d{1,3})(?:\r?\n)/);if(q)partial=q[1];const matches=[...output.matchAll(/CI_STRIP_(BICUBIC|NEAREST|THRESHOLD)=(\d{1,3},\d{1,3},\d{1,3},\d{1,3},\d{1,3},\d{1,3})(?:\r?\n)/g)];if(matches.length)strip=matches.map(x=>x[1]+':'+x[2]).join(' ');const d=output.match(/CI_DETAIL_FIELDS=([01],[01],[01])(?:\r?\n)/);if(d)fields=d[1];const t=output.match(/CI_TESS_FIELDS=([01],[01],[01]|error)(?:\r?\n)/);if(t)tess=t[1];});
  const timer=setTimeout(()=>{p.kill();reject(Error('WinBox GUI timeout at '+stage));},120000);
  p.once('error',()=>{clearTimeout(timer);reject(Error('WinBox GUI automation failed'));});
  p.once('exit',code=>{clearTimeout(timer);
   if(code===0 && tess==='1,1,1' && fields.startsWith('1,1,')) {console.log('::notice title=Disposable WinBox detail OCR::Exact fixture address, network and interface were confirmed in the cropped detail form; independent WinRT OCR confirmed address and network. This is not production automation.');resolve();}
   else reject(Error('WinBox GUI did not complete at '+stage+' ('+reason+'); OCR fixed-fixture counts '+counts+'; partial tokens '+partial+'; strip counts '+strip+'; detail fields '+fields+'; independent OCR '+tess+'; image is unverified'));
  });
 });
 const picture=path.join(process.env.RUNNER_TEMP,'lab-scheme-winbox.jpg');assert(fs.existsSync(picture)&&fs.statSync(picture).size>5000);if(kind==='dhcp'){const p=path.join(process.env.RUNNER_TEMP,'lab-scheme-dhcp.jpg');assert(fs.existsSync(p)&&fs.statSync(p).size>5000);}
 if(process.env.CI_DETAIL_NAV==='1'){const p=path.join(process.env.RUNNER_TEMP,'lab-scheme-detail.jpg');assert(fs.existsSync(p)&&fs.statSync(p).size>5000);}
 const dir=session.directory;await session.stop();assert(!fs.existsSync(dir));
 console.log('::notice title=Scheme WinBox research::Disposable Windows CHR received the exact UI preset and passed REST verification; WinBox GUI capture completed. The image needs visual inspection. No physical router, user credentials, internet, or production GUI integration.');
})().catch(e=>{console.log('::error title=Scheme WinBox research::'+String(e.message).replace(/[\r\n%]/g,' '));process.exitCode=1;}).finally(async()=>{if(dom)dom.window.close();if(session)try{await session.stop();}catch(_){process.exitCode=1;}});
