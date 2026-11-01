/* Disposable Windows Electron CI screenshot of the guide, no CHR or network. */
'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1200,height:1050,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));
  await win.webContents.executeJavaScript(`(async()=>{location.hash='ros-log';await new Promise(r=>setTimeout(r,300));const root=document.querySelector('.guide-lab');root.querySelector('button').click();const box=root.querySelector('input[value="log-system"]'),intf=root.querySelector('input[value="log-interface"]'),remote=root.querySelector('input[value="log-remote"]');if(!box||!box.checked||box.disabled||!intf||intf.disabled||!remote||!remote.disabled)throw Error('Invalid log choices');intf.checked=true;intf.dispatchEvent(new Event('change'));if(root.querySelector('.guide-lab-start').disabled)throw Error('Log choice blocked');root.scrollIntoView({block:'start'});await new Promise(r=>setTimeout(r,600));})()`);
  const img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Empty screenshot');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'guide-lab-ready.jpg'),img.toJPEG(35));
 }catch(e){console.error('Screenshot failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
