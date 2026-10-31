/* Original Windows Electron screenshots of a synthetic diagram. No network scan. */
'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
ipcMain.handle('physical:interfaces',()=>({ok:true,interfaces:[{name:'Учебный Ethernet',address:'192.0.2.5'}]}));
ipcMain.handle('physical:discover',()=>{throw Error('Capture must never scan');});
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1000,height:900,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false,preload:path.resolve(__dirname,'../windows/preload.js')}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));win.webContents.setZoomFactor(0.85);
  await win.webContents.executeJavaScript(`(async()=>{
    location.hash='lab';await new Promise(r=>setTimeout(r,300));
    const isp=Lab.place('isp',80,10),rt=Lab.place('router',80,140),pc=Lab.place('pc',80,280);
    Lab.link(isp,rt);Lab.link(rt,pc);
    const provider=Lab.state.devices.find(x=>x.id===isp);
    Object.assign(provider.cfg,{kind:'static',ip:'198.51.100.2/30',gw:'198.51.100.1',dns:'1.1.1.1'});
    Lab.openSettings(rt);await new Promise(r=>setTimeout(r,500));
    const button=document.getElementById('lm_preview_physical');if(!button||document.getElementById('lab-modal').hidden)throw Error('Preview button missing');
    button.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,700));
  })()`);
  let image=await win.webContents.capturePage();if(image.isEmpty())throw Error('Empty button capture');
  fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'physical-preview-button.jpg'),image.toJPEG(45));
  await win.webContents.executeJavaScript(`(async()=>{
    document.getElementById('lm_preview_physical').click();await new Promise(r=>setTimeout(r,1000));
    const p=document.getElementById('physical-preview');if(!p || !p.textContent.includes('Применение недоступно') || !p.textContent.includes('Предполагаемые порты'))throw Error('Expected preview not shown');
    p.scrollIntoView({block:'start'});await new Promise(r=>setTimeout(r,800));
  })()`);
  image=await win.webContents.capturePage();if(image.isEmpty())throw Error('Empty preview capture');
  fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'physical-preview-result.jpg'),image.toJPEG(45));
 }catch(e){console.error('Capture failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
