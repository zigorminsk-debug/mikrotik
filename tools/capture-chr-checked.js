/* Disposable CI-only screenshot: model check, mock Windows bridge, no CHR. */
'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1200,height:850,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));
  await win.webContents.executeJavaScript(`(async()=>{
   location.hash='lab';await new Promise(r=>setTimeout(r,300));
   window.routerOS={launch:()=>{throw new Error('CHR must not launch')}};window.LAB_INSTANT=true;
   document.getElementById('lab_example_chr_isolated').click();document.getElementById('lab_run').click();
   const result=document.getElementById('lab-checked-chr');if(!result||!result.querySelector('.lab-checked-launch'))throw new Error('No result action');
   result.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,600));
  })()`);
  const img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Empty capture');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'chr-checked.jpg'),img.toJPEG(35));
 }catch(e){console.error('Screenshot failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
