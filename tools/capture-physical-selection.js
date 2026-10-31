/* Windows Electron screenshot of actual UI with synthetic MNDP replies only. */
'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
ipcMain.handle('physical:interfaces',()=>({ok:true,interfaces:[{name:'Учебный Ethernet',address:'192.0.2.5'}]}));
ipcMain.handle('physical:discover',()=>({ok:true,devices:[
 {mac:'02:11:22:33:44:55',identity:'Учебная CHR',hardware:'CHR (пример)',version:'7.23.8',sourceAddress:'192.0.2.10'},
 {mac:'02:11:22:33:44:66',identity:'Резервный пример',hardware:'CHR (пример)',version:'7.23.8',sourceAddress:'192.0.2.11'}
]}));
ipcMain.handle('physical:open-winbox',()=>{throw Error('Capture must not launch anything');});
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1000,height:900,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false,preload:path.resolve(__dirname,'../windows/preload.js')}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));win.webContents.setZoomFactor(.85);
  await win.webContents.executeJavaScript(`(async()=>{
    location.hash='lab';await new Promise(r=>setTimeout(r,250));const id=Lab.place('router',220,120);Lab.openSettings(id);
    await new Promise(r=>setTimeout(r,700));document.getElementById('lm_find_physical').click();
    await new Promise(r=>setTimeout(r,500));const area=document.getElementById('lm_physical_result');
    if(area.querySelectorAll('button').length!==2||!area.textContent.includes('данные не аутентифицированы'))throw Error('Sample list not rendered');
    area.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,400));
  })()`);
  const before=await win.webContents.capturePage();if(before.isEmpty())throw Error('Empty list capture');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'physical-choice-list.jpg'),before.toJPEG(40));
  await win.webContents.executeJavaScript(`(async()=>{const area=document.getElementById('lm_physical_result');area.querySelector('button').click();const input=document.getElementById('lm_selected_mac');if(!input||input.value!=='02:11:22:33:44:55')throw Error('Selection not rendered');document.getElementById('lm_physical_selected').scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,400));})()`);
  const after=await win.webContents.capturePage();if(after.isEmpty())throw Error('Empty selected capture');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'physical-choice-selected.jpg'),after.toJPEG(40));
 }catch(e){console.error('Capture failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
