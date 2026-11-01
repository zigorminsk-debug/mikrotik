/* CI-only Windows Electron screenshots; no CHR or network is started. */
'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1200,height:1050,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));
  await win.webContents.executeJavaScript(`(async()=>{location.hash='ros-ip';await new Promise(r=>setTimeout(r,300));const root=document.querySelector('.guide-lab');root.querySelector('button').click();const publication=root.querySelector('input[value=publication]');if(!publication||publication.disabled)throw Error('No publication option');publication.checked=true;publication.dispatchEvent(new Event('change'));root.scrollIntoView({block:'start'});await new Promise(r=>setTimeout(r,600));})()`);
  let img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Empty ready capture');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'guide-lab-ready.jpg'),img.toJPEG(35));
  await win.webContents.executeJavaScript(`(async()=>{const root=document.querySelector('.guide-lab');const box=root.querySelector('input[value="wan-dhcp"]');box.checked=true;box.dispatchEvent(new Event('change'));if(!root.querySelector('.guide-lab-start').disabled)throw Error('Conflict not blocked');root.querySelector('.guide-lab-errors').scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,600));})()`);
  img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Empty conflict capture');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'guide-lab-conflict.jpg'),img.toJPEG(35));
 }catch(e){console.error('Screenshot failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
