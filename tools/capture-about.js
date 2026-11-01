/* Disposable Windows Electron screenshot: About page, no CHR. */
'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1200,height:1050,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));
  await win.webContents.executeJavaScript(`(async()=>{location.hash='about';await new Promise(r=>setTimeout(r,500));const nav=document.getElementById('nav');nav.scrollTop=nav.scrollHeight;const entry=document.querySelector('.release-entry[open]');if(!entry||!document.getElementById('content').textContent.includes('О программе')||!entry.textContent.includes(window.APP_VERSION)||document.querySelectorAll('.release-entry').length<2)throw Error('History not visible');await new Promise(r=>setTimeout(r,400));})()`);
  const img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Empty screenshot');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'guide-lab-ready.jpg'),img.toJPEG(35));
 }catch(e){console.error('Screenshot failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
