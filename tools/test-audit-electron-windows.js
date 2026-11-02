/* CI only: real Windows Electron UI/preload/IPC with a mocked dialog and collector.
   Never connects to any router. All addresses, data and credentials are fixtures. */
'use strict';
const {app,BrowserWindow,dialog}=require('electron'),path=require('path'),os=require('os'),fs=require('fs');
const reader=require('../windows/audit/rest-readonly'),{fixture}=require('./audit-safe-fixture');let calls=0,choice=0,lastDialog;
reader.collect=async options=>{calls++;if(options.host!=='192.0.2.10'||options.password!=='fixture-password')throw Error('Fixture mismatch');return {complete:false,sections:[...fixture().snapshot.sections,{id:'system',status:'ok',rows:[{version:'7.23.8','board-name':'CHR'}]},{id:'identity',status:'ok',rows:[{name:'TEST-FIXTURE'}]}]};};
dialog.showMessageBox=async (_owner,options)=>{lastDialog=options;return {response:choice};};
app.commandLine.appendSwitch('disable-gpu');app.setPath('userData',path.join(os.tmpdir(),'mikrotik-audit-ui-ci'));require('../windows/main.js');
let stage='startup',failed=false;
(async()=>{try{
 await app.whenReady();let win;for(let i=0;i<100;i++){win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading())break;await new Promise(r=>setTimeout(r,100));}if(!win||win.webContents.isLoading())throw Error('Main window not ready');
 stage='open-card';const setup=`(async()=>{location.hash='lab';await new Promise(r=>setTimeout(r,300));const id=Lab.place('router',200,120);Lab.openSettings(id);await new Promise(r=>setTimeout(r,200));const $=id=>document.getElementById(id);$('audit-ip').value='192.0.2.10';$('audit-pin').value='AA:'.repeat(31)+'AA';$('audit-user').value='test-reader';$('audit-password').value='fixture-password';return !!$('lm_physical_audit')&&!$('lm_physical_audit').querySelector('button[type=submit]').disabled;})()`;
 if(!await win.webContents.executeJavaScript(setup))throw Error('Audit UI unavailable');
 const data={host:'192.0.2.10',port:443,fingerprint:'AA:'.repeat(31)+'AA',user:'test-reader',password:'fixture-password'};
 const input=JSON.stringify(data);
 stage='consent-cancel';const cancelled=await win.webContents.executeJavaScript(`window.routerOS.auditIp(${input})`);if(!cancelled.cancelled||calls!==0||!lastDialog||lastDialog.defaultId!==0||lastDialog.detail.includes(data.password))throw Error('Cancellation or dialog boundary failed');
 stage='direct-ipc';choice=1;const read=await win.webContents.executeJavaScript(`window.routerOS.auditIp(${input})`);if(!read.ok||calls!==1||read.report.complete!==false)throw Error('IPC fixture failed');
 stage='form-read';const result=await win.webContents.executeJavaScript(`(async()=>{const $=id=>document.getElementById(id);$('audit-password').value='fixture-password';$('lm_physical_audit').querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));for(let i=0;i<100&&!$('lm_physical_audit').textContent.includes('TEST-FIXTURE');i++)await new Promise(r=>setTimeout(r,50));return {cleared:$('audit-password').value==='',text:$('lm_physical_audit').textContent};})()`);
 // Identity is inside a collapsed details element, but is still text in the DOM.
 if(!result.cleared||!result.text.includes('TEST-FIXTURE')||calls!==2)throw Error('UI fixture result failed');
 stage='preview-ui';const preview=await win.webContents.executeJavaScript(`(async()=>{const el=document.getElementById('lm_physical_audit'),s=el.querySelectorAll('select');if(s.length!==2)return false;s[0].value='ether2';s[1].value='ether3';const b=[...el.querySelectorAll('button')].find(x=>x.textContent==='Проверить предварительный план');b.click();for(let i=0;i<100&&!el.textContent.includes('перенос не выполнялся');i++)await new Promise(r=>setTimeout(r,50));return el.textContent.includes('192.0.2.1/24')&&el.textContent.includes('перенос не выполнялся')&&el.textContent.includes('NAT IPv4');})()`);
 if(!preview)throw Error('Preview UI/preload/IPC failed');
 stage='capture';await win.webContents.executeJavaScript(`document.querySelector('#lm_physical_audit button[type=submit]').scrollIntoView({block:'center'});new Promise(r=>setTimeout(r,500))`);
 const shot=await win.webContents.capturePage();if(shot.isEmpty())throw Error('Screenshot is empty');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'audit-ui-mocked.jpg'),shot.resize({width:900}).toJPEG(30));
 await win.webContents.executeJavaScript(`document.querySelector('#lm_physical_audit select').scrollIntoView({block:'center'});new Promise(r=>setTimeout(r,500))`);
 const previewShot=await win.webContents.capturePage();if(previewShot.isEmpty())throw Error('Preview screenshot is empty');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'audit-preview-ui-mocked.jpg'),previewShot.resize({width:900}).toJPEG(30));
 stage='close-clear';const cleared=await win.webContents.executeJavaScript(`(async()=>{document.getElementById('lm_cancel').click();await new Promise(r=>setTimeout(r,100));return await routerOS.auditPreview([{source:'physical-1',target:'ether2'},{source:'physical-2',target:'ether3'}]);})()`);if(cleared.ok)throw Error('Snapshot not cleared on close');
 console.log('::notice title=Audit Windows IPC::Real Electron renderer, preload and IPC including preview and cleanup exercised with a mocked confirmation and collector. Only fixture data; no physical router, actual native dialog or network was tested.');
}catch(_){failed=true;console.log('::error title=Audit Windows IPC::Fixture failed at '+stage+'; no raw data logged.');}finally{for(const w of BrowserWindow.getAllWindows())w.destroy();app.exit(failed?1:0);}})();
