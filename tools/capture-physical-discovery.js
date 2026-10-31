/* Original Windows Electron screenshot. Interface list is a CI mock; no scan. */
'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs');const path=require('path');
app.commandLine.appendSwitch('disable-gpu');
ipcMain.handle('physical:interfaces',()=>({ok:true,interfaces:[{name:'Учебный Ethernet (пример)',address:'192.0.2.5'}]}));
ipcMain.handle('physical:discover',()=>{throw Error('Capture must never scan');});
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1000,height:900,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false,preload:path.resolve(__dirname,'../windows/preload.js')}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));win.webContents.setZoomFactor(0.85);
  await win.webContents.executeJavaScript(`(async()=>{
    location.hash='lab';await new Promise(r=>setTimeout(r,250));const id=Lab.place('router',220,120);Lab.select(id);document.getElementById('insp_cfg').click();
    const button=document.getElementById('lm_find_physical');if(!button||document.getElementById('lab-modal').hidden)throw Error('Discovery controls missing');
    await new Promise(r=>setTimeout(r,700));if(!document.getElementById('lm_physical_if').textContent.includes('Учебный Ethernet'))throw Error('Mock interface not shown');
    button.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,500));
  })()`);
  const image=await win.webContents.capturePage();if(image.isEmpty())throw Error('Empty capture');
  fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'physical-discovery.jpg'),image.toJPEG(55));
 }catch(e){console.error('Capture failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
