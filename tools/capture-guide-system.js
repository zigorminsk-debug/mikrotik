/* Disposable Windows Electron CI screenshot of the guide, no CHR or network. */
'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1200,height:1050,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));
  await win.webContents.executeJavaScript(`(async()=>{location.hash='ros-system';await new Promise(r=>setTimeout(r,300));const root=document.querySelector('.guide-lab');root.querySelector('button').click();const identity=root.querySelector('input[value="identity"]'),ntp=root.querySelector('input[value="ntp"]'),system=root.querySelector('input[value="log-system"]'),intf=root.querySelector('input[value="log-interface"]'),cloud=root.querySelector('input[value="cloud"]');if(!identity||!identity.checked||!ntp||!system||!intf||!cloud||!cloud.disabled)throw Error('Invalid System choices');for(const box of [ntp,system,intf]){if(box.disabled)throw Error('System choice unavailable');box.checked=true;box.dispatchEvent(new Event('change'));}if(root.querySelector('.guide-lab-start').disabled)throw Error('System choice blocked');root.scrollIntoView({block:'start'});await new Promise(r=>setTimeout(r,600));})()`);
  const img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Empty screenshot');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'guide-lab-ready.jpg'),img.toJPEG(35));
 }catch(e){console.error('Screenshot failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
