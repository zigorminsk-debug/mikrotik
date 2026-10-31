/* Actual Windows Electron application; adapter is a mock, no WinBox starts. */
'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
ipcMain.handle('physical:interfaces',()=>({ok:true,interfaces:[{name:'Учебный Ethernet',address:'192.0.2.5'}]}));
ipcMain.handle('physical:discover',()=>{throw Error('Capture must never scan');});
ipcMain.handle('physical:open-winbox',()=>{throw Error('Capture must never open WinBox');});
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1000,height:900,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false,preload:path.resolve(__dirname,'../windows/preload.js')}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));win.webContents.setZoomFactor(0.85);
  await win.webContents.executeJavaScript(`(async()=>{
   location.hash='lab';await new Promise(r=>setTimeout(r,250));const id=Lab.place('router',220,120);Lab.openSettings(id);
   const button=document.getElementById('lm_open_winbox');if(!button||button.disabled||document.getElementById('lab-modal').hidden)throw Error('WinBox button unavailable');
   await new Promise(r=>setTimeout(r,700));button.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,500));
  })()`);
  const image=await win.webContents.capturePage();if(image.isEmpty())throw Error('Empty capture');
  fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'winbox-launch-button.jpg'),image.toJPEG(45));
 }catch(e){console.error('Capture failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
