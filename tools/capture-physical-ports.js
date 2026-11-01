/* Windows Electron screenshots: synthetic names and schema; no router access. */
'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
ipcMain.handle('physical:interfaces',()=>({ok:true,interfaces:[{name:'Учебный Ethernet',address:'192.0.2.5'}]}));
ipcMain.handle('physical:discover',()=>{throw Error('Capture must not scan');});
ipcMain.handle('physical:open-winbox',()=>{throw Error('Capture must not open WinBox');});
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1000,height:900,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false,preload:path.resolve(__dirname,'../windows/preload.js')}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));win.webContents.setZoomFactor(.85);
  await win.webContents.executeJavaScript(`(async()=>{
    location.hash='lab';await new Promise(r=>setTimeout(r,300));
    const isp=Lab.place('isp',80,10),rt=Lab.place('router',80,140),pc=Lab.place('pc',80,280);Lab.link(isp,rt);Lab.link(rt,pc);
    Object.assign(Lab.state.devices.find(x=>x.id===isp).cfg,{kind:'static',ip:'198.51.100.2/30',gw:'198.51.100.1',dns:'1.1.1.1'});
    Lab.openSettings(rt);await new Promise(r=>setTimeout(r,500));
    const input=document.getElementById('lm_manual_ports');if(!input||document.getElementById('lab-modal').hidden)throw Error('Input not available');
    input.value='ether1, ether5';input.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,700));
  })()`);
  let image=await win.webContents.capturePage();if(image.isEmpty())throw Error('Empty input capture');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'physical-ports-entry.jpg'),image.toJPEG(40));
  await win.webContents.executeJavaScript(`(async()=>{
    document.getElementById('lm_preview_physical').click();await new Promise(r=>setTimeout(r,800));
    const result=document.getElementById('physical-preview');const section=document.getElementById('physical-ports-comparison');
    if(!result||!section||!result.textContent.includes('ether2: нет во введённом списке')||!result.textContent.includes('Применение недоступно'))throw Error('Expected comparison absent');
    section.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,800));
  })()`);
  image=await win.webContents.capturePage();if(image.isEmpty())throw Error('Empty comparison capture');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'physical-ports-result.jpg'),image.toJPEG(40));
 }catch(e){console.error('Capture failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
