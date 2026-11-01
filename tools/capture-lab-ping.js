/* Windows tutorial screenshot of a mocked bridge. Does not start CHR or ping. */
'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1200,height:1050,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));
  await win.webContents.executeJavaScript(`(async()=>{window.routerOS={launch:async()=>({ok:true}),ping:async()=>({ok:false,cancelled:true})};window.confirm=()=>true;location.hash='lab';await new Promise(r=>setTimeout(r,300));document.getElementById('lab_example_chr_isolated').click();window.Lab.run({instant:true});await new Promise(r=>setTimeout(r,150));const panel=document.querySelector('.lab-ping');if(!panel||!panel.querySelector('#lab-ping-run')||panel.querySelector('#lab-ping-run').disabled)throw Error('Missing controls');panel.scrollIntoView({block:'start'});await new Promise(r=>setTimeout(r,600));})()`);
  const img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Empty screenshot');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'guide-lab-ready.jpg'),img.toJPEG(35));
 }catch(e){console.error('Screenshot failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
